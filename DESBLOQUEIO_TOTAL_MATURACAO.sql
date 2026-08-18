-- ============================================================
-- DESBLOQUEIO TOTAL DA MATURAÇÃO — Neon Warm / Neon Dev
-- ============================================================
-- Data: 2026-08-18 · Objetivo: voltar a parear como ANTES dos planos.
--
-- O HOTFIX no código já DESLIGOU o enforcement de planos no /pair
-- (flag NEON_WARM_ENFORCE_PLANS, padrão desligado). Este SQL limpa
-- os estados que travavam o pareamento no banco, para garantir que
-- NADA bloqueie os números:
--
--   - todos os planos voltam para status = 'active'
--   - remove pausas (paused_at / paused_reason)
--   - zera intervalo de ciclo (cycle_seconds) e limite diário
--   - zera limite de ciclos (cycle_limit) e contador
--
-- ⚠️ O número marcado como BANIDO (5511958856990) NÃO é alterado aqui
--    de propósito: ele foi marcado por você no painel. Se ele não está
--    mais banido no WhatsApp, desmarque no painel (✓ Desmarcar) ou rode
--    o UPDATE comentado no final.
-- ============================================================

begin;

-- 1. Todos os planos voltam para active (desfaz pausas manuais/limites).
update public.neon_warm_maturation_plans
set status = 'active',
    paused_at = null,
    paused_reason = null;

-- 2. Remove intervalo mínimo entre ciclos (acelerava/retardava demais).
update public.neon_warm_maturation_plans
set cycle_seconds = null;

-- 3. Remove limite diário de envios.
update public.neon_warm_maturation_plans
set daily_msg_limit = null;

-- 4. Remove limite de ciclos e zera o contador.
update public.neon_warm_maturation_plans
set cycle_limit = null,
    cycles_done = 0;

-- 5. (OPCIONAL) Desmarcar o número que foi marcado como banido.
--    Descomente APENAS se o número 5511958856990 NÃO está banido no
--    WhatsApp e deve voltar a parear:
--
-- update public.neon_warm_maturation_plans
-- set status = 'active',
--     flag_reason = null,
--     flagged_at = null,
--     flagged_by = null
-- where phone_number_normalized = '5511958856990';

commit;

-- Verificação: tudo deve estar active, sem limites, sem intervalo.
select phone_number_normalized, status, paused_reason, daily_msg_limit,
       cycle_seconds, cycle_limit, cycles_done, flag_reason
from public.neon_warm_maturation_plans
order by phone_number_normalized;
