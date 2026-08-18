// ============================================================
// Testes dos planos de maturação por número (100% backend)
// ============================================================
// Cobre src/lib/maturation-plans.js + maturation-board.js:
//   - checkPlanAllowsPairing: sem plano → libera; pausado → bloqueia;
//     intervalo de ciclo; limite diário → auto-pausa
//   - maybeAutoResume: limite diário vira o dia → despausa
//   - bumpDailyStats via RPC (upsert por número+dia)
//   - markPairStatsCounted: atômico (só o 1º confirma incrementa)
//   - upsertPlan / pausePlan / approvePlan
//   - buildMaturationBoard: sugestão individual + global
// Usa o mock de Supabase em memória (helpers/mock-supabase.mjs).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mock-supabase.mjs';
import {
  todayStr,
  getPlanByPhoneWithClient,
  upsertPlanWithClient,
  pausePlanWithClient,
  approvePlanWithClient,
  startPlanWithClient,
  incrementCyclesWithClient,
  maybeAutoResumeWithClient,
  checkPlanAllowsPairingWithClient,
  bumpDailyStatsWithClient,
  markPairStatsCountedWithClient,
} from '../lib/maturation-plans.js';
import { buildMaturationBoardWithClient } from '../lib/maturation-board.js';

let currentDb = {};
const mockClient = createMockSupabase(() => currentDb);

function setDb(db) {
  currentDb = db;
}

function iso(msOffset) {
  return new Date(Date.now() + msOffset).toISOString();
}

function makeBaseDb() {
  return {
    neon_warm_users: [],
    neon_warm_plans: [],
    neon_warm_subscriptions: [],
    neon_warm_numbers: [
      { id: 'number1', user_id: null, phone_number: '5511999999999', phone_number_normalized: '5511999999999', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
      { id: 'number2', user_id: null, phone_number: '5521988887777', phone_number_normalized: '5521988887777', status: 'active', last_seen_at: iso(0), pairing_enabled: true },
    ],
    neon_warm_licenses: [],
    neon_warm_devices: [],
    neon_warm_sessions: [
      { id: 's1', user_id: 'u1', phone_number_id: 'number1', device_id: 'd1', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
      { id: 's2', user_id: 'u2', phone_number_id: 'number2', device_id: 'd2', status: 'active', last_heartbeat_at: iso(0), ended_at: null },
    ],
    neon_warm_logs: [],
    neon_warm_extension_keys: [],
    neon_warm_pairs: [],
    neon_warm_maturation_plans: [],
    neon_warm_daily_stats: [],
  };
}

beforeEach(() => {
  setDb(makeBaseDb());
});

// ------------------------------------------------------------
// TESTE 1 — Sem plano → libera pareamento
// ------------------------------------------------------------
test('PLAN 1: sem plano → ok=true (liberado)', async () => {
  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, true);
  assert.equal(res.plan, null);
});

// ------------------------------------------------------------
// TESTE 2 — Plano pausado → bloqueia com conta_pausada
// ------------------------------------------------------------
test('PLAN 2: plano pausado → ok=false conta_pausada', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999' });
  await pausePlanWithClient(mockClient, { phone: '5511999999999', reason: 'manual' });

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'conta_pausada');
});

// ------------------------------------------------------------
// TESTE 3 — Intervalo de ciclo: atividade recente → bloqueia com retry_after
// ------------------------------------------------------------
test('PLAN 3: ciclo ativo recente → ok=false aguardando_intervalo', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', cycleSeconds: 60 });
  // Par terminado há 10s (menos que os 60s do ciclo).
  currentDb.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'ended',
    updated_at: iso(-10 * 1000), created_at: iso(-60 * 1000),
  }];

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'aguardando_intervalo');
  assert.ok(res.retry_after >= 40 && res.retry_after <= 60, `retry_after=${res.retry_after}`);
});

// ------------------------------------------------------------
// TESTE 4 — Intervalo de ciclo já decorrido → libera
// ------------------------------------------------------------
test('PLAN 4: ciclo decorrido há > 60s → ok=true', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', cycleSeconds: 60 });
  currentDb.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'ended',
    updated_at: iso(-120 * 1000), created_at: iso(-180 * 1000),
  }];

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, true);
});

// ------------------------------------------------------------
// TESTE 5 — Limite diário atingido → bloqueia + auto-pausa
// ------------------------------------------------------------
test('PLAN 5: limite diário atingido → ok=false limite_diario_atingido', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', dailyMsgLimit: 2 });
  await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 2, received: 2 });

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'limite_diario_atingido');

  // O plano virou paused com paused_reason=daily_limit.
  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'paused');
  assert.equal(plan.paused_reason, 'daily_limit');
});

// ------------------------------------------------------------
// TESTE 6 — Abaixo do limite → libera
// ------------------------------------------------------------
test('PLAN 6: abaixo do limite → ok=true', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', dailyMsgLimit: 5 });
  await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 3, received: 3 });

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, true);
});

