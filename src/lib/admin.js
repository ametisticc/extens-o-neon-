// ============================================================
// Autenticação do painel administrativo (cookie assinado HMAC)
// ============================================================
// O painel usa credenciais estáticas do operador (env vars) e um
// cookie assinado. Não há cadastro de usuários admin no banco.
//
// IMPORTANTE: estas funções NUNCA lançam exceção por env ausente.
// Se o admin não estiver configurado, o painel mostra um aviso e
// não autentica — em vez de quebrar a aplicação inteira.
import { cookies } from 'next/headers';
import { hmacHex, safeEqual } from './crypto.js';

const COOKIE_NAME = 'neon_warm_admin';

/**
 * Retorna true se as variáveis do admin estão configuradas.
 */
export function isAdminConfigured() {
  return Boolean(
    process.env.NEON_WARM_ADMIN_EMAIL &&
    process.env.NEON_WARM_ADMIN_PASSWORD &&
    process.env.NEON_WARM_ADMIN_SECRET
  );
}

function getAdminConfig() {
  if (!isAdminConfigured()) return null;
  return {
    email: process.env.NEON_WARM_ADMIN_EMAIL,
    password: process.env.NEON_WARM_ADMIN_PASSWORD,
    secret: process.env.NEON_WARM_ADMIN_SECRET,
  };
}

/**
 * Verifica as credenciais do operador.
 * Retorna false se o admin não estiver configurado.
 */
export function verifyAdminCredentials(email, password) {
  const config = getAdminConfig();
  if (!config) return false;
  return safeEqual(email, config.email) && safeEqual(password, config.password);
}

/**
 * Cria um cookie assinado de sessão do painel.
 * Formato: <payload>.<sig> onde payload = base64url(JSON {email, exp})
 * Retorna null se o admin não estiver configurado.
 */
export function createAdminCookie(email) {
  const config = getAdminConfig();
  if (!config) return null;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  const sig = hmacHex(config.secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Valida o cookie do painel e retorna o email, ou null.
 * Retorna null se o admin não estiver configurado.
 */
export async function readAdminSession() {
  const config = getAdminConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;

  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expectedSig = hmacHex(config.secret, payload);
  if (!safeEqual(sig, expectedSig)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null;
    if (!data.email) return null;
    return data.email;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
