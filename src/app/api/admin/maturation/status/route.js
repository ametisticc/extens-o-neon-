// ============================================================
// GET /api/admin/maturation/status
// ============================================================
// Retorna status em tempo real: números ativos, pares, estatísticas
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

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    // 1. Números com sessões ativas (maturando agora)
    const { data: activeSessions, error: sessionsError } = await supabase
      .from(DB.SESSIONS)
      .select('id, phone_number_id, status, created_at, last_heartbeat_at')
      .eq('status', 'active')
      .gt('last_heartbeat_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .limit(100);

    if (sessionsError) {
      console.error('[admin/maturation/status] erro ao buscar sessões:', sessionsError);
      return jsonError(`Erro ao buscar sessões: ${sessionsError.message}`, 500);
    }

    // 2. Pares ativos (última hora)
    const { data: recentPairs, error: pairsError } = await supabase
      .from(DB.PAIRS)
      .select('id, phone_1, phone_2, status, messages_sent, messages_total, created_at')
      .eq('status', 'active')
      .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (pairsError) {
      console.error('[admin/maturation/status] erro ao buscar pares:', pairsError);
      return jsonError(`Erro ao buscar pares: ${pairsError.message}`, 500);
    }

    // 3. Logs de hoje
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayLogs, error: logsError } = await supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata')
      .gte('created_at', todayStart.toISOString())
      .in('event_type', ['validation_success', 'session_started', 'heartbeat'])
      .limit(1000);

    if (logsError) {
      console.error('[admin/maturation/status] erro ao buscar logs:', logsError);
      return jsonError(`Erro ao buscar logs: ${logsError.message}`, 500);
    }

    const stats = {
      numbers_active: activeSessions?.length ?? 0,
      pairs_active: recentPairs?.filter(p => p.status === 'active').length ?? 0,
      messages_today: todayLogs?.filter(l => l.event_type === 'heartbeat').length ?? 0,
      validations_today: todayLogs?.filter(l => l.event_type === 'validation_success').length ?? 0,
    };

    return jsonOk({
      ok: true,
      stats,
      active_sessions: activeSessions ?? [],
      recent_pairs: recentPairs ?? [],
    });
  } catch (error) {
    console.error('[admin/maturation/status] erro:', error);
    return jsonError(`Erro ao buscar status: ${error?.message || 'desconhecido'}`, 500);
  }
}
