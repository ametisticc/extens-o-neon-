// ============================================================
// GET /api/neon-warm/health
// ============================================================
// Health check público (sem dados sensíveis). Útil para verificar
// se o deploy da Vercel está no ar e se as variáveis de ambiente
// chegaram no servidor. NUNCA expõe valores — apenas true/false.
import { isAdminConfigured } from '@/lib/admin-config.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'neon-warm-backend',
    // SHA do commit que está rodando neste deploy (Vercel injeta via
    // VERCEL_GIT_COMMIT_SHA). Serve para confirmar se o build é o mais
    // recente do GitHub — se bater com `git rev-parse origin/main`,
    // o código está atualizado; se não, precisa redeploy.
    build_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    time: new Date().toISOString(),
    config: {
      admin_configured: isAdminConfigured(),
      supabase_configured: Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      extension_id_set: Boolean(process.env.NEON_WARM_EXTENSION_ID),
      allowed_origin_set: Boolean(process.env.NEON_WARM_ALLOWED_ORIGIN),
    },
  });
}
