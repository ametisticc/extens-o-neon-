// ============================================================
// Funções criptográficas (server-only)
// ============================================================
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Gera hash sha256 hex de uma string (para tokens, API keys, session tokens). */
export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

/** Gera um token aleatório seguro. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

/**
 * Comparação de strings em tempo constante.
 * Usada para senhas/admin e comparação de hashes.
 */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** HMAC SHA-256 (hex) — usado para assinar o cookie do painel admin. */
export function hmacHex(secret, data) {
  return createHmac('sha256', String(secret)).update(String(data)).digest('hex');
}

/** Gera uma API key legível: nw_ + 32 bytes hex. */
export function generateApiKey() {
  return `nw_${randomBytes(32).toString('hex')}`;
}

/** Gera um session token legível: nws_ + 32 bytes hex. */
export function generateSessionToken() {
  return `nws_${randomBytes(32).toString('hex')}`;
}
