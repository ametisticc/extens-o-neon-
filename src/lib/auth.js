// ============================================================
// Autenticação da extensão (API key por extensão)
// ============================================================
// A extensão é um cliente NÃO confiável. Cada chamada deve incluir:
//   X-NeonWarm-Key:      chave da extensão (gerada pelo operador)
//   X-NeonWarm-Extension: ID da extensão (ex: "neon-warm-extension")
//
// No banco guardamos apenas o HASH da chave (sha256). A chave em si
// nunca é retornada e não sai do servidor.
import { getSupabaseAdmin, DB } from './supabase.js';
import { sha256, safeEqual } from './crypto.js';

/**
 * Valida a API key da extensão.
 * @param {{ extensionId?: string, apiKey?: string }} headers
 * @returns {Promise<{ ok: boolean; reason?: string; keyRecord?: any }>}
 */
export async function authenticateExtension({ extensionId, apiKey }) {
  if (!extensionId || !apiKey) {
    return { ok: false, reason: 'missing_credentials' };
  }

  const allowedId = process.env.NEON_WARM_EXTENSION_ID;
  if (allowedId && !safeEqual(extensionId, allowedId)) {
    return { ok: false, reason: 'extension_id_invalid' };
  }

  const keyHash = sha256(apiKey);

  const { data, error } = await getSupabaseAdmin()
    .from(DB.EXTENSION_KEYS)
    .select('id, name, extension_id, status')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error) {
    console.error('[auth] erro ao buscar extension key:', error.message);
    return { ok: false, reason: 'internal_error' };
  }

  if (!data) {
    return { ok: false, reason: 'invalid_api_key' };
  }

  if (data.status !== 'active') {
    return { ok: false, reason: 'api_key_revoked' };
  }

  if (data.extension_id !== extensionId) {
    return { ok: false, reason: 'extension_mismatch' };
  }

  // Atualiza last_used_at (fire-and-forget, não bloqueia a resposta)
  getSupabaseAdmin()
    .from(DB.EXTENSION_KEYS)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {});

  return { ok: true, keyRecord: data };
}

/**
 * Extrai e valida os headers de autenticação de um Request.
 * Retorna { extensionId, apiKey } ou null se ausentes.
 */
export function extractExtensionCredentials(request) {
  const extensionId = request.headers.get('x-neonwarm-extension');
  const apiKey = request.headers.get('x-neonwarm-key');
  if (!extensionId || !apiKey) return null;
  return { extensionId: extensionId.trim(), apiKey: apiKey.trim() };
}
