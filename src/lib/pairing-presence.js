// ============================================================
// Presença de sessão (regra central de "quem está online")
// ============================================================
// Uma única função decide se uma sessão conta como "online" para o
// pareamento. NÃO espalhar regras de status/heartbeat pelo código.
//
// Critérios (todos precisam ser verdadeiros):
//   - status === 'active'
//   - last_heartbeat_at dentro da janela permitida (PRESENCE_WINDOW_MS)
//   - não encerrada (sem ended_at)
//   - não revogada (status não é 'revoked'/'expired'/'ended')
//   - phone_number_id presente (a sessão está vinculada a um número)
//
// A janela é configurável via env:
//   NEON_WARM_PRESENCE_MS  (padrão: 3 minutos)
// ============================================================

export const DEFAULT_PRESENCE_WINDOW_MS = 3 * 60 * 1000; // 3 min

export function presenceWindowMs() {
  const raw = Number(process.env.NEON_WARM_PRESENCE_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_PRESENCE_WINDOW_MS;
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * Uma sessão é considerada ONLINE quando todos os critérios abaixo
 * são verdadeiros. Retorna { online: true } ou { online: false, reason }.
 *
 * @param {object} session  Registro de neon_warm_sessions.
 * @param {number} [windowMs]  Janela de presença em ms (usa a configurada).
 */
export function isSessionOnline(session, windowMs = presenceWindowMs()) {
  if (!session || typeof session !== 'object') {
    return { online: false, reason: 'no_session' };
  }

  // 1. Status ativo e não encerrado/revogado.
  if (session.status !== 'active') {
    return { online: false, reason: `status_${session.status || 'unknown'}` };
  }

  // 2. Não pode ter encerrado.
  if (session.ended_at) {
    return { online: false, reason: 'session_ended' };
  }

  // 3. Heartbeat dentro da janela.
  if (!session.last_heartbeat_at) {
    return { online: false, reason: 'no_heartbeat' };
  }
  const last = new Date(session.last_heartbeat_at).getTime();
  if (!Number.isFinite(last) || Date.now() - last > windowMs) {
    return { online: false, reason: 'heartbeat_stale' };
  }

  // 4. Vinculada a um número (para podermos devolver o telefone).
  if (!session.phone_number_id) {
    return { online: false, reason: 'no_phone_number' };
  }

  return { online: true };
}
