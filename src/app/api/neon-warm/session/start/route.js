// ============================================================
// POST /api/neon-warm/session/start
// ============================================================
// Inicia uma sessão para um número autorizado.
// O token de sessão é retornado UMA vez; apenas o hash é gravado.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { validateNeonWarmAccess } from '@/lib/validation.js';
import { startSession } from '@/lib/sessions.js';
import { readJsonBody, validateSessionPayload, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'session_start');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const payloadCheck = validateSessionPayload(body);
  if (!payloadCheck.ok) {
    return jsonError(payloadCheck.error, 400, { reason: 'invalid_payload' });
  }

  // 1. Valida autorização
  const result = await validateNeonWarmAccess({
    phoneNumber: body.phone_number,
    extensionId: body.extension_id,
    deviceId: body.device_id,
  });

  if (!result.authorized) {
    await logEvent({
      eventType: 'validation_failed',
      userId: result.user?.id ?? null,
      phoneNumberId: result.number?.id ?? null,
      deviceId: result.device?.id ?? null,
      metadata: { phone_number: body.phone_number, reason: result.reason },
    });
    return jsonOk({
      authorized: false,
      status: 'unauthorized',
      reason: result.reason,
      message: result.message,
    });
  }

  // 2. Cria a sessão
  const sessionResult = await startSession({
    userId: result.user.id,
    phoneNumberId: result.number.id,
    deviceId: result.device?.id ?? null,
  });

  if (!sessionResult.ok) {
    return jsonError('Não foi possível iniciar a sessão.', 500, { reason: 'internal_error' });
  }

  await logEvent({
    eventType: 'session_started',
    userId: result.user.id,
    phoneNumberId: result.number.id,
    deviceId: result.device?.id ?? null,
    metadata: { session_id: sessionResult.session.id },
  });

  return jsonOk({
    authorized: true,
    status: 'active',
    session_id: sessionResult.session.id,
    session_token: sessionResult.token,
    plan: result.plan,
    expires_at: result.expires_at,
    message: 'Sessão iniciada. Número autorizado para utilizar o Neon Warm.',
  });
}
