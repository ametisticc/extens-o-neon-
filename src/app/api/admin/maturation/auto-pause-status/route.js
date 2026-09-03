// ============================================================
// GET /api/admin/maturation/auto-pause-status
// ============================================================
// Retorna status de pausas automáticas ativas

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
  const phone = url.searchParams.get('phone');

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    let query = supabase
      .from(DB.AUTO_PAUSE_EVENTS)
      .select('id, phone_number_id, reason, paused_at, resume_at, status, last_success_rate')
      .eq('status', 'active')
      .order('paused_at', { ascending: false });

    if (phone) {
      query = query.eq('phone_number_id', phone);
    }

    const { data: pauseEvents } = await query;

    // Calcular tempo até retomada
    const now = Date.now();
    const events = (pauseEvents || []).map(e => ({
      id: e.id,
      phone_number_id: e.phone_number_id,
      reason: e.reason,
      paused_at: e.paused_at,
      resume_at: e.resume_at,
      resume_in_ms: new Date(e.resume_at).getTime() - now,
      resume_in_minutes: Math.ceil((new Date(e.resume_at).getTime() - now) / (1000 * 60)),
      status: e.status,
      last_success_rate: e.last_success_rate,
    }));

    return jsonOk({
      ok: true,
      paused_numbers: events.length,
      events,
    });
  } catch (error) {
    console.error('[admin/maturation/auto-pause-status] erro:', error);
    return jsonError('Erro ao buscar status de pausas', 500);
  }
}
