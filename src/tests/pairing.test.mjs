// ============================================================
// Testes unitários do pareamento de chips (maturação real)
// ============================================================
// Cobre o fluxo /api/maturador/pair + /api/maturador/validate:
//   - chip A cria par (waiting) quando B está online (sessão ativa)
//   - chip B chama /pair → promove a paired e recebe A
//   - chip A chama de novo → reutiliza o par (recebe B)
//   - ambos confirmam via validate → confirmed
//   - releasePair encerra o par
//   - nunca parear com self (mesmo phone/session/device)
//   - número com pairing_enabled=false NÃO é candidato
//   - sessão sem heartbeat recente NÃO é candidata
// Usa o core (pairing-core.js) com mock de Supabase em memória —
// não requer banco real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import {
  findOrCreatePairWithClient,
  confirmPairWithClient,
  getActivePairWithClient,
  releasePairWithClient,
} from '../lib/pairing-core.js';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function setDb(db) {
  currentDb = db;
}

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

// Estado inicial: 2 números registrados, ambos com sessão ativa recente.
function makeBaseDb() {
  const now = iso(0);
  return {
    neon_warm_users: [],
    neon_warm_plans: [],
    neon_warm_subscriptions: [],
    neon_warm_numbers: [
      { id: 'number1', user_id: null, phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', last_seen_at: now, pairing_enabled: true },
      { id: 'number2', user_id: null, phone_number: '5521988887777', phone_number_normalized: '5521988887777', status: 'active', last_seen_at: now, pairing_enabled: true },
    ],
    neon_warm_licenses: [],
    neon_warm_devices: [],
    neon_warm_sessions: [
      { id: 's1', user_id: 'u1', phone_number_id: 'number1', device_id: 'd1', status: 'active', last_heartbeat_at: now, ended_at: null },
      { id: 's2', user_id: 'u2', phone_number_id: 'number2', device_id: 'd2', status: 'active', last_heartbeat_at: now, ended_at: null },
    ],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
    neon_warm_pairs: [],
  };
}

beforeEach(() => {
  setDb(makeBaseDb());
});

// ------------------------------------------------------------
// TESTE 1 — Chip A chama /pair sem nenhum outro chip online → sem par
// ------------------------------------------------------------
test('PAIR 1: A sem outro chip online → sem par', async () => {
  // Remove a sessão de B; A permanece (mas é excluído como candidato).
  const db = currentDb;
  db.neon_warm_sessions = [
    { id: 's1', user_id: 'u1', phone_number_id: 'number1', device_id: 'd1', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
  ];

  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.pair, null);
  assert.equal(res.other, null);
  assert.equal(res.reason, 'no_partner_available');
  assert.equal(db.neon_warm_pairs.length, 0);
});

// ------------------------------------------------------------
// TESTE 2 — A chama /pair com B online → cria waiting e devolve B
// ------------------------------------------------------------
test('PAIR 2: A com B online → cria par waiting e devolve B', async () => {
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5521988887777');
  assert.equal(res.pair.status, 'waiting');

  const db = currentDb;
  assert.equal(db.neon_warm_pairs.length, 1);
  // chip_a é o menor número; chip_b o maior (ordem canônica).
  assert.equal(db.neon_warm_pairs[0].chip_a, '5511999999999');
  assert.equal(db.neon_warm_pairs[0].chip_b, '5521988887777');
});

// ------------------------------------------------------------
// TESTE 3 — B chama /pair → promove a paired e recebe A
// ------------------------------------------------------------
test('PAIR 3: B chama /pair → promove a paired e recebe A', async () => {
  // A cria o par waiting primeiro.
  await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });

  // B chama: já é lado do par → vira paired e recebe A.
  const resB = await findOrCreatePairWithClient(mockClient, { chip: '5521988887777', deviceId: 'd2' });
  assert.equal(resB.ok, true);
  assert.equal(resB.other, '5511999999999');
  assert.equal(resB.pair.status, 'paired');

  // A chama de novo: par ativo → recebe B.
  const resA = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(resA.ok, true);
  assert.equal(resA.other, '5521988887777');
  assert.equal(resA.pair.status, 'paired');
});

