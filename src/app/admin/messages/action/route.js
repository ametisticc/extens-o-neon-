import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { logEvent } from '@/lib/logger.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['create', 'activate', 'deactivate', 'delete'];
const VALID_CATEGORIES = ['reacao', 'saudacao', 'pergunta', 'cotidiano', 'longa', 'solta'];

function cleanString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    redirect('/admin');
  }

  const formData = await request.formData();
  const action = String(formData.get('action') ?? '');

  if (!VALID_ACTIONS.includes(action)) {
    redirect('/admin/messages?msg=invalid');
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    redirect('/admin?error=invalid');
  }

  // ------------------------------------------------------------
  // CRIAR
  // ------------------------------------------------------------
  if (action === 'create') {
    const category = cleanString(formData.get('category'), 20);
    const text = cleanString(formData.get('text'), 500);
    const priorityRaw = Number(formData.get('priority') ?? 100);
    const activeRaw = String(formData.get('active') ?? 'true');

    if (!VALID_CATEGORIES.includes(category) || !text) {
      redirect('/admin/messages?msg=invalid');
    }
    if (!Number.isFinite(priorityRaw) || priorityRaw < 1 || priorityRaw > 9999) {
      redirect('/admin/messages?msg=invalid');
    }

    const { error } = await supabase.from(DB.MESSAGES).insert({
      category,
      text,
      priority: Math.round(priorityRaw),
      active: activeRaw === 'true',
    });

    if (error) {
      console.error('[admin] erro ao criar mensagem:', error.message);
      redirect('/admin/messages?msg=error');
    }

    await logEvent({
      eventType: 'message_created',
      metadata: { admin: session, category },
    });
    redirect('/admin/messages?msg=created');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) {
    redirect('/admin/messages?msg=invalid');
  }

  const { data: existing } = await supabase
    .from(DB.MESSAGES)
    .select('id, category, active')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    redirect('/admin/messages?msg=notfound');
  }

  // ------------------------------------------------------------
  // ATIVAR / DESATIVAR
  // ------------------------------------------------------------
  if (action === 'activate' || action === 'deactivate') {
    const active = action === 'activate';
    const { error } = await supabase
      .from(DB.MESSAGES)
      .update({ active })
      .eq('id', id);

    if (error) {
      console.error('[admin] erro ao atualizar mensagem:', error.message);
      redirect('/admin/messages?msg=error');
    }

    await logEvent({
      eventType: active ? 'message_activated' : 'message_deactivated',
      metadata: { admin: session, category: existing.category },
    });
    redirect('/admin/messages?msg=updated');
  }

  // ------------------------------------------------------------
  // EXCLUIR
  // ------------------------------------------------------------
  if (action === 'delete') {
    const { error } = await supabase.from(DB.MESSAGES).delete().eq('id', id);

    if (error) {
      console.error('[admin] erro ao excluir mensagem:', error.message);
      redirect('/admin/messages?msg=error');
    }

    await logEvent({
      eventType: 'message_deleted',
      metadata: { admin: session, category: existing.category },
    });
    redirect('/admin/messages?msg=deleted');
  }

  redirect('/admin/messages?msg=invalid');
}
