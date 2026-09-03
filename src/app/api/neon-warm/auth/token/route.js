// ============================================================
// POST /api/neon-warm/auth/token
// ============================================================
// Gera um token Bearer para a extensão usar em requisições.
// Substitui o uso de headers customizados (X-NeonWarm-Key).
//
// A extensão chama este endpoint UMA VEZ durante setup,
// guarda o token no storage, e depois usa:
//   Authorization: Bearer <token>
//
// Tokens expiram e precisam ser renovados periodicamente.

import { guardExtensionRoute } from '@/lib/api-guard.js';
import { generateSessionToken, sha256 } from '@/lib/crypto.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  // 1. Autentica usando headers (X-NeonWarm-Key)
  const guard = await guardExtensionRoute(request, 'auth_token');
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Corpo JSON inválido.', 400, { reason: 'invalid_payload' });
  }

  // 2. Gera um token Bearer seguro
  const token = generateSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  // 3. Grava o hash no banco (nunca guardamos o token em texto plano)
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DB.BEARER_TOKENS)
    .insert({
      token_hash: tokenHash,
      api_key_prefix: guard.apiKey.slice(0, 8),
      extension_id: guard.extensionId,
      license_id: guard.license?.id ?? null,
      device_id: body.device_id ?? null,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      last_used_at: null,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[auth/token] erro ao criar token:', error.message);
    return jsonError('Não foi possível gerar o token.', 500, { reason: 'internal_error' });
  }

  await logEvent({
    eventType: 'bearer_token_created',
    userId: guard.license?.user_id ?? null,
    metadata: {
      extension_id: guard.extensionId,
      api_key_prefix: guard.apiKey.slice(0, 8),
      token_id: data.id,
    },
  });

  // 4. Retorna o token (única vez que é retornado em texto plano)
  return jsonOk({
    ok: true,
    token,
    token_type: 'Bearer',
    expires_in: 7 * 24 * 60 * 60, // 7 dias em segundos
    expires_at: expiresAt.toISOString(),
    message: 'Token Bearer gerado. Use: Authorization: Bearer <token>',
  });
}
