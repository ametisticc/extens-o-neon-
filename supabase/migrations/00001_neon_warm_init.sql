-- ============================================================
-- Neon Warm Backend — Migration inicial
-- Tabelas: users, plans, subscriptions, numbers, licenses,
--          devices, sessions, logs, extension_keys
--
-- Segurança:
--  - service_role (server-side, Vercel) ignora RLS e é a única
--    via de acesso usada pelas API Routes / painel admin.
--  - RLS habilitado nas tabelas SEM políticas = nenhum acesso
--    via chave anônima. Defesa em profundidade.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Helper: atualiza updated_at automaticamente
-- ------------------------------------------------------------
create or replace function public.neon_warm_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- USUÁRIOS (donos de contas/licenças)
-- ------------------------------------------------------------
create table if not exists public.neon_warm_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_users_status_check check (status in ('active', 'inactive', 'blocked'))
);

-- ------------------------------------------------------------
-- PLANOS
-- ------------------------------------------------------------
create table if not exists public.neon_warm_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  neon_warm_enabled boolean not null default true,
  max_numbers integer not null default 1,
  max_devices integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_plans_max_numbers_check check (max_numbers >= 1),
  constraint neon_warm_plans_max_devices_check check (max_devices >= 1)
);

-- ------------------------------------------------------------
-- ASSINATURAS
-- ------------------------------------------------------------
create table if not exists public.neon_warm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.neon_warm_users(id) on delete cascade,
  plan_id uuid not null references public.neon_warm_plans(id) on delete restrict,
  status text not null default 'pending',
  started_at timestamptz,
  expires_at timestamptz,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_subscriptions_status_check
    check (status in ('active', 'pending', 'expired', 'cancelled', 'suspended'))
);

create index if not exists idx_neon_warm_subscriptions_user
  on public.neon_warm_subscriptions (user_id, status);
create index if not exists idx_neon_warm_subscriptions_plan
  on public.neon_warm_subscriptions (plan_id);

-- ------------------------------------------------------------
-- NÚMEROS DE WHATSAPP (autorizados)
-- ------------------------------------------------------------
create table if not exists public.neon_warm_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.neon_warm_users(id) on delete set null,
  phone_number text not null,
  phone_number_normalized text not null unique,
  status text not null default 'active',
  verified_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_numbers_status_check
    check (status in ('active', 'blocked', 'inactive'))
);

create index if not exists idx_neon_warm_numbers_user
  on public.neon_warm_numbers (user_id);
create index if not exists idx_neon_warm_numbers_normalized
  on public.neon_warm_numbers (phone_number_normalized);
create index if not exists idx_neon_warm_numbers_status
  on public.neon_warm_numbers (status);

-- ------------------------------------------------------------
-- LICENÇAS
-- ------------------------------------------------------------
create table if not exists public.neon_warm_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.neon_warm_users(id) on delete cascade,
  phone_number_id uuid references public.neon_warm_numbers(id) on delete set null,
  plan_id uuid references public.neon_warm_plans(id) on delete restrict,
  status text not null default 'inactive',
  license_key text not null unique,
  activated_at timestamptz,
  expires_at timestamptz,
  last_validation_at timestamptz,
  last_extension_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_licenses_status_check
    check (status in ('active', 'inactive', 'expired', 'revoked', 'blocked'))
);

create index if not exists idx_neon_warm_licenses_user
  on public.neon_warm_licenses (user_id);
create index if not exists idx_neon_warm_licenses_phone
  on public.neon_warm_licenses (phone_number_id);
create index if not exists idx_neon_warm_licenses_status
  on public.neon_warm_licenses (status);

-- ------------------------------------------------------------
-- DISPOSITIVOS
-- ------------------------------------------------------------
create table if not exists public.neon_warm_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.neon_warm_users(id) on delete set null,
  phone_number_id uuid references public.neon_warm_numbers(id) on delete set null,
  extension_id text not null,
  device_id text not null,
  browser text,
  operating_system text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_devices_status_check
    check (status in ('active', 'blocked', 'inactive')),
  constraint neon_warm_devices_unique_pair
    unique (extension_id, device_id)
);

create index if not exists idx_neon_warm_devices_user
  on public.neon_warm_devices (user_id);
create index if not exists idx_neon_warm_devices_phone
  on public.neon_warm_devices (phone_number_id);
create index if not exists idx_neon_warm_devices_device
  on public.neon_warm_devices (device_id);

