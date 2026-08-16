// ============================================================
// Log de eventos (neon_warm_logs)
// ============================================================
// NUNCA registra conteúdo de mensagens do WhatsApp.
import { getSupabaseAdmin, DB } from './supabase.js';

/**
 * Registra um evento de log. Falhas de escrita não derrubam a requisição.
 * @param {object} params
 * @param {string} params.eventType  Um dos eventos padronizados.
 * @param {object} [params.metadata]  Dados adicionais (sem conteúdo de mensagens).
 * @param {string|null} [params.userId]
 * @param {string|null} [params.phoneNumberId]
 * @param {string|null} [params.deviceId]
 */
export async function logEvent({ eventType, metadata = {}, userId = null, phoneNumberId = null, deviceId = null }) {
  try {
    await getSupabaseAdmin().from(DB.LOGS).insert({
      user_id: userId,
      phone_number_id: phoneNumberId,
      device_id: deviceId,
      event_type: eventType,
      metadata: metadata,
    });
  } catch (err) {
    console.error('[logEvent] falha ao registrar log:', err.message);
  }
}
