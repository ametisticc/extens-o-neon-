// ============================================================
// Helpers para API Routes
// ============================================================

/** JSON padronizado de erro. */
export function jsonError(message, status, extra = {}) {
  return Response.json({ authorized: false, status: 'unauthorized', message, ...extra }, { status });
}

/** JSON padronizado de sucesso. */
export function jsonOk(data, status = 200) {
  return Response.json(data, { status });
}

/**
 * Extrai o IP real do request (headers da Vercel/edge, ou localhost).
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'localhost';
}

/**
 * Lê e parseia o corpo JSON de forma segura.
 * @returns {Promise<object|null>} objeto ou null se inválido.
 */
export async function readJsonBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Valida um payload de validação/sessão.
 * @param {object} body
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSessionPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload inválido.' };
  }

  const phone = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
  const extensionId = typeof body.extension_id === 'string' ? body.extension_id.trim() : '';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : '';

  if (!phone) return { ok: false, error: 'phone_number é obrigatório.' };
  if (!extensionId) return { ok: false, error: 'extension_id é obrigatório.' };
  if (!deviceId) return { ok: false, error: 'device_id é obrigatório.' };
  if (deviceId.length > 128) return { ok: false, error: 'device_id muito longo.' };

  return { ok: true };
}
