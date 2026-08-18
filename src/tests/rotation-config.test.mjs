// ============================================================
// Testes da configuração de rotação automática (100% backend)
// ============================================================
// Cobre src/lib/rotation-config.js:
//   - getRotationConfigWithClient: sem tabela/config → default; com
//     config → valores salvos
//   - setRotationConfigWithClient: salva linha id=1; clamp min_online
//   - shouldAutoRotateWithClient: desligada → false; ligada com menos
//     contas online que o mínimo → false; ligada com >= mínimo → true
// Usa o mock de Supabase em memória (helpers/mock-supabase.mjs).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import {
  getRotationConfigWithClient,
  setRotationConfigWithClient,
  shouldAutoRotateWithClient,
} from '../lib/rotation-config.js';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function setDb(db) {
  currentDb = db;
}

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

function makeBaseDb() {
  const now = iso(0);
  return {
    neon_warm_users: [],
    neon_warm_plans: [],
    neon_warm_subscriptions: [],
    neon_warm_numbers: [
      { id: 'number1', user_id: null, phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', last_seen_at: now, pairing_enabled: true },
      { id: 'number2', user_id: null, phone_number: '5521988887777', phone_number_normalized: '5521988887777', status: 'active', last_seen_at: now, pairing_enabled: true },
      { id: 'number3', user_id: null, phone_number: '5531777776666', phone_number_normalized: '5531777776666', status: 'active', last_seen_at: now, pairing_enabled: true },
    ],
    neon_warm_licenses: [],
    neon_warm_devices: [],
    neon_warm_sessions: [
      { id: 's1', user_id: 'u1', phone_number_id: 'number1', device_id: 'd1', status: 'active', last_heartbeat_at: now, ended_at: null },
      { id: 's2', user_id: 'u2', phone_number_id: 'number2', device_id: 'd2', status: 'active', last_heartbeat_at: now, ended_at: null },
      { id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: now, ended_at: null },
    ],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
    neon_warm_pairs: [],
    neon_warm_maturation_plans: [],
    neon_warm_rotation_config: [],
  };
}

beforeEach(() => {
  setDb(makeBaseDb());
});

// ------------------------------------------------------------
// ROT 1 — Sem config salva → default (desligada, mínimo 3)
// ------------------------------------------------------------
test('ROT 1: sem config → default { enabled:false, min_online:3 }', async () => {
  const cfg = await getRotationConfigWithClient(mockClient);
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.min_online, 3);
});

// ------------------------------------------------------------
// ROT 2 — Config salva → retorna os valores
// ------------------------------------------------------------
test('ROT 2: config ligada com min 2 → retorna valores', async () => {
  currentDb.neon_warm_rotation_config = [
    { id: 1, enabled: true, min_online: 2, updated_at: iso(0) },
  ];
  const cfg = await getRotationConfigWithClient(mockClient);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.min_online, 2);
});

// ------------------------------------------------------------
// ROT 3 — setRotationConfig liga e salva
// ------------------------------------------------------------
test('ROT 3: setRotationConfig salva enabled+min_online', async () => {
  const res = await setRotationConfigWithClient(mockClient, {
    enabled: true,
    minOnline: 4,
  });
  assert.equal(res.ok, true);
  assert.equal(res.config.enabled, true);
  assert.equal(res.config.min_online, 4);

  const saved = currentDb.neon_warm_rotation_config[0];
  assert.equal(saved.id, 1);
  assert.equal(saved.enabled, true);
  assert.equal(saved.min_online, 4);

  // Lendo de volta confirma persistência.
  const cfg = await getRotationConfigWithClient(mockClient);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.min_online, 4);
});

// ------------------------------------------------------------
// ROT 4 — setRotationConfig faz clamp de min_online (>= 2)
// ------------------------------------------------------------
test('ROT 4: minOnline abaixo de 2 é corrigido para 2', async () => {
  const res = await setRotationConfigWithClient(mockClient, {
    enabled: true,
    minOnline: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(res.config.min_online, 2);
});

// ------------------------------------------------------------
// ROT 5 — Desligada → nunca rotaciona sozinha
// ------------------------------------------------------------
test('ROT 5: config desligada → rotate=false mesmo com 3 online', async () => {
  const res = await shouldAutoRotateWithClient(mockClient);
  assert.equal(res.rotate, false);
  assert.equal(res.enabled, false);
  assert.equal(res.online_count, 0);
});

// ------------------------------------------------------------
// ROT 6 — Ligada, mas abaixo do mínimo → não rotaciona
// ------------------------------------------------------------
test('ROT 6: ligada com 2 online e mínimo 3 → rotate=false', async () => {
  await setRotationConfigWithClient(mockClient, { enabled: true, minOnline: 3 });
  currentDb.neon_warm_sessions = currentDb.neon_warm_sessions.slice(0, 2);

  const res = await shouldAutoRotateWithClient(mockClient);
  assert.equal(res.enabled, true);
  assert.equal(res.online_count, 2);
  assert.equal(res.rotate, false);
});

// ------------------------------------------------------------
// ROT 7 — Ligada e mínimo atingido → rotaciona
// ------------------------------------------------------------
test('ROT 7: ligada com 3 online e mínimo 3 → rotate=true', async () => {
  await setRotationConfigWithClient(mockClient, { enabled: true, minOnline: 3 });

  const res = await shouldAutoRotateWithClient(mockClient);
  assert.equal(res.enabled, true);
  assert.equal(res.online_count, 3);
  assert.equal(res.rotate, true);
});

// ------------------------------------------------------------
// ROT 8 — Sessão com heartbeat velho NÃO conta como online
// ------------------------------------------------------------
test('ROT 8: heartbeat antigo não conta → abaixo do mínimo', async () => {
  await setRotationConfigWithClient(mockClient, { enabled: true, minOnline: 3 });
  // s3 fica com heartbeat de 10 min atrás (janela = 3 min).
  currentDb.neon_warm_sessions[2].last_heartbeat_at = iso(-10 * 60 * 1000);

  const res = await shouldAutoRotateWithClient(mockClient);
  assert.equal(res.online_count, 2);
  assert.equal(res.rotate, false);
});

// ------------------------------------------------------------
// ROT 9 — setRotationConfig desliga
// ------------------------------------------------------------
test('ROT 9: desligar após ligar → default e sem rotação', async () => {
  await setRotationConfigWithClient(mockClient, { enabled: true, minOnline: 3 });
  await setRotationConfigWithClient(mockClient, { enabled: false, minOnline: 3 });

  const cfg = await getRotationConfigWithClient(mockClient);
  assert.equal(cfg.enabled, false);

  const res = await shouldAutoRotateWithClient(mockClient);
  assert.equal(res.rotate, false);
});