// ------------------------------------------------------------
// TESTE 4 — Ambos confirmam via validate → confirmed
// ------------------------------------------------------------
test('PAIR 4: A e B confirmam via validate → ambosConfirmados', async () => {
  const db = currentDb;
  db.neon_warm_pairs = [{
    id: 'pair1',
    chip_a: '5511999999999',
    chip_b: '5521988887777',
    status: 'paired',
    confirmed_a: false,
    confirmed_b: false,
    last_seen_a: iso(0),
    last_seen_b: iso(0),
    confirmed_at: null,
    created_at: iso(0),
    updated_at: iso(0),
  }];

  const cA = await confirmPairWithClient(mockClient, { chip: '5511999999999', pairWith: '5521988887777' });
  assert.equal(cA.ok, true);
  assert.equal(cA.confirmed, false); // B ainda não confirmou

  const cB = await confirmPairWithClient(mockClient, { chip: '5521988887777', pairWith: '5511999999999' });
  assert.equal(cB.ok, true);
  assert.equal(cB.confirmed, true); // ambos confirmaram
  assert.equal(cB.other, '5511999999999');

  assert.equal(db.neon_warm_pairs[0].status, 'confirmed');
  assert.equal(db.neon_warm_pairs[0].confirmed_a, true);
  assert.equal(db.neon_warm_pairs[0].confirmed_b, true);
});

// ------------------------------------------------------------
// TESTE 5 — Confirmação com par divergente → pair_mismatch
// ------------------------------------------------------------
test('PAIR 5: confirmar com pairWith divergente → pair_mismatch', async () => {
  const db = currentDb;
  db.neon_warm_pairs = [{
    id: 'pair1',
    chip_a: '5511999999999',
    chip_b: '5521988887777',
    status: 'paired',
    confirmed_a: false,
    confirmed_b: false,
    last_seen_a: iso(0),
    last_seen_b: iso(0),
    confirmed_at: null,
    created_at: iso(0),
    updated_at: iso(0),
  }];

  const res = await confirmPairWithClient(mockClient, {
    chip: '5511999999999',
    pairWith: '5511888887777', // errado
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'pair_mismatch');
});

// ------------------------------------------------------------
// TESTE 6 — releasePair encerra o par
// ------------------------------------------------------------
test('PAIR 6: releasePair marca o par como ended', async () => {
  const db = currentDb;
  db.neon_warm_pairs = [{
    id: 'pair1',
    chip_a: '5511999999999',
    chip_b: '5521988887777',
    status: 'paired',
    confirmed_a: false,
    confirmed_b: false,
    last_seen_a: iso(0),
    last_seen_b: iso(0),
    confirmed_at: null,
    created_at: iso(0),
    updated_at: iso(0),
  }];

  const res = await releasePairWithClient(mockClient, { chip: '5511999999999' });
  assert.equal(res.ok, true);
  assert.equal(db.neon_warm_pairs[0].status, 'ended');

  const active = await getActivePairWithClient(mockClient, { chip: '5511999999999' });
  assert.equal(active.ok, true);
  assert.equal(active.pair, null);
});

// ------------------------------------------------------------
// TESTE 7 — NUNCA parear consigo mesmo (por session_id ou device_id)
// ------------------------------------------------------------
test('PAIR 7: exclui self por session_id e device_id', async () => {
  // Duas sessões do MESMO número? A query de candidatos exclui por
  // session_id e device_id, então mesmo que A envie session de A,
  // a sessão de A não é candidata.
  const db = currentDb;
  // Adiciona uma sessão do número A com device diferente (não deveria
  // ser pareado, pois é o mesmo phone).
  db.neon_warm_sessions.push({
    id: 'sA2', user_id: 'u1', phone_number_id: 'number1', device_id: 'dX', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });
  // Remove B para testar que mesmo com 2 sessões de A, sem B → sem par.
  db.neon_warm_sessions = db.neon_warm_sessions.filter((s) => s.phone_number_id !== 'number2');

  const res = await findOrCreatePairWithClient(mockClient, {
    chip: '5511999999999',
    sessionId: 's1',
    deviceId: 'd1',
  });
  assert.equal(res.ok, true);
  assert.equal(res.pair, null);
  assert.equal(res.reason, 'no_partner_available');
});

// ------------------------------------------------------------
// TESTE 8 — Número com pairing_enabled=false NÃO é candidato
// ------------------------------------------------------------
test('PAIR 8: pairing_enabled=false exclui candidato', async () => {
  const db = currentDb;
  db.neon_warm_numbers.find((n) => n.id === 'number2').pairing_enabled = false;

  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.pair, null);
  assert.equal(res.reason, 'no_partner_available');
  assert.equal(db.neon_warm_pairs.length, 0);
});

// ------------------------------------------------------------
// TESTE 9 — Sessão sem heartbeat recente NÃO é candidata
// ------------------------------------------------------------
test('PAIR 9: heartbeat antigo exclui candidato', async () => {
  const db = currentDb;
  db.neon_warm_sessions.find((s) => s.id === 's2').last_heartbeat_at = iso(-10 * 60 * 1000); // 10min atrás

  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.pair, null);
  assert.equal(res.reason, 'no_partner_available');
});
