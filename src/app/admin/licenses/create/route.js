import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { logEvent } from '@/lib/logger.js';
import { normalizePhone } from '@/lib/phone.js';
import { randomToken } from '@/lib/crypto.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanString(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    redirect('/admin');
  }

  const formData = await request.formData();
  const name = cleanString(formData.get('name'));
  const email = cleanString(formData.get('email')).toLowerCase();
  const phone = cleanString(formData.get('phone'));
  const planId = cleanString(formData.get('plan_id'));
  const expiresAtRaw = cleanString(formData.get('expires_at'));

  // Validações básicas
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/admin/licenses?msg=invalid');
  }
  if (!phone) {
    redirect('/admin/licenses?msg=invalid');
  }
  if (!planId) {
    redirect('/admin/licenses?msg=invalid');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    redirect('/admin/licenses?msg=invalid');
  }

  // Interpreta a data escolhida pelo operador como "fim do dia no fuso do Brasil"
  // (America/Sao_Paulo, UTC-3). Sem isso o `new Date('YYYY-MM-DDT23:59:59')`
  // é interpretado no fuso do servidor (Vercel = UTC), o que expira a licença
  // 3 horas antes do fim do dia no horário do operador.
  const expiresAt = new Date(`${expiresAtRaw}T23:59:59-03:00`);
  if (Number.isNaN(expiresAt.getTime())) {
    redirect('/admin/licenses?msg=invalid');
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    redirect('/admin?error=invalid');
  }

  // 1. Usuário — busca por e-mail; se não existir, cria
  let user = await supabase
    .from(DB.USERS)
    .select('id, email')
    .eq('email', email)
    .maybeSingle();
  if (user.error) {
    console.error('[admin] erro ao buscar usuário:', user.error.message);
    redirect('/admin/licenses?msg=error');
  }

  let userId = user.data?.id;
  if (!userId) {
    const inserted = await supabase
      .from(DB.USERS)
      .insert({ email, name: name || null, status: 'active' })
      .select('id')
      .single();
    if (inserted.error) {
      console.error('[admin] erro ao criar usuário:', inserted.error.message);
      redirect('/admin/licenses?msg=error');
    }
    userId = inserted.data.id;
  }

  // 2. Número — busca por normalizado; se não existir, cria
  let number = await supabase
    .from(DB.NUMBERS)
    .select('id')
    .eq('phone_number_normalized', normalizedPhone)
    .maybeSingle();
  if (number.error) {
    console.error('[admin] erro ao buscar número:', number.error.message);
    redirect('/admin/licenses?msg=error');
  }

  let numberId = number.data?.id;
  if (!numberId) {
    const inserted = await supabase
      .from(DB.NUMBERS)
      .insert({
        user_id: userId,
        phone_number: normalizedPhone,
        phone_number_normalized: normalizedPhone,
        status: 'active',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (inserted.error) {
      console.error('[admin] erro ao criar número:', inserted.error.message);
      redirect('/admin/licenses?msg=error');
    }
    numberId = inserted.data.id;
  }

  // 3. Plano — valida que existe e permite Neon Warm
  const plan = await supabase
    .from(DB.PLANS)
    .select('id, name, neon_warm_enabled, active')
    .eq('id', planId)
    .maybeSingle();
  if (plan.error || !plan.data) {
    redirect('/admin/licenses?msg=invalid');
  }
  if (!plan.data.active || !plan.data.neon_warm_enabled) {
    redirect('/admin/licenses?msg=invalid');
  }

  // 4. Assinatura ativa (para o usuário/plano)
  const subscription = await supabase
    .from(DB.SUBSCRIPTIONS)
    .insert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();
  if (subscription.error) {
    console.error('[admin] erro ao criar assinatura:', subscription.error.message);
    redirect('/admin/licenses?msg=error');
  }

  // 5. Licença ativa
  const licenseKey = `NW-${randomToken(6).toUpperCase()}`;
  const license = await supabase
    .from(DB.LICENSES)
    .insert({
      user_id: userId,
      phone_number_id: numberId,
      plan_id: planId,
      status: 'active',
      license_key: licenseKey,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();
  if (license.error) {
    console.error('[admin] erro ao criar licença:', license.error.message);
    redirect('/admin/licenses?msg=error');
  }

  await logEvent({
    eventType: 'license_activated',
    userId,
    phoneNumberId: numberId,
    metadata: { admin: session, license_id: license.data.id, license_key: licenseKey, created: true },
  });

  redirect(`/admin/licenses?msg=created&key=${encodeURIComponent(licenseKey)}`);
}
