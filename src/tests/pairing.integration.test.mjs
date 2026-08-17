// ============================================================
// Teste de integração do fluxo completo de pareamento
// ============================================================
// Simula DOIS chips (A e B) com a extensão conectada. Cada um:
//  1. valida licença → inicia sessão (marca online)
//  2. chama /api/maturador/pair (com session_id + device_id)
//  3. recebe pairWith (o número do outro)
//  4. chama /api/maturador/validate (confirm=true)
// Espera-se que AMBOS recebam ambosConfirmados=true e tenham o número
// do outro para trocar mensagens.
//
// Usa pairing-core.js diretamente (equivalente ao que as rotas chamam),
// com mock de Supabase em memória.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import {
  findOrCreatePairWithClient,
  confirmPairWithClient,
} from '../lib/pairing-core.js';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

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
      { id: 'numberA', user_id: null, phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', last_seen_at: now, pairing_enabled: true },
      { id: 'numberB', user_id: null, phone_number: '5521988887777', phone_number_normalized: '5521988887777', status: 'active', last_seen_at: now, pairing_enabled: true },
    ],
    neon_warm_licenses: [],
    neon_warm_devices: [],
    neon_warm_sessions: [
      { id: 'sA', user_id: 'uA', phone_number_id: 'numberA', device_id: 'dA', status: 'active', last_heartbeat_at: now, ended_at: null },
      { id: 'sB', user_id: 'uB', phone_number_id: 'numberB', device_id: 'dB', status: 'active', last_heartbeat_at: now, ended_at: null },
    ],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
    neon_warm_pairs: [],
  };
}

// ============================================================
// Fluxo: A conecta → B conecta → A pede par → recebe B
//        → B pede par → recebe A → ambos confirmam → enviam
// ============================================================
test('INTEGRAÇÃO: dois chips conectados pareiam, confirmam e trocam mensagens', async () => {
  currentDb = makeBaseDb();
  const A = '5511999999999';
  const B = '5521988887777';

  // --- Chip A chama /pair (B está online via sessão) ---
  const pairA = await findOrCreatePairWithClient(mockClient, { chip: A, deviceId: 'dA' });
  assert.equal(pairA.ok, true);
  assert.equal(pairA.other, B);            // A recebe B
  assert.equal(pairA.pair.status, 'waiting');

  // --- A abre o chat com B e confirma ---
  const confA = await confirmPairWithClient(mockClient, { chip: A, pairWith: B });
  assert.equal(confA.ok, true);
  assert.equal(confA.confirmed, false);    // B ainda não confirmou

  // --- Chip B chama /pair ---
  const pairB = await findOrCreatePairWithClient(mockClient, { chip: B, deviceId: 'dB' });
  assert.equal(pairB.ok, true);
  assert.equal(pairB.other, A);            // B recebe A
  assert.equal(pairB.pair.status, 'paired');

  // --- B abre o chat com A e confirma ---
  const confB = await confirmPairWithClient(mockClient, { chip: B, pairWith: A });
  assert.equal(confB.ok, true);
  assert.equal(confB.confirmed, true);     // ambos confirmaram!
  assert.equal(confB.other, A);

  // --- A confirma de novo: agora ambosConfirmados ---
  const confA2 = await confirmPairWithClient(mockClient, { chip: A, pairWith: B });
  assert.equal(confA2.ok, true);
  assert.equal(confA2.confirmed, true);

  // Estado final no banco.
  const pair = currentDb.neon_warm_pairs[0];
  assert.equal(pair.status, 'confirmed');
  assert.equal(pair.confirmed_a, true);
  assert.equal(pair.confirmed_b, true);

  // Cada lado sabe para quem enviar.
  assert.equal(confA2.other, B);
  assert.equal(confB.other, A);
});

// ============================================================
// Fluxo: A conecta primeiro, mas B ainda não está online
//        → A espera (sem par) até B conectar
// ============================================================
test('INTEGRAÇÃO: A sem B online → sem par; depois B conecta e pareiam', async () => {
  currentDb = makeBaseDb();
  // Remove a sessão de B (B ainda não conectou).
  currentDb.neon_warm_sessions = [
    { id: 'sA', user_id: 'uA', phone_number_id: 'numberA', device_id: 'dA', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
  ];
  const A = '5511999999999';
  const B = '5521988887777';

  const pairA = await findOrCreatePairWithClient(mockClient, { chip: A, deviceId: 'dA' });
  assert.equal(pairA.ok, true);
  assert.equal(pairA.other, null);         // sem par disponível

  // --- B conecta (sessão criada) e chama /pair ---
  currentDb.neon_warm_sessions = [
    { id: 'sA', user_id: 'uA', phone_number_id: 'numberA', device_id: 'dA', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
    { id: 'sB', user_id: 'uB', phone_number_id: 'numberB', device_id: 'dB', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
  ];

  // B chama /pair: A não tem par criado ainda (porque não havia B), então
  // B cria um waiting apontando para A.
  const pairB = await findOrCreatePairWithClient(mockClient, { chip: B, deviceId: 'dB' });
  assert.equal(pairB.ok, true);
  assert.equal(pairB.other, A);
  assert.equal(pairB.pair.status, 'waiting');

  // A chama /pair de novo: agora é lado do par de B → promove a paired.
  const pairA2 = await findOrCreatePairWithClient(mockClient, { chip: A, deviceId: 'dA' });
  assert.equal(pairA2.ok, true);
  assert.equal(pairA2.other, B);
  assert.equal(pairA2.pair.status, 'paired');

  // Ambos confirmam.
  const cA = await confirmPairWithClient(mockClient, { chip: A, pairWith: B });
  const cB = await confirmPairWithClient(mockClient, { chip: B, pairWith: A });
  assert.equal(cB.confirmed, true);
  assert.equal(currentDb.neon_warm_pairs[0].status, 'confirmed');
});