// ------------------------------------------------------------
// TESTE 7 — maybeAutoResume: pause por limite no MESMO dia → não despausa
// ------------------------------------------------------------
test('PLAN 7: pause por limite hoje → auto-resume NÃO despausa', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', dailyMsgLimit: 2 });
  await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 2, received: 2 });
  await checkPlanAllowsPairingWithClient(mockClient, '5511999999999'); // dispara auto-pausa

  // Mesmo dia → ainda pausado.
  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  const resumed = await maybeAutoResumeWithClient(mockClient, plan);
  assert.equal(resumed.status, 'paused');
});

// ------------------------------------------------------------
// TESTE 8 — maybeAutoResume: pause por limite em OUTRO dia → despausa
// ------------------------------------------------------------
test('PLAN 8: pause por limite em dia anterior → auto-resume despausa', async () => {
  // Plano pausado por limite com paused_at de ONTEM.
  currentDb.neon_warm_maturation_plans = [{
    id: 'plan1',
    phone_number_normalized: '5511999999999',
    daily_msg_limit: 2,
    cycle_seconds: null,
    auto_resume_daily: true,
    status: 'paused',
    paused_at: iso(-26 * 60 * 60 * 1000), // 26h atrás (dia anterior)
    paused_reason: 'daily_limit',
    approved_at: null,
    created_at: iso(-48 * 60 * 60 * 1000),
    updated_at: iso(-26 * 60 * 60 * 1000),
  }];

  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'paused');

  const resumed = await maybeAutoResumeWithClient(mockClient, plan);
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.paused_at, null);
  assert.equal(resumed.paused_reason, null);
});

// ------------------------------------------------------------
// TESTE 9 — bumpDailyStats cria linha do dia e incrementa
// ------------------------------------------------------------
test('PLAN 9: bumpDailyStats cria/atualiza stats do dia', async () => {
  const r1 = await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 1, received: 1 });
  assert.equal(r1.sent_count, 1);
  assert.equal(r1.received_count, 1);

  const r2 = await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 2, received: 0 });
  assert.equal(r2.sent_count, 3);
  assert.equal(r2.received_count, 1);

  // stats_date no fuso Brasil.
  const row = currentDb.neon_warm_daily_stats.find(
    (r) => r.phone_number_normalized === '5511999999999'
  );
  assert.equal(row.stats_date, todayStr());
});

// ------------------------------------------------------------
// TESTE 10 — markPairStatsCounted é atômico (não duplica)
// ------------------------------------------------------------
test('PLAN 10: markPairStatsCounted só conta o 1º lado', async () => {
  currentDb.neon_warm_pairs = [{
    id: 'pair1', chip_a: '5511999999999', chip_b: '5521988887777', status: 'confirmed',
    stats_counted: false, updated_at: iso(0), created_at: iso(0),
  }];

  const first = await markPairStatsCountedWithClient(mockClient, 'pair1');
  assert.equal(first, true);
  assert.equal(currentDb.neon_warm_pairs[0].stats_counted, true);

  // Segunda chamada (do outro lado) → false, não incrementa de novo.
  const second = await markPairStatsCountedWithClient(mockClient, 'pair1');
  assert.equal(second, false);
});

// ------------------------------------------------------------
// TESTE 11 — pause cria plano se não existir e marca paused
// ------------------------------------------------------------
test('PLAN 11: pause sem plano existente cria o plano pausado', async () => {
  const res = await pausePlanWithClient(mockClient, { phone: '5511999999999', reason: 'manual' });
  assert.equal(res.ok, true);
  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'paused');
  assert.equal(plan.paused_reason, 'manual');
});

// ------------------------------------------------------------
// TESTE 12 — approve despausa e marca approved_at
// ------------------------------------------------------------
test('PLAN 12: approve volta para active e marca approved_at', async () => {
  await pausePlanWithClient(mockClient, { phone: '5511999999999', reason: 'manual' });
  const res = await approvePlanWithClient(mockClient, { phone: '5511999999999' });
  assert.equal(res.ok, true);

  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'active');
  assert.equal(plan.paused_at, null);
  assert.equal(plan.paused_reason, null);
  assert.ok(plan.approved_at);
});

// ------------------------------------------------------------
// TESTE 13 — upsert valida limites (>=1 e >=30)
// ------------------------------------------------------------
test('PLAN 13: upsert normaliza limites (>=1 e >=30)', async () => {
  const res = await upsertPlanWithClient(mockClient, {
    phone: '5511999999999',
    dailyMsgLimit: 0,   // 0 → limite mínimo 1 (ilimitado = campo vazio)
    cycleSeconds: 10,   // inválido → 30 (mínimo)
  });
  assert.equal(res.ok, true);
  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.daily_msg_limit, 1);
  assert.equal(plan.cycle_seconds, 30);

  // Campo vazio → null (ilimitado / padrão da extensão).
  const res2 = await upsertPlanWithClient(mockClient, {
    phone: '5511999999999',
    dailyMsgLimit: '',
    cycleSeconds: '',
  });
  assert.equal(res2.ok, true);
  const plan2 = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan2.daily_msg_limit, null);
  assert.equal(plan2.cycle_seconds, null);
});

