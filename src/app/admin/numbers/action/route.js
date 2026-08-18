// ============================================================
// POST /admin/numbers/action
// ============================================================
// Aciona o fluxo EXISTENTE de "Iniciar Maturação" a partir da tela
// Números do ADM. O servidor é a AUTORIDADE FINAL: mesmo que o
// frontend mostre o botão habilitado, aqui revalidamos a elegibilidade
// (online + ativo + autorizado + não banido/restrito/pausado) antes de
// chamar startPlanWithClient.
//
// Body (JSON):
//   { phones: ["5511999999999", ...] }
//
// Resposta:
//   { ok: true, started: [...], skipped: [...] }
//     started → [{ phone, plan }]
//     skipped → [{ phone, reason }]
//   { ok: false, error: "..." }  → erro interno / não autenticado
//
// Não altera extensão, pareamento, ciclos nem a lógica de maturação.
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import { normalizePhone } from '@/lib/phone.js';
import { startPlanWithClient } from '@/lib/maturation-plans.js';
import { buildNumberMaturationRowsWithClient, classifyEligibleRows } from '@/lib/maturation-eligibility.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const session = await readAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Corpo JSON inválido.' }, { status: 400 });
  }

  const rawPhones = Array.isArray(body?.phones) ? body.phones : [];
  const phones = [...new Set(rawPhones.map((p) => normalizePhone(String(p ?? ''))).filter(Boolean))];

  if (!phones.length) {
    return Response.json({ ok: false, error: 'Nenhum número informado.' }, { status: 400 });
  }

  const supabase = tryGetSupabaseAdmin();
  if (!supabase) {
    return Response.json({ ok: false, error: 'Backend não configurado.' }, { status: 500 });
  }

  // ---- 1. Busca os números selecionados ----
  const { data: numbers, error: numErr } = await supabase
    .from('neon_warm_numbers')
    .select('*, neon_warm_users(email, name), neon_warm_devices(id, device_id, last_seen_at, status)')
    .in('phone_number_normalized', phones);

  if (numErr) {
    console.error('[admin/numbers/action] erro ao buscar números:', numErr.message);
    return Response.json({ ok: false, error: 'Erro ao buscar números.' }, { status: 500 });
  }

  // ---- 2. Revalida elegibilidade no servidor (não confia no frontend) ----
  const enriched = await buildNumberMaturationRowsWithClient(supabase, numbers || []);
  if (!enriched.ok) {
    console.error('[admin/numbers/action] erro ao avaliar elegibilidade:', enriched.error);
    return Response.json({ ok: false, error: 'Erro ao avaliar elegibilidade.' }, { status: 500 });
  }

  const { eligible, ineligible } = classifyEligibleRows(enriched.rows, phones);

  // ---- 3. Chama a função EXISTENTE de start (startPlanWithClient) ----
  const started = [];
  const failed = [];
  for (const row of eligible) {
    const result = await startPlanWithClient(supabase, { phone: row.phone_number_normalized });
    if (result.ok) {
      started.push({ phone: row.phone_number_normalized, plan: result.plan });
      await logEvent({
        eventType: 'plan_started',
        metadata: { admin: session, phone: row.phone_number_normalized, source: 'admin/numbers' },
      }).catch(() => {});
    } else {
      failed.push({ phone: row.phone_number_normalized, reason: result.reason || 'start_failed' });
    }
  }

  const skipped = [...ineligible, ...failed];

  return Response.json({
    ok: true,
    started,
    skipped,
    summary: {
      requested: phones.length,
      started: started.length,
      skipped: skipped.length,
    },
  });
}
