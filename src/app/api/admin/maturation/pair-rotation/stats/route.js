// ============================================================
// GET /api/admin/maturation/pair-rotation/stats
// ============================================================
// Retorna estatísticas de balanceamento de pares

import { readAdminSession } from '@/lib/admin.js';
import { getRotationStats } from '@/lib/pair-rotation.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  try {
    const result = await getRotationStats();

    if (!result.ok) {
      return jsonError(result.error, 500);
    }

    return jsonOk({
      ok: true,
      stats: result.stats,
    });
  } catch (error) {
    console.error('[pair-rotation/stats] erro:', error);
    return jsonError('Erro ao calcular stats', 500);
  }
}
