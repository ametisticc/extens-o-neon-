// ============================================================
// POST /api/neon-warm/session/end
// ============================================================
// Encerra uma sessão.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { endSession } from '@/lib/sessions.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'session_end');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  if (!sessionId) {
    return jsonError('session_id é obrigatório.', 400, { reason: 'invalid_payload' });
  }

  const result = await endSession({ sessionId });

  if (!result.ok) {
    return jsonOk(
      {
        ok: false,
        status: 'unauthorized',
        reason: result.reason,
        message: 'Sessão inválida ou já encerrada.',
      },
      200
    );
  }

  await logEvent({
    eventType: 'session_ended',
    userId: result.session.user_id ?? null,
    phoneNumberId: result.session.phone_number_id ?? null,
    deviceId: result.session.device_id ?? null,
    metadata: { session_id: sessionId },
  });

  return jsonOk({
    ok: true,
    status: result.session.status,
    ended_at: result.session.ended_at,
    message: 'Sessão encerrada.',
  });
}
