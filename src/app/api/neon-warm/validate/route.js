// ============================================================
// POST /api/neon-warm/validate
// ============================================================
// Valida se um número está autorizado a usar o Neon Warm.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { validateNeonWarmAccess } from '@/lib/validation.js';
import { readJsonBody, validateSessionPayload, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'validate');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  const payloadCheck = validateSessionPayload(body);
  if (!payloadCheck.ok) {
    return jsonError(payloadCheck.error, 400, { reason: 'invalid_payload' });
  }

  const result = await validateNeonWarmAccess({
    phoneNumber: body.phone_number,
    extensionId: body.extension_id,
    deviceId: body.device_id,
  });

  // Log de validação
  const eventType = result.authorized ? 'validation_success' : 'validation_failed';
  await logEvent({
    eventType,
    userId: result.user?.id ?? null,
    phoneNumberId: result.number?.id ?? null,
    deviceId: result.device?.id ?? null,
    metadata: {
      phone_number: body.phone_number,
      reason: result.reason,
      plan: result.plan,
    },
  });

  // Resposta pública — sem dados internos do banco.
  if (result.authorized) {
    return jsonOk({
      authorized: true,
      status: result.status,
      plan: result.plan,
      expires_at: result.expires_at,
      message: result.message,
    });
  }

  return jsonOk({
    authorized: false,
    status: 'unauthorized',
    reason: result.reason,
    message: result.message,
  });
}
