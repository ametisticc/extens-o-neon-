-- ============================================================
-- 00007_neon_warm_maturation_plans.sql
-- ============================================================
-- PLANOS DE MATURAÇÃO POR NÚMERO (100% backend).
--
-- Objetivo: o operador configura, no painel, um plano de maturação
-- para cada número conectado (limite diário de mensagens + intervalo
-- mínimo entre ciclos). A extensão atual (NeonDev v1.0.4 / Neon Warm
-- v1.0.5) JÁ OBEDECE de forma implícita: quando o backend responde
-- HTTP 503 no /pair (code 0), ela espera 15s e tenta de novo — sem
-- cair na lista local de alvos. Assim o limite/pausa é aplicado 100%
-- no servidor, SEM desinstalar/reinstalar a extensão dos clientes.
--
-- Além do limite, o backend conta, por número e por dia, quantas
-- mensagens foram ENVIADAS e RECEBIDAS (1 par confirmado = 1 envio +
-- 1 recebimento por cada lado), alimentando o dashboard do painel e a
-- sugestão automática de plano.
--
-- Segurança:
--  - RLS habilitado SEM políticas (acesso apenas via service role,
--    mesma regra das demais tabelas neon_warm_*).
--  - NUNCA expõe conteúdo de mensagens — só contadores.
--  - phone_number_normalized é usado como chave natural (mesmo
--    formato já usado em neon_warm_pairs).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- PLANOS DE MATURAÇÃO (1 por número)
-- ------------------------------------------------------------
create table if not exists public.neon_warm_maturation_plans (
  id uuid primary key default gen_random_uuid(),
  phone_number_normalized text not null unique,
  -- Limite de mensagens ENVIADAS por dia. NULL = ilimitado.
  daily_msg_limit integer,
  -- Intervalo mínimo entre ciclos (segundos). NULL = padrão da extensão.
  cycle_seconds integer,
  -- Desbloqueia sozinho no dia seguinte (limite diário).
  auto_resume_daily boolean not null default true,
  -- status:
  --   active  → pareamento normal (respeita limite + ciclo)
  --   paused  → pareamento suspenso até o operador aprovar/continuar
  --             (ou até virar o dia, se auto_resume_daily = true)
  status text not null default 'active',
  paused_at timestamptz,
  paused_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_maturation_plans_status_check
    check (status in ('active', 'paused')),
  constraint neon_warm_maturation_plans_limit_check
    check (daily_msg_limit is null or daily_msg_limit >= 1),
  constraint neon_warm_maturation_plans_cycle_check
    check (cycle_seconds is null or cycle_seconds >= 30)
);

create index if not exists idx_neon_warm_maturation_plans_phone
  on public.neon_warm_maturation_plans (phone_number_normalized);
create index if not exists idx_neon_warm_maturation_plans_status
  on public.neon_warm_maturation_plans (status);

-- ------------------------------------------------------------
-- ESTATÍSTICAS DIÁRIAS POR NÚMERO
-- ------------------------------------------------------------
-- Uma linha por (número, dia). stats_date é texto 'YYYY-MM-DD' (fuso do
-- operador — quem chama a RPC já manda a data no fuso correto).
create table if not exists public.neon_warm_daily_stats (
  id uuid primary key default gen_random_uuid(),
  phone_number_normalized text not null,
  stats_date text not null,
  sent_count integer not null default 0,
  received_count integer not null default 0,
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_daily_stats_date_len check (char_length(stats_date) = 10),
  constraint neon_warm_daily_stats_counts_check
    check (sent_count >= 0 and received_count >= 0),
  constraint neon_warm_daily_stats_unique_day
    unique (phone_number_normalized, stats_date)
);

create index if not exists idx_neon_warm_daily_stats_phone
  on public.neon_warm_daily_stats (phone_number_normalized, stats_date);

alter table public.neon_warm_maturation_plans enable row level security;
alter table public.neon_warm_daily_stats enable row level security;

-- ------------------------------------------------------------
-- Coluna stats_counted em neon_warm_pairs (contagem anti-duplicação)
-- ------------------------------------------------------------
-- Quando um par chega a confirmed (ambos os lados), o /validate conta
-- +1 para cada lado. stats_counted evita contar o MESMO par 2x
-- (a confirmação vem dos dois lados). O update é atômico
-- (where stats_counted = false), então só um lado incrementa.
alter table public.neon_warm_pairs
  add column if not exists stats_counted boolean not null default false;

-- ------------------------------------------------------------
-- RPC: incrementa as estatísticas do dia de um número
-- ------------------------------------------------------------
-- idempotente por (número, dia): upsert com incremento.
-- Retorna as contagens atualizadas do dia.
create or replace function public.neon_warm_bump_daily_stats(
  p_phone text,
  p_date text,
  p_sent_delta integer default 0,
  p_received_delta integer default 0
)
returns table (sent integer, received integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent int;
  v_received int;
begin
  insert into public.neon_warm_daily_stats
    (phone_number_normalized, stats_date, sent_count, received_count,
     first_activity_at, last_activity_at)
  values
    (p_phone, p_date, greatest(p_sent_delta, 0), greatest(p_received_delta, 0),
     now(), now())
  on conflict (phone_number_normalized, stats_date)
  do update set
    sent_count = public.neon_warm_daily_stats.sent_count + greatest(p_sent_delta, 0),
    received_count = public.neon_warm_daily_stats.received_count + greatest(p_received_delta, 0),
    last_activity_at = now(),
    updated_at = now();

  select sent_count, received_count
    into v_sent, v_received
    from public.neon_warm_daily_stats
   where phone_number_normalized = p_phone
     and stats_date = p_date;

  return query select coalesce(v_sent, 0), coalesce(v_received, 0);
end;
$$;

-- ------------------------------------------------------------
-- Triggers de updated_at
-- ------------------------------------------------------------
drop trigger if exists trg_neon_warm_maturation_plans_updated on public.neon_warm_maturation_plans;
create trigger trg_neon_warm_maturation_plans_updated
  before update on public.neon_warm_maturation_plans
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_daily_stats_updated on public.neon_warm_daily_stats;
create trigger trg_neon_warm_daily_stats_updated
  before update on public.neon_warm_daily_stats
  for each row execute function public.neon_warm_set_updated_at();

commit;
