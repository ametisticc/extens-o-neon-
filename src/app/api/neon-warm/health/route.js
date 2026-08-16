// ============================================================
// GET /api/neon-warm/health
// ============================================================
// Health check público (sem dados sensíveis). Útil para verificar
// se o deploy da Vercel está no ar.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'neon-warm-backend',
    time: new Date().toISOString(),
  });
}
