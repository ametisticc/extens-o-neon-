// ============================================================
// Rate limiting simples em memória (Vercel serverless)
// ============================================================
// ATENÇÃO: o armazenamento em memória não persiste entre
// invocações serverless em produção. Para rate limiting
// distribuído, use Upstash Redis (ver README). Este módulo é
// suficiente para dev local e serve como camada básica.

const buckets = new Map();

// Limpa buckets antigos periodicamente (a cada 5 min, se chamado)
let lastCleanup = 0;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}

/**
 * Verifica se a requisição pode passar.
 * @param {string} key  Identificador (ex: "ext:<id>:ip:<ip>:validate").
 * @returns {{ ok: boolean, remaining: number, retryAfterSeconds?: number }}
 */
export function rateLimit(key, { limit, windowSeconds } = {}) {
  const effectiveLimit = limit ?? (Number(process.env.NEON_WARM_RATE_LIMIT) || 60);
  const effectiveWindow = windowSeconds ?? (Number(process.env.NEON_WARM_RATE_WINDOW_SECONDS) || 60);

  cleanup();

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + effectiveWindow * 1000 });
    return { ok: true, remaining: effectiveLimit - 1 };
  }

  bucket.count += 1;
  if (bucket.count > effectiveLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  return { ok: true, remaining: effectiveLimit - bucket.count };
}
