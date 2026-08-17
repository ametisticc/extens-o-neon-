-- ============================================================
-- Neon Warm Backend — Migration 00003: Opt-in de pareamento
-- ------------------------------------------------------------
-- Adiciona a coluna pairing_enabled em neon_warm_numbers.
-- O pareamento SÓ acontece entre números com pairing_enabled = true.
-- NULL (padrão) é tratado como false no servidor? NÃO — ver nota:
--
--   IMPORTANTE: no código, NULL é interpretado como "elegível"
--   (backward compatibility). Para desabilitar explicitamente um
--   número, defina pairing_enabled = false.
--
-- Valor padrão: true (números existentes continuam elegíveis).
-- ============================================================

begin;

alter table public.neon_warm_numbers
  add column if not exists pairing_enabled boolean not null default true;

comment on column public.neon_warm_numbers.pairing_enabled is
  'Opt-in para pareamento. false desabilita o número como alvo de par.';

commit;
