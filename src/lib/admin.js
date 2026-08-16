// ============================================================
// Autenticação do painel administrativo (cookie assinado HMAC)
// ============================================================
// O painel usa credenciais estáticas do operador (env vars) e um
// cookie assinado. Não há cadastro de usuários admin no banco.
import { cookies } from 'next/headers';
import { hmacHex, safeEqual } from './crypto.js';

const COOKIE_NAME = 'neon_warm_admin';

function assertAdminEnv() {
  const email = process.env.NEON_WARM_ADMIN_EMAIL;
  const password = process.env.NEON_WARM_ADMIN_PASSWORD;
  const secret = process.env.NEON_WARM_ADMIN_SECRET;
  if (!email || !password || !secret) {
    throw new Error('Configuração do painel admin ausente: NEON_WARM_ADMIN_EMAIL, NEON_WARM_ADMIN_PASSWORD e NEON_WARM_ADMIN_SECRET são obrigatórias.');
  }
  return { email, password, secret };
}

/**
 * Verifica as credenciais do operador.
 */
export function verifyAdminCredentials(email, password) {
  const { email: adminEmail, password: adminPassword } = assertAdminEnv();
  return safeEqual(email, adminEmail) && safeEqual(password, adminPassword);
}

/**
 * Cria um cookie assinado de sessão do painel.
 * Formato: <payload>.<sig> onde payload = base64url(JSON {email, exp})
 */
export function createAdminCookie(email) {
  const { secret } = assertAdminEnv();
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  const sig = hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Valida o cookie do painel e retorna o email, ou null.
 */
export async function readAdminSession() {
  const { secret } = assertAdminEnv();
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;

  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expectedSig = hmacHex(secret, payload);
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
