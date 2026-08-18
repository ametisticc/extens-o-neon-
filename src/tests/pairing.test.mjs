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
  releaseStalePairsWithClient,
  rotateAllPairsWithClient,
  recentPartnersWithClient,
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
    neon_warm_maturation_plans: [],
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

// ------------------------------------------------------------
// TESTE 10 — rotate: par confirmado é encerrado e troca de parceiro
// ------------------------------------------------------------
test('PAIR 10: rotate=true encerra par confirmado e procura novo', async () => {
  const db = currentDb;
  // Adiciona um TERCEIRO número/sessão online (C).
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });

  // 1) A pareia com B e ambos confirmam.
  const p1 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(p1.ok, true);
  assert.equal(p1.other, '5521988887777');
  await confirmPairWithClient(mockClient, { chip: '5511999999999', pairWith: '5521988887777' });
  await confirmPairWithClient(mockClient, { chip: '5521988887777', pairWith: '5511999999999' });
  assert.equal(db.neon_warm_pairs[0].status, 'confirmed');

  // 2) A chama /pair com rotate=true → NÃO devolve B de novo; devolve C.
  const p2 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(p2.ok, true);
  assert.equal(p2.other, '5531977776666');
  // O par antigo virou ended.
  assert.equal(db.neon_warm_pairs.find((x) => x.chip_a === '5511999999999' && x.chip_b === '5521988887777').status, 'ended');
});

// ------------------------------------------------------------
// TESTE 11 — rotate: par em andamento (não confirmado) é mantido
// ------------------------------------------------------------
test('PAIR 11: rotate=true mantém par em andamento (não confirmado)', async () => {
  const db = currentDb;
  // A ↔ B confirmado apenas por A (em andamento). rotate não deve abandonar.
  const p1 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(p1.ok, true);
  await confirmPairWithClient(mockClient, { chip: '5511999999999', pairWith: '5521988887777' });
  assert.equal(db.neon_warm_pairs[0].status, 'waiting'); // B ainda não chamou /pair

  const p2 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(p2.ok, true);
  assert.equal(p2.other, '5521988887777'); // mantém B
  assert.equal(db.neon_warm_pairs[0].status, 'paired'); // A chamou /pair de novo → promovido a paired
});

// ------------------------------------------------------------
// TESTE 12 — rotate: prefere parceiro DIFERENTE do último, mas aceita
//           o último como fallback quando é o único online
// ------------------------------------------------------------
test('PAIR 12: rotate evita repetir o último parceiro', async () => {
  const db = currentDb;
  // A ↔ B confirmado (par completo).
  const p1 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  await confirmPairWithClient(mockClient, { chip: '5511999999999', pairWith: '5521988887777' });
  await confirmPairWithClient(mockClient, { chip: '5521988887777', pairWith: '5511999999999' });

  // Apenas B online (além de A) → rotate cai no fallback e devolve B.
  const p2 = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(p2.ok, true);
  assert.equal(p2.other, '5521988887777'); // fallback (único online)
});

// ------------------------------------------------------------
// TESTE 13 — Par com parceiro offline é encerrado no /pair
// ------------------------------------------------------------
test('PAIR 13: A chama /pair com parceiro offline → encerra par e procura novo', async () => {
  const db = currentDb;
  // Adiciona C (número 3) online.
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });

  // A ↔ B pareados, mas B caiu (heartbeat antigo).
  db.neon_warm_sessions.find((s) => s.id === 's2').last_heartbeat_at = iso(-10 * 60 * 1000);
  db.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'paired',
    confirmed_a: false, confirmed_b: false, last_seen_a: iso(0), last_seen_b: iso(0),
    confirmed_at: null, created_at: iso(0), updated_at: iso(0),
  }];

  // A chama /pair (mesmo sem rotate): o parceiro B está offline → encerra
  // o par e pareia com C.
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5531977776666');
  assert.equal(db.neon_warm_pairs.find((x) => x.id === 'pair1').status, 'ended');
});

