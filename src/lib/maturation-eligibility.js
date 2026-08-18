// ============================================================
// Elegibilidade para "Iniciar Maturação" (tela Números do ADM)
// ============================================================
// Regra CENTRAL de "quem pode ter o botão 🌡️ Iniciar habilitado".
// Não duplica o executor — só decide quem é elegível. O executor
// continua sendo startPlanWithClient (src/lib/maturation-plans.js),
// chamado pela rota /admin/numbers/action.
//
// Critérios (todos precisam ser verdadeiros):
//   - usuário online       → sessão ativa com heartbeat recente
//                            (mesma regra do pareamento: isSessionOnline)
//   - número ativo         → neon_warm_numbers.status === 'active'
//   - extensão conectada   → a sessão existe e está online (acima)
//   - número autorizado    → registrado no painel (está na lista) + ativo
//   - não bloqueado        → plano NÃO está banido
//   - não restrito         → plano NÃO está restrito
//   - não pausado          → plano NÃO está pausado
//
// Fonte da verdade de "online": neon_warm_sessions (isSessionOnline).
// Fonte da verdade do plano: neon_warm_maturation_plans.
//
// Não importa o supabase-js: recebe o client por injeção (testável).
import { isSessionOnline, presenceWindowMs } from './pairing-presence.js';
import { isPenaltyStatus } from './maturation-plans.js';

export const NUMBER_TABLE = 'neon_warm_numbers';
export const SESSION_TABLE = 'neon_warm_sessions';
export const PLAN_TABLE = 'neon_warm_maturation_plans';

/**
 * Enriquece linhas de neon_warm_numbers com:
 *   - online / online_reason      (sessão ativa + heartbeat recente)
 *   - plan_status / has_plan      (plano de maturação)
 *   - eligible / ineligible_reason (regra central acima)
 *   - campos de exibição          (limites, ciclos, última atividade)
 *
 * @param {object} client  Client Supabase (injetado).
 * @param {Array}  numbers Linhas de neon_warm_numbers (já com o select feito).
 * @returns {Promise<{ ok: boolean, rows?: Array, error?: string }>}
 */
export async function buildNumberMaturationRowsWithClient(client, numbers = []) {
  const valid = (numbers || []).filter((n) => n && n.id);
  if (!valid.length) return { ok: true, rows: [] };

  try {
    // Busca TODAS as sessões ativas vinculadas a estes números (sem filtrar
    // por heartbeat): quem decide se está dentro da janela é isSessionOnline
    // (regra central única). Assim o motivo fica correto: heartbeat_stale
    // quando a sessão existe mas o heartbeat envelheceu, no_session quando
    // não há sessão ativa alguma.
    const numberIds = valid.map((n) => n.id).filter(Boolean);
    const phones = valid.map((n) => n.phone_number_normalized).filter(Boolean);

    let sessions = [];
    if (numberIds.length) {
      const { data, error } = await client
        .from(SESSION_TABLE)
        .select('id, user_id, phone_number_id, device_id, status, last_heartbeat_at, ended_at, started_at')
        .eq('status', 'active')
        .is('ended_at', null)
        .in('phone_number_id', numberIds);
      if (error) return { ok: false, error: error.message };
      sessions = data || [];
    }

    // Uma sessão por número (a mais recente).
    const sessionByNumberId = new Map();
    for (const s of sessions) {
      if (!s.phone_number_id) continue;
      const existing = sessionByNumberId.get(s.phone_number_id);
      if (!existing || new Date(s.last_heartbeat_at) > new Date(existing.last_heartbeat_at)) {
        sessionByNumberId.set(s.phone_number_id, s);
      }
    }

    // ---- Planos de maturação por número ----
    let plans = [];
    if (phones.length) {
      const { data, error } = await client
        .from(PLAN_TABLE)
        .select('*')
        .in('phone_number_normalized', phones);
      if (error) return { ok: false, error: error.message };
      plans = data || [];
    }
    const planByPhone = new Map(plans.map((p) => [p.phone_number_normalized, p]));

    // ---- Monta as linhas ----
    const rows = valid.map((n) => {
      const session = sessionByNumberId.get(n.id) || null;
      const online = session ? isSessionOnline(session) : { online: false, reason: 'no_session' };
      const plan = planByPhone.get(n.phone_number_normalized) || null;
      const planStatus = plan?.status || 'no_plan';

      const isNumberActive = n.status === 'active';
      const notPenalized = !isPenaltyStatus(planStatus);
      const notPaused = planStatus !== 'paused';
      const eligible = online.online === true && isNumberActive && notPenalized && notPaused;

      let ineligibleReason = null;
      if (!online.online) {
        ineligibleReason = online.reason || 'offline';
      } else if (!isNumberActive) {
        ineligibleReason = n.status === 'blocked' ? 'blocked' : 'number_not_active';
      } else if (planStatus === 'banned') {
        ineligibleReason = 'banned';
      } else if (planStatus === 'restricted') {
        ineligibleReason = 'restricted';
      } else if (planStatus === 'paused') {
        ineligibleReason = 'paused';
      }

      return {
        number_id: n.id,
        phone_number: n.phone_number,
        phone_number_normalized: n.phone_number_normalized,
        user_name: n.neon_warm_users?.name || n.neon_warm_users?.email || null,
        number_status: n.status,
        // Online / conexão
        online: online.online,
        online_reason: online.reason,
        last_heartbeat_at: session?.last_heartbeat_at ?? null,
        last_seen_at: n.last_seen_at ?? null,
        device_count: n.neon_warm_devices?.length ?? 0,
        // Plano / maturação
        plan_status: planStatus,
        has_plan: Boolean(plan),
        daily_msg_limit: plan?.daily_msg_limit ?? null,
        cycle_seconds: plan?.cycle_seconds ?? null,
        cycle_limit: plan?.cycle_limit ?? null,
        cycles_done: plan?.cycles_done ?? 0,
        paused_reason: plan?.paused_reason ?? null,
        paused_at: plan?.paused_at ?? null,
        flag_reason: plan?.flag_reason ?? null,
        flagged_at: plan?.flagged_at ?? null,
        // Elegibilidade (regra central)
        eligible,
        ineligible_reason: ineligibleReason,
      };
    });

    // Ordena: elegíveis primeiro? Não — mantém a ordem recebida (a tela já
    // ordena por created_at desc). Vem do servidor como veio do select.
    return { ok: true, rows };
  } catch (err) {
    console.error('[maturation-eligibility] exceção:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Separa uma lista de telefones (selecionados no ADM) entre elegíveis e
 * não disponíveis, com o motivo de cada um. Usado pelo "iniciar em massa".
 *
 * @param {Array} rows   Linhas enriquecidas (buildNumberMaturationRowsWithClient).
 * @param {Array} phones Lista de telefones normalizados selecionados.
 * @returns {{ eligible: Array, ineligible: Array }}
 *   eligible  → [{ phone_number_normalized, ...row }]
 *   ineligible→ [{ phone, reason }]
 */
export function classifyEligibleRows(rows, phones) {
  const byPhone = new Map((rows || []).map((r) => [r.phone_number_normalized, r]));
  const eligible = [];
  const ineligible = [];
  for (const p of phones) {
    const r = byPhone.get(p);
    if (!r) {
      ineligible.push({ phone: p, reason: 'number_not_found' });
      continue;
    }
    if (r.eligible) eligible.push(r);
    else ineligible.push({ phone: r.phone_number_normalized, reason: r.ineligible_reason || 'not_eligible' });
  }
  return { eligible, ineligible };
}
