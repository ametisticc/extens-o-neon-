// ============================================================
// Testes da autenticação por CHAVE DE LICENÇA (formato NW-...)
// ============================================================
// Cobre a autenticação da extensão quando o operador configura uma
// chave de licença gerada pelo painel admin (NW-XXXX...) em vez de uma
// API key nw_... Além disso, garante que a integração com o fluxo de
// validação respeite o vínculo licença ↔ número (isolamento).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import { authenticateExtension, authenticateLicenseKey } from '../lib/auth.js';
import { validateWithClient, REASONS } from '../lib/validation-core.js';
import { sha256 } from '../lib/crypto.js';

// Simula o ambiente de produção: o ID da extensão permitida está
// configurado (Vercel: NEON_WARM_EXTENSION_ID). Sem ele, o guard não
// valida o extension_id.
process.env.NEON_WARM_EXTENSION_ID = 'neon-warm-extension';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function iso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

function makeBaseDb(overrides = {}) {
  const db = {
    neon_warm_users: [
      { id: 'user1', email: 'cliente@teste.com', name: 'Cliente', status: 'active' },
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
      { id: 'license1', user_id: 'user1', phone_number_id: 'number1', plan_id: 'plan1', status: 'active', license_key: 'NW-7E1F03D59C49', activated_at: iso(-1), expires_at: iso(30), last_validation_at: null },
    ],
    neon_warm_devices: [],
    neon_warm_sessions: [],
    neon_warm_logs: [],
    neon_warm_extension_keys: [
      { id: 'key1', name: 'Ext key', extension_id: 'neon-warm-extension', status: 'active', key_hash: sha256('nw_abc123'), last_used_at: null },
    ],
  };
  return { ...db, ...overrides };
}

const EXT = 'neon-warm-extension';

before(() => {
  currentDb = makeBaseDb();
});

// ============================================================
// authenticateLicenseKey
// ============================================================
test('LICENSE AUTH: chave NW válida + extensão correta → ok com licença e número', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateLicenseKey({ extensionId: EXT, apiKey: 'NW-7E1F03D59C49' }, { supabase: mockClient });
  assert.equal(auth.ok, true);
  assert.equal(auth.license.status, 'active');
  assert.equal(auth.license.license_key, 'NW-7E1F03D59C49');
  assert.equal(auth.number.phone_number_normalized, '5511999999999');
});

test('LICENSE AUTH: chave NW inexistente → invalid_license_key', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateLicenseKey({ extensionId: EXT, apiKey: 'NW-NAO-EXISTE' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'invalid_license_key');
});

test('LICENSE AUTH: chave NW revogada → license_inactive', async () => {
  const db = makeBaseDb();
  db.neon_warm_licenses = [
    { id: 'license1', user_id: 'user1', phone_number_id: 'number1', plan_id: 'plan1', status: 'revoked', license_key: 'NW-7E1F03D59C49', activated_at: iso(-1), expires_at: iso(30), last_validation_at: null },
  ];
  currentDb = db;
  const auth = await authenticateLicenseKey({ extensionId: EXT, apiKey: 'NW-7E1F03D59C49' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'license_inactive');
});

test('LICENSE AUTH: chave NW expirada → license_inactive', async () => {
  const db = makeBaseDb();
  db.neon_warm_licenses = [
    { id: 'license1', user_id: 'user1', phone_number_id: 'number1', plan_id: 'plan1', status: 'active', license_key: 'NW-7E1F03D59C49', activated_at: iso(-30), expires_at: iso(-1), last_validation_at: null },
  ];
  currentDb = db;
  const auth = await authenticateLicenseKey({ extensionId: EXT, apiKey: 'NW-7E1F03D59C49' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'license_inactive');
});

test('LICENSE AUTH: extensão errada → extension_id_invalid', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateLicenseKey({ extensionId: 'outra-extensao', apiKey: 'NW-7E1F03D59C49' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'extension_id_invalid');
});

test('LICENSE AUTH: chave sem prefixo NW (nw_...) → invalid_api_key (rota de licença)', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateLicenseKey({ extensionId: EXT, apiKey: 'nw_abc123' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'invalid_api_key');
});

// ============================================================
// authenticateExtension (compatibilidade — fluxo antigo continua)
// ============================================================
test('EXT AUTH: API key nw_ válida → ok (compatibilidade mantida)', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateExtension({ extensionId: EXT, apiKey: 'nw_abc123' }, { supabase: mockClient });
  assert.equal(auth.ok, true);
  assert.equal(auth.keyRecord.id, 'key1');
});

test('EXT AUTH: API key nw_ inválida → invalid_api_key', async () => {
  currentDb = makeBaseDb();
  const auth = await authenticateExtension({ extensionId: EXT, apiKey: 'nw_nao-existe' }, { supabase: mockClient });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'invalid_api_key');
});

// ============================================================
// validateWithClient com license pré-resolvida (fluxo /validate)
// ============================================================
test('VALIDATE: license pré-resolvida do MESMO número → authorized = true', async () => {
  currentDb = makeBaseDb();
  const license = currentDb.neon_warm_licenses[0];
  const result = await validateWithClient(mockClient, {
    phoneNumber: '5511999999999',
    extensionId: EXT,
    deviceId: 'device-abc',
    license,
  });
  assert.equal(result.authorized, true);
  assert.equal(result.plan, 'Neon Warm Pro');
  assert.equal(result.license.id, 'license1');
});

test('VALIDATE: license pré-resolvida de OUTRO número → authorized = false', async () => {
  const db = makeBaseDb();
  // O número enviado (5511988888888) EXISTE no banco, mas a licença
  // aponta para number1 (5511999999999). O servidor DEVE negar — a
  // licença só autoriza o número dela (isolamento entre clientes).
  db.neon_warm_numbers = [
    ...db.neon_warm_numbers,
    { id: 'number2', user_id: 'user1', phone_number: '5511988888888', phone_number_normalized: '5511988888888', status: 'active', verified_at: iso(-1), last_seen_at: null },
  ];
  currentDb = db;
  const license = db.neon_warm_licenses[0];
  const result = await validateWithClient(mockClient, {
    phoneNumber: '5511988888888',
    extensionId: EXT,
    deviceId: 'device-abc',
    license,
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.LICENSE_NOT_FOUND);
});

test('VALIDATE: license pré-resolvida sem número cadastrado → NUMBER_NOT_FOUND', async () => {
  const db = makeBaseDb();
  db.neon_warm_numbers = [];
  currentDb = db;
  const license = currentDb.neon_warm_licenses[0];
  const result = await validateWithClient(mockClient, {
    phoneNumber: '5511999999999',
    extensionId: EXT,
    deviceId: 'device-abc',
    license,
  });
  assert.equal(result.authorized, false);
  assert.equal(result.reason, REASONS.NUMBER_NOT_FOUND);
});
