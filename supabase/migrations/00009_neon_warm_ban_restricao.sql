-- ============================================================
-- 00009_neon_warm_ban_restricao.sql
-- ============================================================
-- MARCAÇÃO DE CONTA BANIDA / RESTRITA por número (complemento ao plano
-- de maturação).
--
-- Objetivo: quando o WhatsApp bane (conta suspensa/bloqueada) ou
-- RESTRINGE (envios limitados temporariamente) uma conta, o operador
-- marca isso no painel. O backend então:
--   1. BLOQUEIA o pareamento desse número (o /pair responde 503, e a
--      extensão atual espera/retenta — SEGURANÇA por não expor o número
--      a novos pares quando a conta está penalizada).
--   2. EXCLUI o número de ser escolhido como parceiro de outros chips
--      (não recebe par novo de ninguém).
--   3. (No painel) libera os pares ativos que envolvem o número.
--
-- Nada muda na extensão: ela continua chamando /pair a cada ciclo e
-- obedecendo o 503. Status novos:
--   'banned'      → banimento definitivo (só o operador desmarca)
--   'restricted'  → restrição temporária (o operador pode desmarcar)
-- Colunas novas:
--   flag_reason  text   → motivo informado pelo operador (opcional)
--   flagged_at   timestamptz → quando foi marcado
--   flagged_by   text   → quem marcou (email/session do admin)
--
-- RLS igual às demais (sem políticas, acesso só via service role).
-- ============================================================

begin;

-- Alarga o CHECK de status para aceitar os dois novos estados.
alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_status_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_status_check
    check (status in ('active', 'paused', 'banned', 'restricted'));

-- Motivo / metadados da marcação (opcional).
alter table public.neon_warm_maturation_plans
  add column if not exists flag_reason text;
alter table public.neon_warm_maturation_plans
  add column if not exists flagged_at timestamptz;
alter table public.neon_warm_maturation_plans
  add column if not exists flagged_by text;

commit;
