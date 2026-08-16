import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { logEvent } from '@/lib/logger.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['activate', 'deactivate', 'revoke', 'block', 'unblock'];

const ACTION_TO_STATUS = {
  activate: 'active',
  deactivate: 'inactive',
  revoke: 'revoked',
  block: 'blocked',
  unblock: 'active',
};

const ACTION_TO_EVENT = {
  activate: 'license_activated',
  deactivate: 'license_revoked',
  revoke: 'license_revoked',
  block: 'license_revoked',
  unblock: 'license_activated',
};

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    redirect('/admin');
  }

  const formData = await request.formData();
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');

  if (!id || !VALID_ACTIONS.includes(action)) {
    redirect('/admin/licenses?msg=invalid');
  }

  const status = ACTION_TO_STATUS[action];
  const eventType = ACTION_TO_EVENT[action];

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    redirect('/admin?error=invalid');
  }

  const { data: license, error: fetchError } = await supabase
    .from(DB.LICENSES)
    .select('id, user_id, phone_number_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !license) {
    redirect('/admin/licenses?msg=notfound');
  }

  const { error } = await supabase
    .from(DB.LICENSES)
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('[admin] erro ao atualizar licença:', error.message);
    redirect('/admin/licenses?msg=error');
  }

  await logEvent({
    eventType,
    userId: license.user_id,
    phoneNumberId: license.phone_number_id,
    metadata: { admin: session, license_id: id, action },
  });

  redirect('/admin/licenses?msg=ok');
}
