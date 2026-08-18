// ============================================================
// Planos de maturação por número (100% backend)
// ============================================================
// Regras de plano (limite diário + intervalo de ciclo + pausa) que o
// painel admin configura por NÚMERO e o backend ENFORÇA no /pair.
//
// IMPORTANTE: a extensão atual (NeonDev v1.0.4 / Neon Warm v1.0.5)
// NÃO é modificada. Ela chama /pair a cada ciclo; quando o backend
// responde HTTP 503 (code 0), a extensão espera ~15s e tenta de novo
// (não cai na lista local). Portanto, "limite atingido" e "pausado"
// são aplicados simplesmente NEGANDO o par com 503 — e "aprovado"/
// "virou o dia" é devolver par normalmente. A extensão retoma sozinha.
//
// Este módulo NÃO importa o supabase-js: recebe o client por injeção
// (testável com mock). O wrapper com o client real fica em
// maturation.js (se existir) ou é chamado direto das rotas.
//
// Estruturas:
//   neon_warm_maturation_plans (1 por número):
//     phone_number_normalized, daily_msg_limit, cycle_seconds,
//     auto_resume_daily, status (active/paused), paused_at,
//     paused_reason, approved_at
//   neon_warm_daily_stats (1 por número+dia):
//     phone_number_normalized, stats_date 'YYYY-MM-DD',
//     sent_count, received_count
//   neon_warm_pairs.stats_counted (bool) — evita contar o mesmo par 2x
import { normalizePhone } from './phone.js';

export const PLAN_TABLE = 'neon_warm_maturation_plans';
export const STATS_TABLE = 'neon_warm_daily_stats';

export function todayStr() {
  // Fuso do operador (Brasil). O servidor roda em UTC; usamos o mesmo
  // fuso do painel (America/Sao_Paulo) para a "virada do dia" acontecer
  // no horário local do operador.
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Carrega o plano de um número (ou null se não houver).
 * Plano ausente = sem limite (backward compatibility: tudo liberado).
 */
export async function getPlanByPhoneWithClient(client, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await client
    .from(PLAN_TABLE)
    .select('*')
    .eq('phone_number_normalized', normalized)
    .maybeSingle();
  if (error) {
    console.error('[maturation] erro ao buscar plano:', error.message);
    return null;
  }
  return data || null;
}

/**
 * Cria (ou atualiza) o plano de um número. Retorna o plano salvo.
 */
export async function upsertPlanWithClient(
  client,
  { phone, dailyMsgLimit = null, cycleSeconds = null, autoResumeDaily = true, status = 'active' }
) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const payload = {
    phone_number_normalized: normalized,
    daily_msg_limit: dailyMsgLimit === null || dailyMsgLimit === '' ? null : Math.max(1, Math.round(Number(dailyMsgLimit) || 0) || null),
    cycle_seconds: cycleSeconds === null || cycleSeconds === '' ? null : Math.max(30, Math.round(Number(cycleSeconds) || 0) || null),
    auto_resume_daily: autoResumeDaily !== false,
    status: status === 'paused' ? 'paused' : 'active',
  };
  if (status === 'paused') payload.paused_at = new Date().toISOString();

  const { data, error } = await client
    .from(PLAN_TABLE)
    .upsert(payload, { onConflict: 'phone_number_normalized' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[maturation] erro ao salvar plano:', error.message);
    return { ok: false, reason: 'internal_error', error: error.message };
  }
  return { ok: true, plan: data };
}

/**
 * Pausa o plano de um número (pareamento suspenso).
 */
export async function pausePlanWithClient(client, { phone, reason = 'manual' }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  // Garante que existe um plano (cria com padrões se não houver).
  const existing = await getPlanByPhoneWithClient(client, normalized);
  if (!existing) {
    const created = await upsertPlanWithClient(client, { phone: normalized });
    if (!created.ok) return created;
  }

  const { data, error } = await client
    .from(PLAN_TABLE)
    .update({ status: 'paused', paused_at: new Date().toISOString(), paused_reason: reason || 'manual' })
    .eq('phone_number_normalized', normalized)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[maturation] erro ao pausar plano:', error.message);
    return { ok: false, reason: 'internal_error', error: error.message };
  }
  return { ok: true, plan: data };
}

/**
 * Aprova/continua (despausa) o plano de um número.
 */
export async function approvePlanWithClient(client, { phone }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, reason: 'invalid_phone' };

  const { data, error } = await client
    .from(PLAN_TABLE)
    .update({
      status: 'active',
      paused_at: null,
      paused_reason: null,
      approved_at: new Date().toISOString(),
    })
    .eq('phone_number_normalized', normalized)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[maturation] erro ao aprovar plano:', error.message);
    return { ok: false, reason: 'internal_error', error: error.message };
  }
  if (!data) return { ok: false, reason: 'no_plan' };
  return { ok: true, plan: data };
}

/**
 * Aplica o desbloqueio automático diário: se o plano está pausado por
 * limite diário (paused_reason = 'daily_limit') e auto_resume_daily e
 * o dia mudou desde o pause, volta para active.
 *
 * Chamado no início do enforcement do /pair, para que o plano fique
 * "ativo" de novo no dia seguinte sem o operador precisar aprovar.
 */
