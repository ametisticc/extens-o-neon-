// ============================================================
// Guard alternativo para rotas com Bearer token
// ============================================================
// Aplica autenticação por Bearer token ao invés de headers
// customizados (X-NeonWarm-Key). Usa a tabela neon_warm_bearer_tokens.

import { extractBearerToken, authenticateBearerToken } from './auth.js';
import { rateLimit } from './rate-limit.js';
import { getClientIp, jsonError } from './http.js';

/**
 * Protege uma rota de API usando Bearer token.
 * Alternativa moderna ao guardExtensionRoute (headers customizados).
 *
 * @param {Request} request
 * @param {string} routeName  Nome da rota para rate limiting.
 * @returns {Promise<{ ok: true, token: string, tokenRecord: any, ip: string } | { ok: false, response: Response }>}
 */
export async function guardBearerRoute(request, routeName) {
  const ip = getClientIp(request);

  // 1. Extrai Bearer token
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: jsonError('Bearer token ausente.', 401, { reason: 'missing_credentials' }),
    };
  }

  // 2. Valida o token
  const auth = await authenticateBearerToken(token);
  if (!auth.ok) {
    return {
      ok: false,
      response: jsonError('Token inválido ou expirado.', 401, { reason: auth.reason }),
    };
  }

  // 3. Rate limiting por token + IP + rota
  const key = `bearer:${auth.tokenRecord.id}:ip:${ip}:${routeName}`;
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
    token,
    tokenRecord: auth.tokenRecord,
    ip,
  };
}
