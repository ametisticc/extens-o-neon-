-- ============================================================
-- 00008_neon_warm_cycle_limit.sql
-- ============================================================
-- LIMITE DE CICLOS por número (complemento ao plano de maturação).
--
-- Objetivo: o operador define, no painel, quantos CICLOS o número deve
-- fazer antes de pausar sozinho. Um ciclo = 1 par confirmado (ambos os
-- lados confirmaram e trocaram mensagens). Quando o número atinge
-- cycle_limit, o plano é pausado automaticamente (paused_reason =
-- 'cycle_limit') até o operador liberar de novo (botão Continuar).
--
--  cycle_limit  integer  NULL  → quantos ciclos fazer (NULL = sem limite)
--  cycles_done  integer  NULL  → quantos ciclos já feitos
--
-- RLS igual às demais (sem políticas, acesso só via service role).
-- ============================================================

begin;

alter table public.neon_warm_maturation_plans
  add column if not exists cycle_limit integer;

alter table public.neon_warm_maturation_plans
  add column if not exists cycles_done integer not null default 0;

-- Se cycle_limit for informado, precisa ser >= 1.
alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_cycle_limit_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_cycle_limit_check
    check (cycle_limit is null or cycle_limit >= 1);

-- cycles_done nunca pode ser negativa.
alter table public.neon_warm_maturation_plans
  drop constraint if exists neon_warm_maturation_plans_cycles_done_check;
alter table public.neon_warm_maturation_plans
  add constraint neon_warm_maturation_plans_cycles_done_check
    check (cycles_done >= 0);

commit;
