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
 * @param {{ supabase?: object }} [deps]  Client injetável (para testes).
 * @returns {Promise<{ ok: boolean; reason?: string; keyRecord?: any }>}
 */
export async function authenticateExtension({ extensionId, apiKey }, deps = {}) {
  if (!extensionId || !apiKey) {
    return { ok: false, reason: 'missing_credentials' };
  }

  const allowedId = process.env.NEON_WARM_EXTENSION_ID;
  if (allowedId && !safeEqual(extensionId, allowedId)) {
    return { ok: false, reason: 'extension_id_invalid' };
  }

  const supabase = deps.supabase ?? getSupabaseAdmin();
  const keyHash = sha256(apiKey);

  const { data, error } = await supabase
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
  supabase
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

/**
 * Autentica usando uma CHAVE DE LICENÇA (formato NW-XXXX...).
 *
 * A licença é criada pelo painel admin em `neon_warm_licenses.license_key`
 * e autoriza um NÚMERO específico. Ao autenticar por licença, resolvemos:
 *   - o registro da licença (status ativo + não expirada)
 *   - o número vinculado (para validar bindings nas rotas de pareamento)
 *
 * Isso permite que o operador use UMA chave gerada pelo painel como
 * credencial da extensão, sem precisar criar API keys `nw_...` manualmente.
 *
 * @param {{ extensionId?: string, apiKey?: string }} headers
 * @param {{ supabase?: object }} [deps]  Client injetável (para testes).
 * @returns {Promise<{ ok: boolean; reason?: string; license?: any; number?: any; licenseKey?: string }>}
 */
export async function authenticateLicenseKey({ extensionId, apiKey }, deps = {}) {
  if (!extensionId || !apiKey) {
    return { ok: false, reason: 'missing_credentials' };
  }

  const allowedId = process.env.NEON_WARM_EXTENSION_ID;
  if (allowedId && !safeEqual(extensionId, allowedId)) {
    return { ok: false, reason: 'extension_id_invalid' };
  }

  const licenseKey = String(apiKey).trim();
  // Formato de chave de licença gerada pelo painel: NW-<hex>.
  if (!/^NW-/i.test(licenseKey)) {
    return { ok: false, reason: 'invalid_api_key' };
  }

  const supabase = deps.supabase ?? getSupabaseAdmin();

  const { data: license, error } = await supabase
    .from(DB.LICENSES)
    .select(
      'id, user_id, phone_number_id, plan_id, status, license_key, activated_at, expires_at, last_validation_at, last_extension_id'
    )
    .eq('license_key', licenseKey)
    .maybeSingle();

  if (error) {
    console.error('[auth] erro ao buscar licença:', error.message);
    return { ok: false, reason: 'internal_error' };
  }

  if (!license) {
    return { ok: false, reason: 'invalid_license_key' };
  }

  if (license.status === 'revoked' || license.status === 'blocked') {
    return { ok: false, reason: 'license_inactive' };
  }

  if (
    license.status !== 'active' ||
    (license.expires_at && new Date(license.expires_at).getTime() <= Date.now())
  ) {
    return { ok: false, reason: 'license_inactive' };
  }

  // Resolve o número vinculado (necessário para garantir que a licença
  // só autoriza o NÚMERO dela — isolamento entre clientes no /pair).
  const { data: number } = await supabase
    .from(DB.NUMBERS)
    .select('id, user_id, phone_number_normalized, status')
    .eq('id', license.phone_number_id)
    .maybeSingle();

  if (!number || number.status !== 'active') {
    return { ok: false, reason: 'license_inactive' };
  }

  // Registra o último uso (fire-and-forget, não bloqueia a resposta).
  supabase
    .from(DB.LICENSES)
    .update({ last_validation_at: new Date().toISOString(), last_extension_id: extensionId })
    .eq('id', license.id)
    .then(() => {})
    .catch(() => {});

   return { ok: true, license, number, licenseKey };
}

/**
 * Valida um Bearer token (gerado por POST /api/neon-warm/auth/token).
 * Retorna os dados do token e atualiza last_used_at.
 *
 * @param {string} token - Token Bearer (completo, ex: "nws_...")
 * @param {{ supabase?: object }} [deps] - Client injetável (para testes).
 * @returns {Promise<{ ok: boolean; reason?: string; tokenRecord?: any }>}
 */
export async function authenticateBearerToken(token, deps = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'invalid_token' };
  }

  const tokenHash = sha256(token);
  const supabase = deps.supabase ?? getSupabaseAdmin();

  const { data, error } = await supabase
    .from(DB.BEARER_TOKENS)
    .select('id, token_hash, extension_id, license_id, device_id, created_at, expires_at, status')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('[auth] erro ao buscar bearer token:', error.message);
    return { ok: false, reason: 'internal_error' };
  }

  if (!data) {
    return { ok: false, reason: 'invalid_token' };
  }

  // Verifica expiração
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'token_expired' };
  }

  // Verifica status
  if (data.status !== 'active') {
    return { ok: false, reason: 'token_revoked' };
  }

  // Atualiza last_used_at (fire-and-forget, não bloqueia a resposta)
  supabase
    .from(DB.BEARER_TOKENS)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {});

  return { ok: true, tokenRecord: data };
}

/**
 * Extrai Bearer token do header Authorization.
 * Retorna o token sem o prefixo "Bearer ", ou null se ausente.
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1].trim() || null;
}
