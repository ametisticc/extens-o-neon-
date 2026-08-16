-- ============================================================
-- Seed de desenvolvimento para o Neon Warm Backend
--
-- Cria um usuário + plano + assinatura + número + licença ativa,
-- e uma extension key de teste.
--
-- ATENÇÃO: rode apenas em ambiente de desenvolvimento/teste.
-- A extension key abaixo é gerada a partir do script
-- scripts/create-extension-key.mjs (que imprime a chave completa
-- e o hash). Substitua os valores pelos gerados.
-- ============================================================

begin;

-- Usuário de teste
insert into public.neon_warm_users (id, email, name, status)
values ('00000000-0000-0000-0000-000000000001', 'teste@neonwarm.com', 'Cliente Teste', 'active')
on conflict (email) do nothing;

-- Plano pago com Neon Warm habilitado
insert into public.neon_warm_plans (name, description, price, active, neon_warm_enabled, max_numbers, max_devices)
values ('Neon Warm Pro', 'Plano pago com acesso ao Neon Warm', 49.90, true, true, 5, 2)
on conflict (name) do nothing;

-- Assinatura ativa (30 dias)
insert into public.neon_warm_subscriptions (user_id, plan_id, status, started_at, expires_at, external_subscription_id)
select
  '00000000-0000-0000-0000-000000000001',
  id,
  'active',
  now(),
  now() + interval '30 days',
  'sub_test_001'
from public.neon_warm_plans
where name = 'Neon Warm Pro'
on conflict do nothing;

-- Número autorizado
insert into public.neon_warm_numbers (user_id, phone_number, phone_number_normalized, status, verified_at, last_seen_at)
values ('00000000-0000-0000-0000-000000000001', '5511999999999', '5511999999999', 'active', now(), now())
on conflict (phone_number_normalized) do nothing;

-- Licença ativa
insert into public.neon_warm_licenses (user_id, phone_number_id, plan_id, status, license_key, activated_at, expires_at)
select
  '00000000-0000-0000-0000-000000000001',
  n.id,
  p.id,
  'active',
  'NW-TEST-0001',
  now(),
  now() + interval '30 days'
from public.neon_warm_numbers n
cross join public.neon_warm_plans p
where n.phone_number_normalized = '5511999999999'
  and p.name = 'Neon Warm Pro'
on conflict (license_key) do nothing;

-- Extension key de teste (substitua pelo hash gerado)
-- Gerar com: npm run key:create
insert into public.neon_warm_extension_keys (name, key_hash, extension_id, status)
values ('Extensão de teste', 'SUBSTITUA_PELO_HASH', 'neon-warm-extension', 'active')
on conflict (key_hash) do nothing;

commit;
