// ============================================================
// GET /api/admin/maturation/logs
// ============================================================
// Retorna logs de maturação em tempo real
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);
  const phone = url.searchParams.get('phone');

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    let query = supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (phone) {
      query = query.eq('metadata->>phone_number', phone);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/maturation/logs] erro supabase:', error);
      return jsonError(`Erro ao buscar logs: ${error.message}`, 500);
    }

    return jsonOk({
      ok: true,
      logs: data ?? [],
      count: data?.length ?? 0,
    });
  } catch (error) {
    console.error('[admin/maturation/logs] erro:', error);
    return jsonError(`Erro ao buscar logs: ${error?.message || 'desconhecido'}`, 500);
  }
}
