// ============================================================
// Guarda padrão para as rotas de API da extensão
// ============================================================
// Aplica: CORS por origem, autenticação da extensão (API key)
// e rate limiting. Retorna um Response de erro ou um contexto
// com dados autenticados.
import { authenticateExtension, authenticateLicenseKey, extractExtensionCredentials } from './auth.js';
import { rateLimit } from './rate-limit.js';
import { getClientIp } from './http.js';
import { jsonError } from './http.js';

/**
 * Protege uma rota de API da extensão.
 *
 * A autenticação aceita DUAS credenciais (mantidas em separado):
 *   - API key da extensão (`nw_...`, header `X-NeonWarm-Key`) → auth em
 *     `neon_warm_extension_keys`. O contexto guard.license fica null.
 *   - Chave de licença (`NW-...`, mesmo header) → auth em
 *     `neon_warm_licenses`. O contexto guard.license traz a licença + o
 *     número vinculado (guard.license.number).
 *
 * @param {Request} request
 * @param {string} routeName  Nome da rota para rate limiting.
 * @returns {Promise<{ ok: true, extensionId: string, apiKey: string, ip: string, authMode: string, license: any|null, licenseNumber: any|null } | { ok: false, response: Response }>}
 */
export async function guardExtensionRoute(request, routeName) {
  const ip = getClientIp(request);

  // 1. Autenticação por API key + ID da extensão
  const credentials = extractExtensionCredentials(request);
  if (!credentials) {
    return {
      ok: false,
      response: jsonError('Credenciais da extensão ausentes.', 401, { reason: 'missing_credentials' }),
    };
  }

  let auth;
  // Chave de licença (NW-...) → resolve na tabela de licenças.
  if (/^NW-/i.test(String(credentials.apiKey || '').trim())) {
    auth = await authenticateLicenseKey(credentials);
  } else {
    // API key da extensão (nw_...) → resolve na tabela de extension keys.
    auth = await authenticateExtension(credentials);
  }

  if (!auth.ok) {
    return {
      ok: false,
      response: jsonError('Falha na autenticação da extensão.', 401, { reason: auth.reason }),
    };
  }

  // 2. Rate limiting por chave + IP + rota
  const key = `ext:${credentials.apiKey.slice(0, 8)}:ip:${ip}:${routeName}`;
  const rl = rateLimit(key);
  if (!rl.ok) {
    return {
      ok: false,
      response: Response.json(
        {
          authorized: false,
          status: 'unauthorized',
          reason: 'rate_limited',
          message: 'Muitas requisições. Tente novamente mais tarde.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfterSeconds ?? 1),
            'X-RateLimit-Limit': process.env.NEON_WARM_RATE_LIMIT ?? '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      ),
    };
  }

  return {
    ok: true,
    extensionId: credentials.extensionId,
    apiKey: credentials.apiKey,
    ip,
    authMode: auth.license ? 'license' : 'extension_key',
    license: auth.license ?? null,
    licenseNumber: auth.number ?? null,
  };
}
