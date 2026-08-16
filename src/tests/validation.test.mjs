// ============================================================
// Testes unitários do serviço de validação Neon Warm
// ============================================================
// Cobre os 9 cenários do spec. Usa validateWithClient (injeção)
// com um mock de Supabase em memória — não requer banco real.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import { validateWithClient, REASONS } from '../lib/validation-core.js';

// ------------------------------------------------------------
// Estado do banco simulado (mutável por teste)
// ------------------------------------------------------------
let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function setDb(db) {
  currentDb = db;
}

// ------------------------------------------------------------
// Helpers de cenário
// ------------------------------------------------------------
function iso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

function makeBaseDb(overrides = {}) {
  const db = {
    neon_warm_users: [
      { id: 'user1', email: 'teste@neonwarm.com', name: 'Teste', status: 'active' },
    ],
    neon_warm_plans: [
      { id: 'plan1', name: 'Neon Warm Pro', description: 'Pro', price: 49.9, active: true, neon_warm_enabled: true, max_numbers: 5, max_devices: 2 },
    ],
    neon_warm_subscriptions: [
      { id: 'sub1', user_id: 'user1', plan_id: 'plan1', status: 'active', started_at: iso(-1), expires_at: iso(30), external_subscription_id: 'sub_test_001' },
    ],
    neon_warm_numbers: [
      { id: 'number1', user_id: 'user1', phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', verified_at: iso(-1), last_seen_at: null },
    ],
    neon_warm_licenses: [
      { id: 'license1', user_id: 'user1', phone_number_id: 'number1', plan_id: 'plan1', status: 'active', license_key: 'NW-TEST-0001', activated_at: iso(-1), expires_at: iso(30), last_validation_at: null },
    ],
    neon_warm_devices: [],
    neon_warm_sessions: [],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
  };
  return { ...db, ...overrides };
}

const PARAMS = {
  phoneNumber: '5511999999999',
  extensionId: 'neon-warm-extension',
  deviceId: 'device-abc',
};

// ------------------------------------------------------------
// TESTE 1 — Número cadastrado + plano ativo + assinatura ativa + licença ativa
// ------------------------------------------------------------
test('TESTE 1: cenário válido completo → authorized = true', async () => {
  setDb(makeBaseDb());
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, true);
  assert.equal(result.status, 'active');
  assert.equal(result.plan, 'Neon Warm Pro');
  assert.ok(result.expires_at);
});

// ------------------------------------------------------------
// TESTE 2 — Número não cadastrado
// ------------------------------------------------------------
test('TESTE 2: número não cadastrado → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_numbers = [];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.NUMBER_NOT_FOUND);
});

// ------------------------------------------------------------
// TESTE 3 — Assinatura vencida
// ------------------------------------------------------------
test('TESTE 3: assinatura vencida → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_subscriptions = [
    { id: 'sub1', user_id: 'user1', plan_id: 'plan1', status: 'expired', started_at: iso(-60), expires_at: iso(-1), external_subscription_id: 'sub_test_001' },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.SUBSCRIPTION_EXPIRED);
});

// ------------------------------------------------------------
// TESTE 4 — Assinatura cancelada
// ------------------------------------------------------------
test('TESTE 4: assinatura cancelada → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_subscriptions = [
    { id: 'sub1', user_id: 'user1', plan_id: 'plan1', status: 'cancelled', started_at: iso(-60), expires_at: iso(30), external_subscription_id: 'sub_test_001' },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.SUBSCRIPTION_CANCELLED);
});

// ------------------------------------------------------------
// TESTE 5 — Licença revogada
// ------------------------------------------------------------
test('TESTE 5: licença revogada → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_licenses = [
    { id: 'license1', user_id: 'user1', phone_number_id: 'number1', plan_id: 'plan1', status: 'revoked', license_key: 'NW-TEST-0001', activated_at: iso(-1), expires_at: iso(30), last_validation_at: null },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.LICENSE_REVOKED);
});

// ------------------------------------------------------------
// TESTE 6 — Número bloqueado
// ------------------------------------------------------------
test('TESTE 6: número bloqueado → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_numbers = [
    { id: 'number1', user_id: 'user1', phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'blocked', verified_at: iso(-1), last_seen_at: null },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.NUMBER_BLOCKED);
});

// ------------------------------------------------------------
// TESTE 7 — Plano sem Neon Warm
// ------------------------------------------------------------
test('TESTE 7: plano sem Neon Warm → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_plans = [
    { id: 'plan1', name: 'Neon Warm Pro', description: 'Pro', price: 49.9, active: true, neon_warm_enabled: false, max_numbers: 5, max_devices: 2 },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.NEON_WARM_DISABLED);
});

// ------------------------------------------------------------
// TESTE 8 — Limite de dispositivos excedido
// ------------------------------------------------------------
test('TESTE 8: limite de dispositivos excedido → authorized = false', async () => {
  const db = makeBaseDb();
  db.neon_warm_plans = [
    { id: 'plan1', name: 'Neon Warm Pro', description: 'Pro', price: 49.9, active: true, neon_warm_enabled: true, max_numbers: 5, max_devices: 1 },
  ];
  db.neon_warm_devices = [
    { id: 'device1', user_id: 'user1', phone_number_id: 'number1', extension_id: 'neon-warm-extension', device_id: 'device-outro', status: 'active', first_seen_at: iso(-1), last_seen_at: iso(-1) },
  ];
  setDb(db);
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.DEVICE_LIMIT_REACHED);
});

// ------------------------------------------------------------
// TESTE 9 — Todos os requisitos válidos (dispositivo novo registrado)
// ------------------------------------------------------------
test('TESTE 9: todos os requisitos válidos com registro de dispositivo → authorized = true', async () => {
  setDb(makeBaseDb());
  const result = await validateWithClient(mockClient, PARAMS);
  assert.equal(result.authorized, true);
  assert.ok(result.device, 'deveria ter registrado o dispositivo');
  assert.equal(result.device.device_id, 'device-abc');
  assert.equal(result.plan, 'Neon Warm Pro');
});
