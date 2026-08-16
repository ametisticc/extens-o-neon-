// ============================================================
// Gerenciador de sessões Neon Warm
// ============================================================
// O token de sessão é gerado no servidor, retornado UMA vez ao
// cliente, e armazenado no banco apenas como hash (sha256).
import { getSupabaseAdmin, DB } from './supabase.js';
import { sha256, randomToken, generateSessionToken } from './crypto.js';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Inicia uma nova sessão para um número autorizado.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.phoneNumberId
 * @param {string|null} params.deviceId  (uuid do registro de dispositivo, se houver)
 * @returns {Promise<{ ok: boolean, session?: object, token?: string, reason?: string }>}
 */
export async function startSession({ userId, phoneNumberId, deviceId }) {
  const token = generateSessionToken();
  const tokenHash = sha256(token);

  const { data, error } = await getSupabaseAdmin()
    .from(DB.SESSIONS)
    .insert({
      user_id: userId,
      phone_number_id: phoneNumberId,
      device_id: deviceId || null,
      session_token_hash: tokenHash,
      started_at: nowIso(),
      last_heartbeat_at: nowIso(),
      status: 'active',
    })
    .select('id, user_id, phone_number_id, device_id, started_at, status')
    .maybeSingle();

  if (error) {
    console.error('[session] erro ao criar sessão:', error.message);
    return { ok: false, reason: 'internal_error' };
  }

  return { ok: true, session: data, token };
}

/**
 * Atualiza o heartbeat de uma sessão ativa.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string|null} params.phoneNumberId
 * @returns {Promise<{ ok: boolean, reason?: string, session?: object }>}
 */
export async function heartbeatSession({ sessionId, phoneNumberId }) {
  const now = nowIso();

  const { data: session, error: fetchError } = await getSupabaseAdmin()
    .from(DB.SESSIONS)
    .select('id, user_id, phone_number_id, device_id, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[session] erro ao buscar sessão:', fetchError.message);
    return { ok: false, reason: 'internal_error' };
  }

  if (!session) {
    return { ok: false, reason: 'session_not_found' };
  }

  if (session.status !== 'active') {
    return { ok: false, reason: 'session_not_active' };
  }

  const updates = { last_heartbeat_at: now };

  // Se o número foi informado e a sessão ainda não o tem, atualiza.
  if (phoneNumberId && !session.phone_number_id) {
    updates.phone_number_id = phoneNumberId;
  }

  const { data: updated, error: updateError } = await getSupabaseAdmin()
    .from(DB.SESSIONS)
    .update(updates)
    .eq('id', sessionId)
    .select('id, user_id, phone_number_id, device_id, started_at, last_heartbeat_at, status')
    .maybeSingle();

  if (updateError) {
    console.error('[session] erro ao atualizar heartbeat:', updateError.message);
    return { ok: false, reason: 'internal_error' };
  }

  // Atualiza last_seen_at do número vinculado (se houver)
  if (updated.phone_number_id) {
    getSupabaseAdmin()
      .from(DB.NUMBERS)
      .update({ last_seen_at: now })
      .eq('id', updated.phone_number_id)
      .then(() => {})
      .catch(() => {});
  }

  return { ok: true, session: updated };
}

/**
 * Encerra uma sessão ativa.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @returns {Promise<{ ok: boolean, reason?: string, session?: object }>}
 */
export async function endSession({ sessionId }) {
  const { data: session, error: fetchError } = await getSupabaseAdmin()
    .from(DB.SESSIONS)
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[session] erro ao buscar sessão:', fetchError.message);
    return { ok: false, reason: 'internal_error' };
  }

  if (!session) {
    return { ok: false, reason: 'session_not_found' };
  }

  if (session.status === 'ended') {
    return { ok: true, session };
  }

  const { data: updated, error: updateError } = await getSupabaseAdmin()
    .from(DB.SESSIONS)
    .update({ status: 'ended', ended_at: nowIso() })
    .eq('id', sessionId)
    .select('id, user_id, phone_number_id, device_id, started_at, last_heartbeat_at, ended_at, status')
    .maybeSingle();

  if (updateError) {
    console.error('[session] erro ao encerrar sessão:', updateError.message);
    return { ok: false, reason: 'internal_error' };
  }

  return { ok: true, session: updated };
}

// Re-exporta utilitário de hash para uso interno/tests
export { sha256, randomToken };
