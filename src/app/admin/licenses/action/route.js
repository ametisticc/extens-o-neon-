import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { logEvent } from '@/lib/logger.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['activate', 'deactivate', 'revoke', 'block', 'unblock', 'reset_devices'];

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
  reset_devices: 'license_devices_reset',
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

  if (action === 'reset_devices') {
    // Zera o limite de dispositivos: encerra sessões ativas do usuário,
    // limpa pares abertos vinculados aos números do usuário e apaga os
    // dispositivos acumulados. A extensão volta a registrar um device
    // novo no próximo validate, liberando o limite do plano.
    const userId = license.user_id;

    // 1. Encerra sessões ativas do usuário (libera presença para /pair).
    await supabase
      .from(DB.SESSIONS)
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    // 2. Limpa pares em aberto envolvendo os números do usuário.
    const { data: userNumbers } = await supabase
      .from(DB.NUMBERS)
      .select('phone_number_normalized')
      .eq('user_id', userId);

    if (userNumbers && userNumbers.length > 0) {
      const phones = userNumbers
        .map((n) => n.phone_number_normalized)
        .filter(Boolean)
        .map((p) => `"${p}"`)
        .join(',');
      if (phones) {
        await supabase
          .from(DB.PAIRS)
          .update({ status: 'ended' })
          .or(`chip_a.in.(${phones}),chip_b.in.(${phones})`)
          .in('status', ['waiting', 'paired', 'confirmed']);
      }
    }

    // 3. Remove os dispositivos acumulados (é isso que estoura o max_devices).
    const { count: deviceCount } = await supabase
      .from(DB.DEVICES)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { error: delError } = await supabase
      .from(DB.DEVICES)
      .delete()
      .eq('user_id', userId);

    if (delError) {
      console.error('[admin] erro ao zerar dispositivos:', delError.message);
      redirect('/admin/licenses?msg=error');
    }

    await logEvent({
      eventType,
      userId,
      phoneNumberId: license.phone_number_id,
      metadata: { admin: session, license_id: id, action, devices_removed: deviceCount ?? 0 },
    });

    redirect('/admin/licenses?msg=devices_reset');
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
