-- ============================================================
-- 00010_neon_warm_rotation_config.sql
-- ============================================================
-- CONFIGURAÇÃO DA ROTAÇÃO AUTOMÁTICA DE PARCEIROS (100% backend).
--
-- Problema que resolve: com 3+ números ativos, os pares podem ficar
-- FIXOS (ex.: A sempre pareia com B) se a extensão do cliente não
-- mandar rotate:true a cada ciclo. Esta feature faz o SERVIDOR forçar
-- a rotação independentemente da extensão.
--
-- Config (uma linha, id=1):
--   enabled      boolean  → rotação automática ligada/desligada no painel
--   min_online   integer  → só rotaciona quando houver PELO MENOS este
--                           número de contas online (evita loop com poucos
--                           chips). Padrão: 3.
--
-- Quando enabled e o nº de sessões online >= min_online, o /pair trata
-- cada ciclo como rotate=true: encerra pares confirmados e escolhe um
-- parceiro que NÃO interagiu recentemente (round-robin, já implementado
-- em pairing-core). Nada muda na extensão.
--
-- RLS igual às demais (sem políticas, acesso só via service role).
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

-- Linha única padrão (id=1), desligada por padrão (comportamento atual).
insert into public.neon_warm_rotation_config (id, enabled, min_online)
values (1, false, 3)
on conflict (id) do nothing;

alter table public.neon_warm_rotation_config enable row level security;

drop trigger if exists trg_neon_warm_rotation_config_updated on public.neon_warm_rotation_config;
create trigger trg_neon_warm_rotation_config_updated
  before update on public.neon_warm_rotation_config
  for each row execute function public.neon_warm_set_updated_at();

commit;
