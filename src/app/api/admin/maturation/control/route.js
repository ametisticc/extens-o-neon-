// ============================================================
// POST /api/admin/maturation/control
// ============================================================
// Controla maturação: iniciar, parar, ajustar modo
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

  const { action, phone_numbers, mode, duration } = body;
  // action: 'start' | 'stop' | 'pause' | 'resume'
  // phone_numbers: ['5511999999999', ...]
  // mode: 'normal' | 'time' | 'cycles'
  // duration: minutos ou ciclos

  if (!action || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
    return jsonError('action e phone_numbers são obrigatórios', 400);
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return jsonError('Supabase não configurado', 500);
  }

  try {
    const results = [];

    for (const phone of phone_numbers) {
      try {
        // Resolve o número para phone_number_id
        const { data: numberRow } = await supabase
          .from(DB.NUMBERS)
          .select('id')
          .eq('phone_number_normalized', phone)
          .maybeSingle();

        if (!numberRow) {
          results.push({ phone, ok: false, error: 'Número não encontrado' });
          continue;
        }

        // Se action === 'start', cria/atualiza uma sessão
        if (action === 'start') {
          const { data: session, error } = await supabase
            .from(DB.SESSIONS)
            .insert({
              user_id: null, // admin-initiated
              phone_number_id: numberRow.id,
              device_id: `admin-${Date.now()}`,
              status: 'active',
              created_at: new Date().toISOString(),
              last_heartbeat_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (error) {
            results.push({ phone, ok: false, error: error.message });
          } else {
            results.push({ phone, ok: true, session_id: session.id });
            await logEvent({
              eventType: 'maturation_started_by_admin',
              userId: null,
              phoneNumberId: numberRow.id,
              metadata: { mode, duration, admin: session },
            });
          }
        }
        // Se action === 'stop', marca sessão como ended
        else if (action === 'stop') {
          const { error } = await supabase
            .from(DB.SESSIONS)
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('phone_number_id', numberRow.id)
            .eq('status', 'active');

          if (error) {
            results.push({ phone, ok: false, error: error.message });
          } else {
            results.push({ phone, ok: true });
            await logEvent({
              eventType: 'maturation_stopped_by_admin',
              userId: null,
              phoneNumberId: numberRow.id,
              metadata: {},
            });
          }
        }
      } catch (err) {
        results.push({ phone, ok: false, error: err.message });
      }
    }

    return jsonOk({
      ok: true,
      action,
      results,
      summary: {
        total: results.length,
        succeeded: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      },
    });
  } catch (error) {
    console.error('[admin/maturation/control] erro:', error);
    return jsonError('Erro ao controlar maturação', 500);
  }
}
