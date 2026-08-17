#!/usr/bin/env node
// ============================================================
// DEMONSTRAÇÃO CONTROLADA do pareamento real (seção 11 do pedido)
// ============================================================
// Simula DUAS contas do WhatsApp Web (A e B), cada uma com a extensão:
//   1. valida licença → cria sessão ativa no servidor
//   2. chama /api/maturador/pair (envia phone_number, session_id, device_id)
//   3. recebe pairWith (o número do outro)
//   4. confirma via /validate
//
// Resultado esperado:
//   Conta A: pairWith = Conta B
//   Conta B: pairWith = Conta A
//
// Usa pairing-core.js com mock de Supabase em memória — a MESMA lógica
// que o backend real executa (sessões são a fonte da verdade de "online").
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import { findOrCreatePairWithClient, confirmPairWithClient } from '../lib/pairing-core.js';

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

function makeDb() {
  const now = iso(0);
  return {
    neon_warm_users: [],
    neon_warm_plans: [],
    neon_warm_subscriptions: [],
    neon_warm_numbers: [
      { id: 'numA', user_id: 'uA', phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', last_seen_at: now, pairing_enabled: true },
      { id: 'numB', user_id: 'uB', phone_number: '5511988888888', phone_number_normalized: '5511988888888', status: 'active', last_seen_at: now, pairing_enabled: true },
    ],
    neon_warm_licenses: [],
    neon_warm_devices: [],
    // Sessões criadas pelos /session/start de cada extensão.
    neon_warm_sessions: [
      { id: 'sA', user_id: 'uA', phone_number_id: 'numA', device_id: 'devA', status: 'active', last_heartbeat_at: now, ended_at: null },
      { id: 'sB', user_id: 'uB', phone_number_id: 'numB', device_id: 'devB', status: 'active', last_heartbeat_at: now, ended_at: null },
    ],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
    neon_warm_pairs: [],
  };
}

const db = makeDb();
const client = createMockSupabase(() => db);

const A = '5511999999999';
const B = '5511988888888';
const SESS_A = 'sA';
const SESS_B = 'sB';
const DEV_A = 'devA';
const DEV_B = 'devB';

console.log('==============================================================');
console.log('  DEMONSTRAÇÃO DE PAREAMENTO REAL (duas contas conectadas)');
console.log('==============================================================\n');
console.log(`Conta A: ${A} (sessão ${SESS_A}, device ${DEV_A})`);
console.log(`Conta B: ${B} (sessão ${SESS_B}, device ${DEV_B})\n`);

// --- Conta A chama /pair (com session_id + device_id) ---
const pairA = await findOrCreatePairWithClient(client, {
  chip: A,
  sessionId: SESS_A,
  deviceId: DEV_A,
});
console.log('▶ Conta A chama /pair...');
console.log(`   resposta: ok=${pairA.ok} pairWith=${pairA.other} status=${pairA.pair?.status}`);
if (pairA.other !== B) {
  console.error('   ✗ A não recebeu B — FALHA');
  process.exit(1);
}
console.log('   ✓ Conta A recebeu Conta B\n');

// --- Conta A confirma (abriu o chat com B) ---
const confA = await confirmPairWithClient(client, { chip: A, pairWith: B });
console.log(`▶ Conta A confirma /validate... confirmados=${confA.confirmed}\n`);

// --- Conta B chama /pair ---
const pairB = await findOrCreatePairWithClient(client, {
  chip: B,
  sessionId: SESS_B,
  deviceId: DEV_B,
});
console.log('▶ Conta B chama /pair...');
console.log(`   resposta: ok=${pairB.ok} pairWith=${pairB.other} status=${pairB.pair?.status}`);
if (pairB.other !== A) {
  console.error('   ✗ B não recebeu A — FALHA');
  process.exit(1);
}
console.log('   ✓ Conta B recebeu Conta A\n');

// --- Conta B confirma ---
const confB = await confirmPairWithClient(client, { chip: B, pairWith: A });
console.log(`▶ Conta B confirma /validate... confirmados=${confB.confirmed}\n`);

// --- A confirma de novo (agora ambos) ---
const confA2 = await confirmPairWithClient(client, { chip: A, pairWith: B });
console.log(`▶ Conta A confirma novamente /validate... confirmados=${confA2.confirmed}\n`);

const finalPair = db.neon_warm_pairs[0];
console.log('==============================================================');
console.log('  RESULTADO FINAL');
console.log('==============================================================');
console.log(`Par no banco: ${finalPair.chip_a} ↔ ${finalPair.chip_b}`);
console.log(`status: ${finalPair.status}`);
console.log(`confirmed_a: ${finalPair.confirmed_a} | confirmed_b: ${finalPair.confirmed_b}`);
console.log('');

if (finalPair.status === 'confirmed' && finalPair.confirmed_a && finalPair.confirmed_b) {
  console.log('✅ SUCESSO: ambas as contas estão pareadas e podem trocar mensagens.');
  console.log(`   A envia para ${B}; B envia para ${A}.`);
} else {
  console.log('❌ FALHA: o par não atingiu o estado confirmado.');
  process.exit(1);
}