// ------------------------------------------------------------
// TESTE 14 — Candidato que já está em outro par ativo é excluído
// ------------------------------------------------------------
test('PAIR 14: exclui candidato que já está em outro par ativo', async () => {
  const db = currentDb;
  // C já está pareado com D (número 4).
  db.neon_warm_numbers.push(
    { id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
    { id: 'number4', user_id: null, phone_number: '5541966665555', phone_number_normalized: '5541966665555', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
  );
  db.neon_warm_sessions.push(
    { id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
    { id: 's4', user_id: 'u4', phone_number_id: 'number4', device_id: 'd4', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
  );
  // Par C ↔ D ativo.
  db.neon_warm_pairs = [{
    id: 'pairCD', chip_a: '5531977776666', chip_b: '5541966665555', status: 'paired',
    confirmed_a: false, confirmed_b: false, last_seen_a: iso(0), last_seen_b: iso(0),
    confirmed_at: null, created_at: iso(0), updated_at: iso(0),
  }];

  // A chama /pair. B é o único candidato livre (C está ocupado com D).
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1' });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5521988887777');
  assert.equal(db.neon_warm_pairs.filter((p) => p.status !== 'ended').length, 2);
});

// ------------------------------------------------------------
// TESTE 15 — releaseStalePairs encerra pares com lado offline
// ------------------------------------------------------------
test('PAIR 15: releaseStalePairs encerra par com lado offline', async () => {
  const db = currentDb;
  // B caiu (heartbeat antigo).
  db.neon_warm_sessions.find((s) => s.id === 's2').last_heartbeat_at = iso(-10 * 60 * 1000);
  // Par A↔B ativo.
  db.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'paired',
    confirmed_a: false, confirmed_b: false, last_seen_a: iso(0), last_seen_b: iso(0),
    confirmed_at: null, created_at: iso(0), updated_at: iso(0),
  }];

  const res = await releaseStalePairsWithClient(mockClient, {});
  assert.equal(res.ok, true);
  assert.equal(res.released, 1);
  assert.equal(db.neon_warm_pairs[0].status, 'ended');
});

// ------------------------------------------------------------
// TESTE 16 — releaseStalePairs(onlyPhone) só encerra pares do número
// ------------------------------------------------------------
test('PAIR 16: releaseStalePairs com onlyPhone tira só o número do pareamento', async () => {
  const db = currentDb;
  // B e C online.
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });
  // Dois pares: A↔B e C↔D? Não — C não tem par. Vamos fazer A↔B ativo e C sem par.
  db.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'paired',
    confirmed_a: false, confirmed_b: false, last_seen_a: iso(0), last_seen_b: iso(0),
    confirmed_at: null, created_at: iso(0), updated_at: iso(0),
  }];

  // Tira o B do pareamento: encerra o par A↔B.
  const res = await releaseStalePairsWithClient(mockClient, { onlyPhone: '5521988887777' });
  assert.equal(res.ok, true);
  assert.equal(res.released, 1);
  assert.equal(db.neon_warm_pairs[0].status, 'ended');
});

