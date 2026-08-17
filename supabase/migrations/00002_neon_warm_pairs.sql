-- ============================================================
-- Neon Warm Backend — Migration 00002: Pareamento de chips
-- ------------------------------------------------------------
-- Rota /api/maturador/pair: quando um chip conectado pela extensão
-- pede um par, o servidor encontra outro chip que também está com a
-- extensão conectada e devolve esse número para os dois trocarem
-- mensagens entre si (maturação real entre chips da própria rede).
--
-- Ciclo de vida de um par:
--   waiting    primeiro chip criou; aguardando o segundo chamar /pair
--   paired     ambos os lados já chamaram /pair (têm o número um do outro)
--   confirmed  ambos os lados confirmaram via /validate (prontos p/ enviar)
--   ended      par encerrado (tempo esgotado / liberado)
--
-- confirmed_a / confirmed_b: controle individual de confirmação.
-- O status 'confirmed' só é atingido quando os DOIS são true.
--
-- Segurança:
--  - service_role (server-side, Vercel) ignora RLS e é a única via
--    de acesso usada pelas API Routes.
--  - RLS habilitado SEM políticas = nenhum acesso por chave anônima.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- PARES DE MATURAÇÃO
-- ------------------------------------------------------------
create table if not exists public.neon_warm_pairs (
  id uuid primary key default gen_random_uuid(),
  chip_a text not null,
  chip_b text not null,
  status text not null default 'waiting',
  confirmed_a boolean not null default false,
  confirmed_b boolean not null default false,
  last_seen_a timestamptz not null default now(),
  last_seen_b timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_pairs_chips_distinct check (chip_a <> chip_b),
  constraint neon_warm_pairs_status_check
    check (status in ('waiting', 'paired', 'confirmed', 'ended'))
);

create index if not exists idx_neon_warm_pairs_a
  on public.neon_warm_pairs (chip_a, status);
create index if not exists idx_neon_warm_pairs_b
  on public.neon_warm_pairs (chip_b, status);
create index if not exists idx_neon_warm_pairs_status_created
  on public.neon_warm_pairs (status, created_at);

-- Garante que um chip não pode aparecer 2x no MESMO par ativo.
create unique index if not exists uq_neon_warm_pairs_active_pair
  on public.neon_warm_pairs (
    greatest(chip_a, chip_b),
    least(chip_a, chip_b)
  )
  where status <> 'ended';

-- ------------------------------------------------------------
-- Trigger de updated_at
-- ------------------------------------------------------------
drop trigger if exists trg_neon_warm_pairs_updated on public.neon_warm_pairs;
create trigger trg_neon_warm_pairs_updated
  before update on public.neon_warm_pairs
  for each row execute function public.neon_warm_set_updated_at();

commit;
