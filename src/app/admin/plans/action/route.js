// ============================================================
// POST /admin/plans/action
// ============================================================
// Ações do painel de planos de maturação (somente operador):
//
//   action = save        → cria/atualiza o plano de um número
//                          (daily_msg_limit, cycle_seconds, cycle_limit,
//                           auto_resume_daily)
//   action = start       → inicia a maturação do número (cria/ativa plano
//                          e zera contadores)
//   action = pause       → pausa o plano de um número (pareamento suspenso)
//   action = approve     → aprova/continua (despausa) o plano
//   action = apply_suggest → aplica a sugestão automática ao número
//                            (se houver sugestão individual)
//   action = flag        → marca o número como banido/restrito
//                          (suspende o pareamento + exclui dos parceiros)
//   action = unflag      → remove a marcação (volta a parear)
//
// Mesmo padrão das outras rotas admin (cookie assinado + redirect).
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import {
  upsertPlanWithClient,
  pausePlanWithClient,
  approvePlanWithClient,
  startPlanWithClient,
  markFlagPlanWithClient,
  clearFlagPlanWithClient,
} from '@/lib/maturation-plans.js';
import { buildMaturationBoardWithClient } from '@/lib/maturation-board.js';
import { releaseStalePairsWithClient } from '@/lib/pairing-core.js';
import { logEvent } from '@/lib/logger.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['save', 'start', 'pause', 'approve', 'apply_suggest', 'flag', 'unflag'];

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    redirect('/admin');
  }

  const formData = await request.formData();
  const action = String(formData.get('action') ?? '');

  if (!VALID_ACTIONS.includes(action)) {
    redirect('/admin/plans?msg=invalid');
  }

  const phone = String(formData.get('phone') ?? '').trim();
  if (!phone) {
    redirect('/admin/plans?msg=invalid');
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    redirect('/admin?error=invalid');
  }

  // ------------------------------------------------------------
  // SALVAR (criar/atualizar plano)
  // ------------------------------------------------------------
  if (action === 'save') {
    const dailyRaw = String(formData.get('daily_msg_limit') ?? '').trim();
    const cycleRaw = String(formData.get('cycle_seconds') ?? '').trim();
    const cycleLimitRaw = String(formData.get('cycle_limit') ?? '').trim();
    const autoRaw = String(formData.get('auto_resume_daily') ?? 'true');

    const dailyMsgLimit = dailyRaw === '' ? null : Math.max(1, Math.round(Number(dailyRaw)) || 0);
    const cycleSeconds = cycleRaw === '' ? null : Math.max(30, Math.round(Number(cycleRaw)) || 0);
    const cycleLimit = cycleLimitRaw === '' ? null : Math.max(1, Math.round(Number(cycleLimitRaw)) || 0);

    const result = await upsertPlanWithClient(supabase, {
      phone,
      dailyMsgLimit,
      cycleSeconds,
      cycleLimit,
      autoResumeDaily: autoRaw !== 'false',
    });

    if (!result.ok) {
      console.error('[admin] erro ao salvar plano:', result.reason);
      redirect('/admin/plans?msg=error');
    }

    await logEvent({
      eventType: 'plan_saved',
      metadata: { admin: session, phone, daily_msg_limit: dailyMsgLimit, cycle_seconds: cycleSeconds, cycle_limit: cycleLimit },
    });
    redirect(`/admin/plans?msg=saved&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // INICIAR MATURAÇÃO (cria/ativa plano + zera contadores)
  // ------------------------------------------------------------
  if (action === 'start') {
    const result = await startPlanWithClient(supabase, { phone });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }
    await logEvent({ eventType: 'plan_started', metadata: { admin: session, phone } });
    redirect(`/admin/plans?msg=started&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // PAUSAR
  // ------------------------------------------------------------
  if (action === 'pause') {
    const result = await pausePlanWithClient(supabase, { phone, reason: 'manual' });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }
    await logEvent({ eventType: 'plan_paused', metadata: { admin: session, phone } });
    redirect(`/admin/plans?msg=paused&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // APROVAR / CONTINUAR
  // ------------------------------------------------------------
  if (action === 'approve') {
    const result = await approvePlanWithClient(supabase, { phone });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }
    await logEvent({ eventType: 'plan_approved', metadata: { admin: session, phone } });
    redirect(`/admin/plans?msg=approved&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // MARCAR COMO BANIDO / RESTRITO (WhatsApp penalizou a conta)
  // ------------------------------------------------------------
  if (action === 'flag') {
    const status = String(formData.get('flag_status') ?? 'banned').trim();
    const reason = String(formData.get('flag_reason') ?? '').trim() || null;

    const result = await markFlagPlanWithClient(supabase, {
      phone,
      status: status === 'restricted' ? 'restricted' : 'banned',
      reason,
      by: session,
    });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }

    // Encerra os pares ativos que envolvem o número — para ninguém ficar
    // preso esperando um parceiro que não vai mais parear.
    await releaseStalePairsWithClient(supabase, { onlyPhone: phone }).catch(() => {});

    await logEvent({
      eventType: 'plan_flagged',
      metadata: { admin: session, phone, flag_status: result.plan?.status, flag_reason: reason },
    });
    redirect(`/admin/plans?msg=flagged&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // DESMARCAR (liberar número banido/restrito)
  // ------------------------------------------------------------
  if (action === 'unflag') {
    const result = await clearFlagPlanWithClient(supabase, { phone });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }
    await logEvent({ eventType: 'plan_unflagged', metadata: { admin: session, phone } });
    redirect(`/admin/plans?msg=unflag&phone=${encodeURIComponent(phone)}`);
  }

  // ------------------------------------------------------------
  // APLICAR SUGESTÃO AUTOMÁTICA
  // ------------------------------------------------------------
  if (action === 'apply_suggest') {
    const board = await buildMaturationBoardWithClient(supabase);
    if (!board.ok) {
      redirect('/admin/plans?msg=error');
    }
    const row = (board.rows || []).find((r) => r.phone_number_normalized === phone);
    if (!row || (!row.suggested_limit && !row.suggested_cycle)) {
      redirect(`/admin/plans?msg=no_suggest&phone=${encodeURIComponent(phone)}`);
    }

    const result = await upsertPlanWithClient(supabase, {
      phone,
      dailyMsgLimit: row.suggested_limit ?? null,
      cycleSeconds: row.suggested_cycle ?? null,
      autoResumeDaily: row.auto_resume_daily !== false,
      status: 'active',
    });
    if (!result.ok) {
      redirect('/admin/plans?msg=error');
    }
    await logEvent({
      eventType: 'plan_suggest_applied',
      metadata: { admin: session, phone, daily_msg_limit: row.suggested_limit, cycle_seconds: row.suggested_cycle },
    });
    redirect(`/admin/plans?msg=applied&phone=${encodeURIComponent(phone)}`);
  }

  redirect('/admin/plans?msg=invalid');
}