-- ------------------------------------------------------------
-- SESSÕES
-- ------------------------------------------------------------
create table if not exists public.neon_warm_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.neon_warm_users(id) on delete set null,
  phone_number_id uuid references public.neon_warm_numbers(id) on delete set null,
  device_id uuid references public.neon_warm_devices(id) on delete set null,
  session_token_hash text not null unique,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint neon_warm_sessions_status_check
    check (status in ('active', 'expired', 'revoked', 'ended'))
);

create index if not exists idx_neon_warm_sessions_user
  on public.neon_warm_sessions (user_id);
create index if not exists idx_neon_warm_sessions_phone
  on public.neon_warm_sessions (phone_number_id);
create index if not exists idx_neon_warm_sessions_status
  on public.neon_warm_sessions (status);
create index if not exists idx_neon_warm_sessions_hash
  on public.neon_warm_sessions (session_token_hash);

-- ------------------------------------------------------------
-- LOGS
-- ------------------------------------------------------------
create table if not exists public.neon_warm_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  phone_number_id uuid,
  device_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_neon_warm_logs_created
  on public.neon_warm_logs (created_at desc);
create index if not exists idx_neon_warm_logs_event
  on public.neon_warm_logs (event_type);
create index if not exists idx_neon_warm_logs_phone
  on public.neon_warm_logs (phone_number_id);

-- ------------------------------------------------------------
-- CHAVES DE EXTENSÃO (API keys do cliente)
-- ------------------------------------------------------------
-- Autenticação extensão -> API. A chave completa é conhecida apenas
-- pelo operador/dono da extensão; no banco guardamos apenas o HASH
-- (sha256). A extensão envia a chave no header X-NeonWarm-Key.
create table if not exists public.neon_warm_extension_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  extension_id text not null,
  status text not null default 'active',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neon_warm_extension_keys_status_check
    check (status in ('active', 'revoked'))
);

create index if not exists idx_neon_warm_extension_keys_hash
  on public.neon_warm_extension_keys (key_hash);

-- ------------------------------------------------------------
-- Triggers de updated_at
-- ------------------------------------------------------------
drop trigger if exists trg_neon_warm_users_updated on public.neon_warm_users;
create trigger trg_neon_warm_users_updated
  before update on public.neon_warm_users
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_plans_updated on public.neon_warm_plans;
create trigger trg_neon_warm_plans_updated
  before update on public.neon_warm_plans
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_subscriptions_updated on public.neon_warm_subscriptions;
create trigger trg_neon_warm_subscriptions_updated
  before update on public.neon_warm_subscriptions
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_numbers_updated on public.neon_warm_numbers;
create trigger trg_neon_warm_numbers_updated
  before update on public.neon_warm_numbers
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_licenses_updated on public.neon_warm_licenses;
create trigger trg_neon_warm_licenses_updated
  before update on public.neon_warm_licenses
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_devices_updated on public.neon_warm_devices;
create trigger trg_neon_warm_devices_updated
  before update on public.neon_warm_devices
  for each row execute function public.neon_warm_set_updated_at();

drop trigger if exists trg_neon_warm_extension_keys_updated on public.neon_warm_extension_keys;
create trigger trg_neon_warm_extension_keys_updated
  before update on public.neon_warm_extension_keys
  for each row execute function public.neon_warm_set_updated_at();

-- ------------------------------------------------------------
-- RLS — habilitado sem políticas (acesso apenas via service role)
-- ------------------------------------------------------------
alter table public.neon_warm_users enable row level security;
alter table public.neon_warm_plans enable row level security;
alter table public.neon_warm_subscriptions enable row level security;
alter table public.neon_warm_numbers enable row level security;
alter table public.neon_warm_licenses enable row level security;
alter table public.neon_warm_devices enable row level security;
alter table public.neon_warm_sessions enable row level security;
alter table public.neon_warm_logs enable row level security;
alter table public.neon_warm_extension_keys enable row level security;

-- ------------------------------------------------------------
-- Plano padrão inicial (opcional — pode ser removido)
-- ------------------------------------------------------------
insert into public.neon_warm_plans (name, description, price, active, neon_warm_enabled, max_numbers, max_devices)
values
  ('Neon Warm Trial', 'Plano de teste — acesso Neon Warm limitado', 0, true, true, 1, 1)
on conflict (name) do nothing;

commit;
