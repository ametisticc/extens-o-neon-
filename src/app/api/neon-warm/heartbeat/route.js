// ============================================================
// POST /api/neon-warm/heartbeat
// ============================================================
// Atualiza last_heartbeat_at da sessão e last_seen_at do número.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { heartbeatSession } from '@/lib/sessions.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';
import { normalizePhone } from '@/lib/phone.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'heartbeat');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const phoneNumber = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : '';

  if (!sessionId) {
    return jsonError('session_id é obrigatório.', 400, { reason: 'invalid_payload' });
  }

  // Resolve o phone_number_id se o número foi enviado
  let phoneNumberId = null;
  if (phoneNumber) {
    const normalized = normalizePhone(phoneNumber);
    if (normalized) {
      const { data: numberRow } = await getSupabaseAdmin()
        .from(DB.NUMBERS)
        .select('id')
        .eq('phone_number_normalized', normalized)
        .maybeSingle();
      phoneNumberId = numberRow?.id ?? null;
    }
  }

  const result = await heartbeatSession({ sessionId, phoneNumberId });

  if (!result.ok) {
    return jsonOk(
      {
        authorized: false,
        status: 'unauthorized',
        reason: result.reason,
        message: 'Sessão inválida ou inativa.',
      },
      200
    );
  }

  await logEvent({
    eventType: 'heartbeat',
    userId: result.session.user_id ?? null,
    phoneNumberId: result.session.phone_number_id ?? phoneNumberId,
    deviceId: result.session.device_id ?? null,
    metadata: { session_id: sessionId },
  });

  return jsonOk({
    ok: true,
    status: result.session.status,
    last_heartbeat_at: result.session.last_heartbeat_at,
    message: 'Heartbeat registrado.',
  });
}