// ------------------------------------------------------------
// TESTE 17 — rotateAllPairs encerra TODOS os pares ativos (mesmo online)
// ------------------------------------------------------------
test('PAIR 17: rotateAllPairs encerra todos os pares ativos de uma vez', async () => {
  const db = currentDb;
  // Dois pares ativos, ambos com lados online (A↔B e C↔D).
  db.neon_warm_numbers.push(
    { id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
    { id: 'number4', user_id: null, phone_number: '5541966665555', phone_number_normalized: '5541966665555', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
  );
  db.neon_warm_sessions.push(
    { id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
    { id: 's4', user_id: 'u4', phone_number_id: 'number4', device_id: 'd4', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
  );
  db.neon_warm_pairs = [
    { id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'paired',
      confirmed_a: false, confirmed_b: false, last_seen_a: iso(0), last_seen_b: iso(0),
      confirmed_at: null, created_at: iso(0), updated_at: iso(0) },
    { id: 'pair2', chip_a: '5531977776666', chip_b: '5541966665555', status: 'confirmed',
      confirmed_a: true, confirmed_b: true, last_seen_a: iso(0), last_seen_b: iso(0),
      confirmed_at: iso(0), created_at: iso(0), updated_at: iso(0) },
  ];

  const res = await rotateAllPairsWithClient(mockClient);
  assert.equal(res.ok, true);
  assert.equal(res.rotated, 2);
  assert.equal(db.neon_warm_pairs[0].status, 'ended');
  assert.equal(db.neon_warm_pairs[1].status, 'ended');
});

// ------------------------------------------------------------
// TESTE 18 — rotateAllPairs sem pares ativos → rotated 0
// ------------------------------------------------------------
test('PAIR 18: rotateAllPairs sem pares ativos retorna rotated 0', async () => {
  const res = await rotateAllPairsWithClient(mockClient);
  assert.equal(res.ok, true);
  assert.equal(res.rotated, 0);
});

// ------------------------------------------------------------
// TESTE 19 — recentPartners retorna os parceiros terminados (mais recente primeiro)
// ------------------------------------------------------------
test('PAIR 19: recentPartners retorna parceiros terminados do mais recente', async () => {
  const db = currentDb;
  db.neon_warm_pairs = [
    { id: 'p1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'ended',
      last_seen_a: iso(-60000), last_seen_b: iso(-60000), updated_at: iso(-60000), created_at: iso(-60000) },
    { id: 'p2', chip_a: '5531977776666', chip_b: '5511999999999', status: 'ended',
      last_seen_a: iso(-120000), last_seen_b: iso(-120000), updated_at: iso(-120000), created_at: iso(-120000) },
  ];
  const res = await recentPartnersWithClient(mockClient, '5511999999999');
  assert.equal(res.length, 2);
  assert.equal(res[0], '5521988887777'); // mais recente
  assert.equal(res[1], '5531977776666');
});

// ------------------------------------------------------------
// TESTE 20 — rotate evita repetir parceiro usando histórico de pares terminados
// ------------------------------------------------------------
test('PAIR 20: rotate prefere parceiro que NUNCA interagiu (round-robin)', async () => {
  const db = currentDb;
  // Três números online: A, B, C.
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });

  // A já interagiu com B no passado (par terminado) → rotate deve escolher C.
  db.neon_warm_pairs = [{
    id: 'pAB', chip_a: '5511999999999', chip_b: '5521988887777', status: 'ended',
    confirmed_a: true, confirmed_b: true, last_seen_a: iso(-60000), last_seen_b: iso(-60000),
    confirmed_at: iso(-60000), created_at: iso(-60000), updated_at: iso(-60000),
  }];

  // A chama /pair com rotate → não pode ser B (já interagiu); deve ser C.
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5531977776666');
  assert.equal(res.pair.status, 'waiting');
});

// ------------------------------------------------------------
// TESTE 21 — rotate com todos já usados → escolhe o menos recente
// ------------------------------------------------------------
test('PAIR 21: rotate com todos usados escolhe o parceiro há mais tempo', async () => {
  const db = currentDb;
  // Três números: A, B, C.
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });

  // A já interagiu com B (recente) e com C (antigo).
  db.neon_warm_pairs = [
    { id: 'pAB', chip_a: '5511999999999', chip_b: '5521988887777', status: 'ended',
      confirmed_a: true, confirmed_b: true, last_seen_a: iso(-60000), last_seen_b: iso(-60000),
      confirmed_at: iso(-60000), created_at: iso(-60000), updated_at: iso(-60000) },
    { id: 'pAC', chip_a: '5531977776666', chip_b: '5511999999999', status: 'ended',
      confirmed_a: true, confirmed_b: true, last_seen_a: iso(-300000), last_seen_b: iso(-300000),
      confirmed_at: iso(-300000), created_at: iso(-300000), updated_at: iso(-300000) },
  ];

  // Ambos já foram usados. rotate deve escolher C (menos recente).
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5531977776666');
});

// ------------------------------------------------------------
// TESTE 22 — Número BANIDO não é escolhido como parceiro de ninguém
// ------------------------------------------------------------
test('PAIR 22: número banido NÃO é candidato (não recebe par)', async () => {
  const db = currentDb;
  // Adiciona um terceiro número C online.
  db.neon_warm_numbers.push({
    id: 'number3', user_id: null, phone_number: '5531977776666', phone_number_normalized: '5531977776666', status: 'active', last_seen_at: iso(0), pairing_enabled: true,
  });
  db.neon_warm_sessions.push({
    id: 's3', user_id: 'u3', phone_number_id: 'number3', device_id: 'd3', status: 'active', last_heartbeat_at: iso(0), ended_at: null,
  });

  // Marca B como BANIDO no plano de maturação.
  db.neon_warm_maturation_plans = [{
    id: 'planB', phone_number_normalized: '5521988887777', status: 'banned',
    flag_reason: 'ban', flagged_at: iso(0), flagged_by: 'admin',
    daily_msg_limit: null, cycle_seconds: null, auto_resume_daily: true,
    paused_at: null, paused_reason: null, approved_at: null, cycles_done: 0, cycle_limit: null,
  }];

  // A chama /pair → B está online mas BANIDO → só sobra C.
  const res = await findOrCreatePairWithClient(mockClient, { chip: '5511999999999', deviceId: 'd1', rotate: true });
  assert.equal(res.ok, true);
  assert.equal(res.other, '5531977776666');
  assert.equal(db.neon_warm_pairs.length, 1);
  assert.equal(db.neon_warm_pairs[0].chip_b, '5531977776666');
});
