// ============================================================
// lib/auto-pause.js
// ============================================================
// Serviço de pausa automática para números com baixa taxa
// Monitora sucesso e pausa se cair abaixo de threshold

import { tryGetSupabaseAdmin, DB } from './supabase.js';
import { logEvent } from './logger.js';

const AUTO_PAUSE_THRESHOLD = 50; // Taxa de sucesso mínima (%)
const AUTO_PAUSE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 horas
const VALIDATION_WINDOW_MS = 60 * 60 * 1000; // Últimas 1 hora

/**
 * Verifica se um número deve ser pausado automaticamente
 * @param {UUID} phoneNumberId
 * @returns { shouldPause: boolean, successRate: number, reason: string }
 */
export async function checkAutoPause(phoneNumberId) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return { shouldPause: false, reason: 'supabase_unavailable' };
  }

  try {
    // 1. Verificar se já está pausado
    const { data: existingPause } = await supabase
      .from(DB.AUTO_PAUSE_EVENTS)
      .select('id, resume_at, status')
      .eq('phone_number_id', phoneNumberId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingPause) {
      // Já está pausado
      return {
        shouldPause: false,
        alreadyPaused: true,
        resumeAt: existingPause.resume_at,
      };
    }

    // 2. Buscar validações da última hora
    const oneHourAgo = new Date(Date.now() - VALIDATION_WINDOW_MS).toISOString();

    const { data: logs } = await supabase
      .from(DB.LOGS)
      .select('id, event_type')
      .eq('phone_number_id', phoneNumberId)
      .in('event_type', ['validation_success', 'validation_failed'])
      .gte('created_at', oneHourAgo);

    const validations = logs || [];
    const successes = validations.filter(l => l.event_type === 'validation_success').length;
    const failures = validations.filter(l => l.event_type === 'validation_failed').length;
    const total = successes + failures;

    // Precisa de pelo menos 5 validações pra considerar
    if (total < 5) {
      return {
        shouldPause: false,
        reason: 'insufficient_data',
        successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
        validations: total,
      };
    }

    // 3. Calcular taxa de sucesso
    const successRate = Math.round((successes / total) * 100);

    if (successRate < AUTO_PAUSE_THRESHOLD) {
      return {
        shouldPause: true,
        successRate,
        validations: total,
        reason: 'low_success_rate',
      };
    }

    return {
      shouldPause: false,
      successRate,
      validations: total,
      reason: 'acceptable_rate',
    };
  } catch (error) {
    console.error('[auto-pause] erro ao verificar:', error);
    return { shouldPause: false, reason: 'error', error: error.message };
  }
}

/**
 * Pausa um número automaticamente
 * @param {UUID} phoneNumberId
 * @param {UUID} userId
 * @param {string} reason
 * @returns { ok: boolean, pauseEvent: object }
 */
export async function pauseNumber(phoneNumberId, userId, reason = 'low_success_rate') {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'supabase_unavailable' };
  }

  try {
    // 1. Parar sessão ativa
    await supabase
      .from(DB.SESSIONS)
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('phone_number_id', phoneNumberId)
      .eq('status', 'active');

    // 2. Criar evento de pausa
    const resumeAt = new Date(Date.now() + AUTO_PAUSE_DURATION_MS);

    const { data: pauseEvent, error } = await supabase
      .from(DB.AUTO_PAUSE_EVENTS)
      .insert({
        user_id: userId,
        phone_number_id: phoneNumberId,
        reason,
        paused_at: new Date().toISOString(),
        resume_at: resumeAt.toISOString(),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[auto-pause] erro ao criar evento:', error);
      return { ok: false, error: error.message };
    }

    // 3. Log do evento
    await logEvent({
      eventType: 'auto_pause_triggered',
      userId,
      phoneNumberId,
      metadata: {
        reason,
        resume_at: resumeAt.toISOString(),
        pause_duration_hours: 2,
      },
    });

    return {
      ok: true,
      pauseEvent: {
        id: pauseEvent.id,
        resumeAt: resumeAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('[auto-pause] erro ao pausar:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Retoma um número (muda status de pausa para resumed)
 * @param {UUID} pauseEventId
 * @returns { ok: boolean }
 */
export async function resumeNumber(pauseEventId) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'supabase_unavailable' };
  }

  try {
    const { error } = await supabase
      .from(DB.AUTO_PAUSE_EVENTS)
      .update({
        status: 'resumed',
        resumed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pauseEventId);

    if (error) {
      console.error('[auto-pause] erro ao retomar:', error);
      return { ok: false, error: error.message };
    }

    await logEvent({
      eventType: 'auto_pause_resumed',
      metadata: { pause_event_id: pauseEventId },
    });

    return { ok: true };
  } catch (error) {
    console.error('[auto-pause] erro:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Cron job: Verificar números que precisam ser pausados
 * Executar a cada 5 minutos
 */
export async function processPauseCandidates() {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    console.error('[auto-pause cron] supabase unavailable');
    return;
  }

  try {
    // 1. Buscar todas as sessões ativas
    const { data: activeSessions } = await supabase
      .from(DB.SESSIONS)
      .select('phone_number_id, user_id')
      .eq('status', 'active');

    if (!activeSessions || activeSessions.length === 0) {
      return; // Nenhuma sessão ativa
    }

    // 2. Para cada número, verificar se deve pausar
    for (const session of activeSessions) {
      const check = await checkAutoPause(session.phone_number_id);

      if (check.shouldPause) {
        console.log(`[auto-pause cron] pausando ${session.phone_number_id}`, check);
        await pauseNumber(session.phone_number_id, session.user_id, check.reason);
      }
    }

    // 3. Resumir números que passaram do tempo de pausa
    const { data: expiredPauses } = await supabase
      .from(DB.AUTO_PAUSE_EVENTS)
      .select('id')
      .eq('status', 'active')
      .lte('resume_at', new Date().toISOString());

    for (const pauseEvent of expiredPauses || []) {
      console.log(`[auto-pause cron] retomando ${pauseEvent.id}`);
      await resumeNumber(pauseEvent.id);
    }
  } catch (error) {
    console.error('[auto-pause cron] erro:', error);
  }
}
