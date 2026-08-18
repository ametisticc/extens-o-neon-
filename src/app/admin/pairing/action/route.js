// ============================================================
// POST /admin/pairing/action
// ============================================================
// Ações do painel de pareamento (somente operador autenticado):
//
//   action = release_stale   → encerra todos os pares ativos em que um
//                              dos lados não está online (destrava chips
//                              presos com parceiro offline).
//   action = release_number  → encerra os pares ativos que envolvem um
//                              número específico (tira o número do
//                              pareamento na hora).
//   action = rotate_all      → encerra TODOS os pares ativos de uma vez
//                              (mesmo com os dois lados online) — força a
//                              rotação geral de parceiros no próximo ciclo.
//
// Segue o padrão das outras rotas admin (cookie assinado + redirect).
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import { releaseStalePairs, rotateAllPairs } from '@/lib/pairing.js';
import { logEvent } from '@/lib/logger.js';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['release_stale', 'release_number', 'rotate_all'];

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    redirect('/admin');
  }

  const formData = await request.formData();
  const action = String(formData.get('action') ?? '');
  const phone = String(formData.get('phone') ?? '').trim();

  if (!VALID_ACTIONS.includes(action)) {
    redirect('/admin/pairing?msg=invalid');
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    redirect('/admin?error=invalid');
  }

  let result;
  if (action === 'release_stale') {
    result = await releaseStalePairs({});
  } else if (action === 'rotate_all') {
    result = await rotateAllPairs();
  } else {
    // release_number: exige um telefone.
    if (!phone) redirect('/admin/pairing?msg=invalid');
    result = await releaseStalePairs({ onlyPhone: phone });
  }

  if (!result.ok) {
    console.error('[admin] erro ao liberar pares:', result.error ?? result.reason);
    redirect('/admin/pairing?msg=error');
  }

  await logEvent({
    eventType: action === 'rotate_all' ? 'pairing_rotate' : 'pairing_release',
    metadata: {
      admin: session,
      action,
      phone: phone || null,
      released: result.released ?? 0,
      rotated: result.rotated ?? 0,
    },
  }).catch(() => {});

  if (action === 'rotate_all') {
    redirect(`/admin/pairing?msg=rotated&count=${result.rotated ?? 0}`);
  }
  redirect(`/admin/pairing?msg=released&count=${result.released ?? 0}`);
}