// ------------------------------------------------------------
// TESTE 14 — buildMaturationBoard: sugestão individual e global
// ------------------------------------------------------------
test('PLAN 14: buildMaturationBoard calcula sugestões', async () => {
  // Dois números com stats hoje; um sem plano.
  await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 4, received: 4 });
  await bumpDailyStatsWithClient(mockClient, '5521988887777', { sent: 8, received: 8 });

  const res = await buildMaturationBoardWithClient(mockClient);
  assert.equal(res.ok, true);
  assert.equal(res.stats.total_connected, 2);
  assert.equal(res.stats.with_plan, 0);
  assert.equal(res.stats.paused, 0);
  // Percentil 75 de [4, 8] = 8 (índice floor(0.75*2)=1).
  assert.equal(res.stats.suggested_limit, 8);

  const rowA = res.rows.find((r) => r.phone_number_normalized === '5511999999999');
  assert.equal(rowA.sent_today, 4);
  // Sugestão individual = max(sent, ceil(sent*1.25)) = ceil(4*1.25)=5.
  assert.equal(rowA.suggested_limit, 5);
});

// ------------------------------------------------------------
// TESTE 15 — buildMaturationBoard: com plano + limite
// ------------------------------------------------------------
test('PLAN 15: board marca at_limit quando stats >= limite', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', dailyMsgLimit: 3 });
  await bumpDailyStatsWithClient(mockClient, '5511999999999', { sent: 3, received: 3 });

  const res = await buildMaturationBoardWithClient(mockClient);
  const row = res.rows.find((r) => r.phone_number_normalized === '5511999999999');
  assert.equal(row.status, 'active');
  assert.equal(row.at_limit, true);
});

// ------------------------------------------------------------
// TESTE 16 — startPlan cria plano ativo e zera contadores
// ------------------------------------------------------------
test('PLAN 16: startPlan cria plano ativo e zera contadores', async () => {
  const res = await startPlanWithClient(mockClient, { phone: '5511999999999' });
  assert.equal(res.ok, true);

  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'active');
  assert.equal(plan.cycles_done, 0);
  assert.equal(plan.paused_reason, null);
  assert.equal(plan.paused_at, null);
});

// ------------------------------------------------------------
// TESTE 17 — incrementCycles incrementa de 1 em 1
// ------------------------------------------------------------
test('PLAN 17: incrementCycles soma corretamente', async () => {
  await startPlanWithClient(mockClient, { phone: '5511999999999' });
  const c1 = await incrementCyclesWithClient(mockClient, '5511999999999');
  assert.equal(c1, 1);
  const c2 = await incrementCyclesWithClient(mockClient, '5511999999999');
  assert.equal(c2, 2);
});

// ------------------------------------------------------------
// TESTE 18 — Limite de ciclos atingido → bloqueia + auto-pausa
// ------------------------------------------------------------
test('PLAN 18: cycle_limit atingido → ok=false limite_ciclos_atingido', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', cycleLimit: 2 });
  await startPlanWithClient(mockClient, { phone: '5511999999999' }); // zera
  await incrementCyclesWithClient(mockClient, '5511999999999');
  await incrementCyclesWithClient(mockClient, '5511999999999'); // = 2

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'limite_ciclos_atingido');

  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.status, 'paused');
  assert.equal(plan.paused_reason, 'cycle_limit');
});

// ------------------------------------------------------------
// TESTE 19 — Abaixo do limite de ciclos → libera
// ------------------------------------------------------------
test('PLAN 19: abaixo do cycle_limit → ok=true', async () => {
  await upsertPlanWithClient(mockClient, { phone: '5511999999999', cycleLimit: 5 });
  await startPlanWithClient(mockClient, { phone: '5511999999999' });
  await incrementCyclesWithClient(mockClient, '5511999999999'); // = 1 (< 5)

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, true);
});

// ------------------------------------------------------------
// TESTE 20 — Sem cycle_limit → ilimitado
// ------------------------------------------------------------
test('PLAN 20: sem cycle_limit → nunca bloqueia por ciclo', async () => {
  await startPlanWithClient(mockClient, { phone: '5511999999999' });
  await incrementCyclesWithClient(mockClient, '5511999999999');
  await incrementCyclesWithClient(mockClient, '5511999999999');
  await incrementCyclesWithClient(mockClient, '5511999999999');

  const res = await checkPlanAllowsPairingWithClient(mockClient, '5511999999999');
  assert.equal(res.ok, true);
});

// ------------------------------------------------------------
// TESTE 21 — upsert normaliza cycle_limit (>= 1)
// ------------------------------------------------------------
test('PLAN 21: upsert normaliza cycle_limit (>= 1)', async () => {
  const res = await upsertPlanWithClient(mockClient, { phone: '5511999999999', cycleLimit: 0 });
  assert.equal(res.ok, true);
  const plan = await getPlanByPhoneWithClient(mockClient, '5511999999999');
  assert.equal(plan.cycle_limit, 1);
});
