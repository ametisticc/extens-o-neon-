// ============================================================
// POST /api/admin/maturation/schedule
// ============================================================
// Agenda maturação para data/hora específica
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return jsonError('Payload inválido', 400);
  }

  const { phone_numbers, scheduled_start_at, scheduled_end_at, mode, duration_minutes, duration_cycles } = body;

  if (!Array.isArray(phone_numbers) || phone_numbers.length === 0) {
    return jsonError('phone_numbers é obrigatório', 400);
  }

  if (!scheduled_start_at) {
    return jsonError('scheduled_start_at é obrigatório', 400);
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    const results = [];
    const startDate = new Date(scheduled_start_at);
    const endDate = scheduled_end_at ? new Date(scheduled_end_at) : null;

    for (const phone of phone_numbers) {
      try {
        // Resolve o número para phone_number_id
        const { data: numberRow } = await supabase
          .from(DB.NUMBERS)
          .select('id, user_id')
          .eq('phone_number_normalized', phone)
          .maybeSingle();

        if (!numberRow) {
          results.push({ phone, ok: false, error: 'Número não encontrado' });
          continue;
        }

        // Cria agendamento
        const { data: schedule, error } = await supabase
          .from(DB.MATURATION_SCHEDULES)
          .insert({
            user_id: numberRow.user_id,
            phone_number_id: numberRow.id,
            scheduled_start_at: startDate.toISOString(),
            scheduled_end_at: endDate ? endDate.toISOString() : null,
            mode: mode || 'normal',
            duration_minutes,
            duration_cycles,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) {
          results.push({ phone, ok: false, error: error.message });
        } else {
          results.push({ phone, ok: true, schedule_id: schedule.id });
          await logEvent({
            eventType: 'maturation_scheduled',
            userId: numberRow.user_id,
            phoneNumberId: numberRow.id,
            metadata: {
              schedule_id: schedule.id,
              mode,
              scheduled_start_at: startDate.toISOString(),
              admin: session,
            },
          });
        }
      } catch (err) {
        results.push({ phone, ok: false, error: err.message });
      }
    }

    return jsonOk({
      ok: true,
      results,
      summary: {
        total: results.length,
        scheduled: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      },
    });
  } catch (error) {
    console.error('[admin/maturation/schedule] erro:', error);
    return jsonError('Erro ao agendar maturação', 500);
  }
}

// GET — listar agendamentos
export async function GET(request) {
  const session = await readAdminSession();
  if (!session) {
    return jsonError('Não autorizado', 401);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    let query = supabase
      .from(DB.MATURATION_SCHEDULES)
      .select('id, phone_number_id, scheduled_start_at, scheduled_end_at, mode, status, created_at')
      .order('scheduled_start_at', { ascending: true })
      .limit(50);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError('Erro ao buscar agendamentos', 500);
    }

    return jsonOk({
      ok: true,
      schedules: data ?? [],
      count: data?.length ?? 0,
    });
  } catch (error) {
    console.error('[admin/maturation/schedule GET] erro:', error);
    return jsonError('Erro ao buscar agendamentos', 500);
  }
}
