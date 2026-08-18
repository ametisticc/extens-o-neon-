// ============================================================
// Testes do quadro de pareamento (painel admin)
// ============================================================
// Cobre o buildPairingBoardWithClient (pairing-board.js):
//   - lista números online com sessão ativa + heartbeat recente
//   - mostra para quem cada número envia no ciclo atual (par ativo)
//   - uma sessão por número (a mais recente)
//   - sessão offline/heartbeat antigo → online=false
//   - número com pairing_enabled=false → elegível=false
//   - stats online/paired/waiting corretas
// Usa o core com mock de Supabase em memória — não requer banco real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import { buildPairingBoardWithClient } from '../lib/pairing-board.js';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function setDb(db) {
  currentDb = db;
}

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

// Estado: 3 números, todos com sessão ativa recente, 1 par em andamento.
function makeBaseDb() {
  const now = iso(0);
  return {
    neon_warm_users: [
      { id: 'u1', name: 'Cliente A', email: 'a@teste.com' },
      { id: 'u2', name: 'Cliente B', email: 'b@teste.com' },
      { id: 'u3', name: null, email: 'c@teste.com' },
    ],
    neon_warm_plans: [],
    neon_warm_subscriptions: [],
    neon_warm_numbers: [
      { id: 'number1', user_id: 'u1', phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', pairing_enabled: true },
      { id: 'number2', user_id: 'u2', phone_number: '5521988887777', phone_number_normalized: '5521988887777', status: 'active', pairing_enabled: true },
      { id: 'number3', user_id: 'u3', phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', pairing_enabled: true },
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
    neon_warm_pairs: [
      { id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'paired', confirmed_a: false, confirmed_b: false, last_seen_a: now, last_seen_b: now, confirmed_at: null, created_at: now, updated_at: now },
    ],
  };
}

beforeEach(() => {
  setDb(makeBaseDb());
});

// ------------------------------------------------------------
// TESTE 1 — Lista online com parceiro atual
// ------------------------------------------------------------
test('BOARD 1: lista online e mostra para quem cada um envia', async () => {
  const res = await buildPairingBoardWithClient(mockClient, {});
  assert.equal(res.ok, true);
  assert.equal(res.stats.online, 3);
  assert.equal(res.stats.paired, 2);
  assert.equal(res.stats.waiting, 1);

  const a = res.rows.find((r) => r.phone_normalized === '5511999999999');
  const b = res.rows.find((r) => r.phone_normalized === '5521988887777');
  const c = res.rows.find((r) => r.phone_normalized === '5531977776666');

  assert.equal(a.online, true);
  assert.equal(a.eligible, true);
  assert.equal(a.pair_with, '5521988887777');
  assert.equal(a.pair_status, 'paired');
  assert.equal(a.user, 'Cliente A');

  assert.equal(b.online, true);
  assert.equal(b.pair_with, '5511999999999');

  assert.equal(c.online, true);
  assert.equal(c.eligible, true);
  assert.equal(c.pair_with, null); // aguardando
  assert.equal(c.pair_status, null);
});

// ------------------------------------------------------------
// TESTE 2 — Sessão com heartbeat antigo → não aparece no quadro
// ------------------------------------------------------------
test('BOARD 2: heartbeat antigo → número não listado (fora do quadro online)', async () => {
  const db = currentDb;
  db.neon_warm_sessions.find((s) => s.id === 's2').last_heartbeat_at = iso(-10 * 60 * 1000);

  const res = await buildPairingBoardWithClient(mockClient, {});
  assert.equal(res.ok, true);
  assert.equal(res.stats.online, 2); // s1 e s3 apenas

  // B não aparece (sessão fora da janela de presença).
  const b = res.rows.find((r) => r.phone_normalized === '5521988887777');
  assert.equal(b, undefined);

  // A ainda tem o par na tabela (status paired), mas o parceiro B está
  // offline → pair_with_online=false, o painel avisa.
  const a = res.rows.find((r) => r.phone_normalized === '5511999999999');
  assert.equal(a.pair_with, '5521988887777');
  assert.equal(a.pair_with_online, false);
});

// ------------------------------------------------------------
// TESTE 3 — Número com pairing_enabled=false → não elegível
// ------------------------------------------------------------
test('BOARD 3: pairing_enabled=false → elegível=false', async () => {
  const db = currentDb;
  db.neon_warm_numbers.find((n) => n.id === 'number3').pairing_enabled = false;

  const res = await buildPairingBoardWithClient(mockClient, {});
  assert.equal(res.ok, true);

  const c = res.rows.find((r) => r.phone_normalized === '5531977776666');
  assert.equal(c.online, true); // online como sessão
  assert.equal(c.eligible, false); // mas não participa do pareamento
});

// ------------------------------------------------------------
// TESTE 4 — Número bloqueado → não elegível
// ------------------------------------------------------------
test('BOARD 4: número bloqueado → elegível=false', async () => {
  const db = currentDb;
  db.neon_warm_numbers.find((n) => n.id === 'number2').status = 'blocked';

  const res = await buildPairingBoardWithClient(mockClient, {});
  assert.equal(res.ok, true);

  const b = res.rows.find((r) => r.phone_normalized === '5521988887777');
  assert.equal(b.online, true);
  assert.equal(b.eligible, false);
  assert.equal(b.ineligible_reason, 'number_not_active');
});

// ------------------------------------------------------------
// TESTE 5 — Sem sessões → vazio
// ------------------------------------------------------------
test('BOARD 5: sem sessões → sem linhas', async () => {
  currentDb.neon_warm_sessions = [];
  const res = await buildPairingBoardWithClient(mockClient, {});
  assert.equal(res.ok, true);
  assert.equal(res.rows.length, 0);
  assert.equal(res.stats.online, 0);
  assert.equal(res.stats.paired, 0);
  assert.equal(res.stats.waiting, 0);
});
