// ============================================================
// Quadro de planos de maturação (painel admin)
// ============================================================
// Monta a visão que o operador vê em /admin/plans: para cada número
// conectado, mostra o plano atual (limite diário, intervalo de ciclo,
// status pausado/ativo), as estatísticas de HOJE (enviadas/recebidas),
// a última atividade, e a SUGESTÃO automática de plano.
//
// Sugestão automática: baseada nas contas "saudáveis" (que estão
// trocando mensagens). Usa o percentil 75 das enviadas do dia entre
// as contas com stats > 0 como limite sugerido, e o espaçamento
// mediano entre atividades como intervalo de ciclo sugerido.
//
// Recebe o client por injeção (testável). Não expõe conteúdo de
// mensagens — apenas contadores e telefones.
import { todayStr } from './maturation-plans.js';

const PLAN_TABLE = 'neon_warm_maturation_plans';
const STATS_TABLE = 'neon_warm_daily_stats';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/**
 * Monta o quadro de planos.
 *
 * @param {object} client  Client Supabase (injetado).
 * @returns {Promise<{ ok: boolean, rows?: Array, stats?: object, error?: string }>}
 */
export async function buildMaturationBoardWithClient(client) {
  const date = todayStr();

  try {
    // ---- 1. Todos os planos ----
    const { data: plans, error: plansErr } = await client
      .from(PLAN_TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (plansErr) {
      console.error('[board-plans] erro ao buscar planos:', plansErr.message);
      return { ok: false, error: plansErr.message };
    }

    // ---- 1b. Números conectados (mesmo critério do painel de pareamento):
    // números com sessão ativa recente. Permite mostrar "Iniciar maturação"
    // para números conectados sem plano ainda.
    const { data: connectedNumbers } = await client
      .from('neon_warm_numbers')
      .select('phone_number_normalized')
      .eq('status', 'active');
    const connectedSet = new Set((connectedNumbers || []).map((n) => n.phone_number_normalized));

    // ---- 2. Stats de hoje ----
    const { data: statsRows, error: statsErr } = await client
      .from(STATS_TABLE)
      .select('phone_number_normalized, sent_count, received_count, last_activity_at')
      .eq('stats_date', date)
      .limit(500);
    if (statsErr) {
      console.error('[board-plans] erro ao buscar stats:', statsErr.message);
      return { ok: false, error: statsErr.message };
    }

    // ---- 3. Última atividade por número (pares) ----
    // Pega os pares mais recentes para calcular intervalos e o "último par".
    const { data: lastPairs } = await client
      .from('neon_warm_pairs')
      .select('chip_a, chip_b, status, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    const lastActivityByPhone = new Map();
    const pairCountByPhone = new Map();
    const spacingByPhone = new Map();
    if (lastPairs) {
      // Coleta intervalos entre atividades consecutivas por número.
      const activityTimes = new Map(); // phone -> array de timestamps
      for (const p of lastPairs) {
        const t = p.updated_at ? new Date(p.updated_at).getTime() : null;
        for (const side of [p.chip_a, p.chip_b]) {
          if (!side) continue;
          if (t) {
            if (!activityTimes.has(side)) activityTimes.set(side, []);
            activityTimes.get(side).push(t);
          }
          const last = lastActivityByPhone.get(side);
          if (!last || (t && t > new Date(last).getTime())) lastActivityByPhone.set(side, p.updated_at);
          pairCountByPhone.set(side, (pairCountByPhone.get(side) || 0) + 1);
        }
      }
      for (const [phone, times] of activityTimes) {
        const sorted = times.sort((a, b) => a - b);
        if (sorted.length >= 2) {
          const gaps = [];
          for (let i = 1; i < sorted.length; i++) gaps.push(Math.round((sorted[i] - sorted[i - 1]) / 1000));
          spacingByPhone.set(phone, gaps);
        }
      }
    }

    // ---- 4. Junta tudo ----
    const statsByPhone = new Map();
    for (const s of statsRows || []) statsByPhone.set(s.phone_number_normalized, s);

    const phones = new Set([
      ...(plans || []).map((p) => p.phone_number_normalized),
      ...statsByPhone.keys(),
      ...connectedSet,
    ]);

    const rows = [];
    for (const phone of phones) {
      const plan = (plans || []).find((p) => p.phone_number_normalized === phone) || null;
      const stats = statsByPhone.get(phone) || { sent_count: 0, received_count: 0, last_activity_at: null };
      const sentToday = Number(stats.sent_count ?? 0);
      const receivedToday = Number(stats.received_count ?? 0);

      // Sugestão individual: baseada no próprio ritmo (se houver dados).
      const gaps = spacingByPhone.get(phone) || [];
      const suggestedCycle = median(gaps) && median(gaps) >= 30 ? median(gaps) : null;
      const suggestedLimit = sentToday > 0 ? Math.max(sentToday, Math.ceil(sentToday * 1.25)) : null;

      const cyclesDone = Number(plan?.cycles_done ?? 0);
      const cycleLimit = plan?.cycle_limit ?? null;

      rows.push({
        phone_number_normalized: phone,
        plan,
        connected: connectedSet.has(phone),
        daily_msg_limit: plan?.daily_msg_limit ?? null,
        cycle_seconds: plan?.cycle_seconds ?? null,
        cycle_limit: cycleLimit,
        cycles_done: cyclesDone,
        at_cycle_limit: Boolean(cycleLimit) && cyclesDone >= cycleLimit,
        status: plan?.status ?? 'no_plan',
        auto_resume_daily: plan?.auto_resume_daily ?? true,
        paused_at: plan?.paused_at ?? null,
        paused_reason: plan?.paused_reason ?? null,
        approved_at: plan?.approved_at ?? null,
        sent_today: sentToday,
        received_today: receivedToday,
        last_activity_at: stats.last_activity_at ?? lastActivityByPhone.get(phone) ?? null,
        last_pair_at: lastActivityByPhone.get(phone) ?? null,
        pair_count: pairCountByPhone.get(phone) ?? 0,
        suggested_limit: suggestedLimit,
        suggested_cycle: suggestedCycle,
        at_limit: Boolean(plan?.daily_msg_limit) && sentToday >= plan.daily_msg_limit,
      });
    }

    // Ordena: pausados primeiro, depois por último par mais recente.
    rows.sort((a, b) => {
      const pa = a.status === 'paused' ? 0 : 1;
      const pb = b.status === 'paused' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.last_pair_at || 0) - new Date(a.last_pair_at || 0);
    });

    // ---- 5. Sugestão global (baseada nas contas saudáveis) ----
    const sentValues = rows.filter((r) => r.sent_today > 0).map((r) => r.sent_today);
    const gapValues = [];
    for (const gaps of spacingByPhone.values()) gapValues.push(...gaps);
    const healthyGaps = gapValues.filter((g) => g >= 30 && g <= 30 * 60);

    const stats = {
      date,
      total_connected: rows.length,
      with_plan: rows.filter((r) => r.status !== 'no_plan').length,
      paused: rows.filter((r) => r.status === 'paused').length,
      at_limit: rows.filter((r) => r.at_limit).length,
      suggested_limit: sentValues.length >= 2 ? percentile(sentValues, 75) : null,
      suggested_cycle: healthyGaps.length >= 2 ? median(healthyGaps) : null,
    };

    return { ok: true, rows, stats };
  } catch (err) {
    console.error('[board-plans] exceção ao montar quadro:', err.message);
    return { ok: false, error: err.message };
  }
}
