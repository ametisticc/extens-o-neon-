-- ============================================================
-- TODAS AS MIGRATIONS PENDENTES — Neon Warm / Neon Dev
-- ============================================================
-- Rode ESTE arquivo INTEIRO (em ordem) no SQL Editor do projeto
-- CORRETO:  https://kbleuokrrmhchpknuyfi.supabase.co
--
-- Contém, em sequência:
--   00007 → cria neon_warm_maturation_plans + neon_warm_daily_stats
--           + stats_counted + RPC neon_warm_bump_daily_stats
--   00008 → cycle_limit + cycles_done (limite de ciclos)
--   00009 → status banido/restrito + flag_reason/flagged_at/flagged_by
--   00010 → neon_warm_rotation_config (rotação automática de parceiros)
--
-- É seguro rodar de novo (usa IF NOT EXISTS / drop constraint), mas o
-- ideal é rodar UMA vez. Depois, rode o bloco de VERIFICAÇÃO no final.
--
-- ⚠️ Se o erro "Could not find the table in the schema cache" persistir
--    DEPOIS de rodar, o problema é a SUPABASE_URL na Vercel apontando
--    para OUTRO projeto — aí este arquivo não resolve (os dados estão
--    em outro banco).
-- ============================================================

-- ============================================================
-- PARTE 1 — 00007_neon_warm_maturation_plans.sql
-- ============================================================

begin;

create table if not exists public.neon_warm_maturation_plans (
  id uuid primary key default gen_random_uuid(),
  phone_number_normalized text not null unique,
  daily_msg_limit integer,
  cycle_seconds integer,
  auto_resume_daily boolean not null default true,
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

alter table public.neon_warm_pairs
  add column if not exists stats_counted boolean not null default false;

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

drop trigger if exists trg_neon_warm_maturation_plans_updated on public.neon_warm_maturation_plans;
create trigger trg_neon_warm_maturation_plans_updated
  before update on public.neon_warm_maturation_plans
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_daily_stats_updated on public.neon_warm_daily_stats;
create trigger trg_neon_warm_daily_stats_updated
  before update on public.neon_warm_daily_stats
  for each row execute function public.neon_warm_set_updated_at();

commit;

-- ============================================================
-- PARTE 2 — 00008_neon_warm_cycle_limit.sql
-- ============================================================

begin;

alter table public.neon_warm_maturation_plans
  add column if not exists cycle_limit integer;

alter table public.neon_warm_maturation_plans
  add column if not exists cycles_done integer not null default 0;

alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_cycle_limit_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_cycle_limit_check
    check (cycle_limit is null or cycle_limit >= 1);

alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_cycles_done_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_cycles_done_check
    check (cycles_done >= 0);

commit;

-- ============================================================
-- PARTE 3 — 00009_neon_warm_ban_restricao.sql
-- ============================================================

begin;

alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_status_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_status_check
    check (status in ('active', 'paused', 'banned', 'restricted'));

alter table public.neon_warm_maturation_plans
  add column if not exists flag_reason text;
alter table public.neon_warm_maturation_plans
  add column if not exists flagged_at timestamptz;
alter table public.neon_warm_maturation_plans
  add column if not exists flagged_by text;

commit;

-- ============================================================
-- PARTE 4 — 00010_neon_warm_rotation_config.sql
-- ============================================================

begin;

create table if not exists public.neon_warm_rotation_config (
  id integer primary key,
  enabled boolean not null default false,
  min_online integer not null default 3,
  updated_at timestamptz not null default now(),
  constraint neon_warm_rotation_config_min_online_check
    check (min_online >= 2)
);

insert into public.neon_warm_rotation_config (id, enabled, min_online)
values (1, false, 3)
on conflict (id) do nothing;

alter table public.neon_warm_rotation_config enable row level security;

drop trigger if exists trg_neon_warm_rotation_config_updated on public.neon_warm_rotation_config;
create trigger trg_neon_warm_rotation_config_updated
  before update on public.neon_warm_rotation_config
  for each row execute function public.neon_warm_set_updated_at();

commit;

-- ============================================================
-- VERIFICAÇÃO (rode depois)
-- ============================================================
-- Deve retornar as 4 linhas com created_at preenchido:
select 'neon_warm_maturation_plans' as tabela,
       to_regclass('public.neon_warm_maturation_plans') as existe,
       (select count(*) from public.neon_warm_maturation_plans) as linhas
union all
select 'neon_warm_daily_stats',
       to_regclass('public.neon_warm_daily_stats'),
       (select count(*) from public.neon_warm_daily_stats)
union all
select 'coluna cycle_limit',
       to_regclass('public.neon_warm_maturation_plans'),
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='neon_warm_maturation_plans'
           and column_name='cycle_limit')
union all
select 'coluna flag_reason',
       to_regclass('public.neon_warm_maturation_plans'),
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='neon_warm_maturation_plans'
           and column_name='flag_reason')
union all
select 'neon_warm_rotation_config',
       to_regclass('public.neon_warm_rotation_config'),
       (select count(*) from public.neon_warm_rotation_config);

-- Força o PostgREST a recarregar o schema (resolve o "schema cache"):
notify pgrst, 'reload schema';