export async function maybeAutoResumeWithClient(client, plan) {
  if (!plan) return plan;
  if (plan.status !== 'paused') return plan;
  if (plan.paused_reason !== 'daily_limit') return plan;
  if (!plan.auto_resume_daily) return plan;
  if (!plan.paused_at) return plan;

  const pausedDay = new Date(plan.paused_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (pausedDay === todayStr()) return plan;

  // Dia mudou → despausa automaticamente.
  const { data } = await client
    .from(PLAN_TABLE)
    .update({ status: 'active', paused_at: null, paused_reason: null, approved_at: new Date().toISOString() })
    .eq('phone_number_normalized', plan.phone_number_normalized)
    .select('*')
    .maybeSingle();
  return data || plan;
}

/**
 * Busca a última atividade de um número em neon_warm_pairs (pares
 * terminados ou ativos), para calcular o intervalo de ciclo.
 * @returns {Promise<Date|null>} data da última atividade ou null.
 */
export async function lastPairActivityWithClient(client, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data } = await client
    .from('neon_warm_pairs')
    .select('updated_at')
    .or(`chip_a.eq.${normalized},chip_b.eq.${normalized}`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.updated_at ? new Date(data.updated_at) : null;
}

/**
 * Busca as estatísticas do dia de um número.
 * @returns {Promise<{sent_count:number, received_count:number, stats_date:string}|null>}
 */
export async function getDailyStatsWithClient(client, phone, date = todayStr()) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data } = await client
    .from(STATS_TABLE)
    .select('sent_count, received_count, stats_date')
    .eq('phone_number_normalized', normalized)
    .eq('stats_date', date)
    .maybeSingle();
  return data || { sent_count: 0, received_count: 0, stats_date: date };
}

/**
 * Verifica se um número pode parear agora, aplicando as regras do plano.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, plan?: object|null, stats?: object|null }>}
 *   ok=true  → pode parear.
 *   ok=false → NÃO pode; reason indica o motivo (o /pair deve responder 503).
 */
export async function checkPlanAllowsPairingWithClient(client, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: true }; // telefone inválido nem chega aqui; não bloqueia

  let plan = await getPlanByPhoneWithClient(client, normalized);
  if (!plan) return { ok: true, plan: null, stats: await getDailyStatsWithClient(client, normalized) };

  // Desbloqueio automático diário (limite diário expirado).
  plan = await maybeAutoResumeWithClient(client, plan);

  // 1. Pausado manualmente → bloqueia.
  if (plan.status === 'paused') {
    return { ok: false, reason: 'conta_pausada', plan, stats: await getDailyStatsWithClient(client, normalized) };
  }

  // 2. Intervalo mínimo entre ciclos (cycle_seconds).
  if (plan.cycle_seconds && plan.cycle_seconds >= 30) {
    const last = await lastPairActivityWithClient(client, normalized);
    if (last) {
      const elapsedMs = Date.now() - last.getTime();
      if (elapsedMs < plan.cycle_seconds * 1000) {
        return {
          ok: false,
          reason: 'aguardando_intervalo',
          plan,
          stats: await getDailyStatsWithClient(client, normalized),
          retry_after: Math.max(1, Math.ceil((plan.cycle_seconds * 1000 - elapsedMs) / 1000)),
        };
      }
    }
  }

  // 3. Limite diário de envios.
  const stats = await getDailyStatsWithClient(client, normalized);
  if (plan.daily_msg_limit && stats.sent_count >= plan.daily_msg_limit) {
    // Auto-pausa: marca como pausado por limite (para o operador ver no
    // painel e aprovar, OU para o auto-resume liberar no dia seguinte).
    await client
      .from(PLAN_TABLE)
      .update({ status: 'paused', paused_at: new Date().toISOString(), paused_reason: 'daily_limit' })
      .eq('phone_number_normalized', normalized)
      .then(() => {})
      .catch(() => {});
    return { ok: false, reason: 'limite_diario_atingido', plan, stats };
  }

  return { ok: true, plan, stats };
}

/**
 * Conta uma mensagem trocada (par confirmado) para um número.
 * Incrementa sent_count (se este lado enviou) e received_count (se o
 * outro lado enviou). Usado no /validate quando o par vira confirmed.
 *
 * O retorno da RPC é [ { sent, received } ] (array de uma linha).
 */
export async function bumpDailyStatsWithClient(client, phone, { sent = 0, received = 0, date = todayStr() }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await client.rpc('neon_warm_bump_daily_stats', {
    p_phone: normalized,
    p_date: date,
    p_sent_delta: sent,
    p_received_delta: received,
  });
  if (error) {
    console.error('[maturation] erro ao incrementar stats:', error.message);
    return null;
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
  return row ? { sent_count: Number(row.sent ?? 0), received_count: Number(row.received ?? 0) } : null;
}

/**
 * Marca um par como "contado" (stats_counted = true) de forma atômica.
 * Só retorna true se a linha foi realmente atualizada (ou seja, ainda
 * não tinha sido contada por nenhum dos lados).
 */
export async function markPairStatsCountedWithClient(client, pairId) {
  const { data, error } = await client
    .from('neon_warm_pairs')
    .update({ stats_counted: true })
    .eq('id', pairId)
    .eq('stats_counted', false)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[maturation] erro ao marcar par contado:', error.message);
    return false;
  }
  return Boolean(data);
}
