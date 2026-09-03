// ============================================================
// GET /api/admin/maturation/pair-rotation/suggest
// ============================================================
// Sugere o melhor par para um número

import { readAdminSession } from '@/lib/admin.js';
import { findBestPairFor, getRotationStats } from '@/lib/pair-rotation.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');

  if (!phone) {
    return jsonError('phone é obrigatório', 400);
  }

  try {
    const suggestion = await findBestPairFor(phone);
    const stats = await getRotationStats();

    return jsonOk({
      ok: true,
      suggestion: suggestion ? {
        pair_phone: suggestion.pairPhone,
        reason: suggestion.reason,
        frequency: suggestion.frequency,
      } : null,
      stats: stats.ok ? stats.stats : null,
    });
  } catch (error) {
    console.error('[pair-rotation/suggest] erro:', error);
    return jsonError('Erro ao sugerir par', 500);
  }
}
