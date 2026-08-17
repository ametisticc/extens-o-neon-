import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// GET /admin/diagnose
// ============================================================
// Diagnóstico do painel admin (somente operador autenticado).
// Repete as mesmas queries das páginas e devolve o erro CRU em
// JSON. Route handlers não têm o mecanismo de "omitir mensagens
// em produção" dos Server Components, então o motivo real do
// crash aparece aqui.
//
// SEGURANÇA: não retorna dados de clientes nem secrets — apenas
// o status de cada consulta e o erro, se houver. O `table` é o
// nome da tabela, nunca valor.
export async function GET() {
  const session = await readAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: 'Nao autenticado' }, { status: 401 });
  }

  const out = {
    ok: true,
    time: new Date().toISOString(),
    build_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    env: {
      admin_configured: Boolean(
        process.env.NEON_WARM_ADMIN_EMAIL &&
        process.env.NEON_WARM_ADMIN_PASSWORD &&
        process.env.NEON_WARM_ADMIN_SECRET
      ),
      supabase_configured: Boolean(
        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    },
    checks: [],
  };

  const supabase = tryGetSupabaseAdmin();

  async function check(label, fn) {
    try {
      const result = await fn();
      out.checks.push({ label, ...result });
    } catch (err) {
      out.checks.push({
        label,
        status: 'erro-inesperado',
        error: err?.message || String(err),
      });
    }
  }

  if (!supabase) {
    out.checks.push({ label: 'supabase-client', status: 'nao-configurado' });
  } else {
    await check('client-ping', async () => {
      const { data, error } = await supabase.from(DB.LICENSES).select('id').limit(1);
      if (error) return { status: 'erro', table: DB.LICENSES, error: { message: error.message, code: error.code } };
      return { status: 'ok', table: DB.LICENSES, rows: data?.length ?? 0 };
    });

    await check('licenses', async () => {
      const { data, error } = await supabase
        .from(DB.LICENSES)
        .select('*, neon_warm_users(email, name), neon_warm_numbers(phone_number, phone_number_normalized), neon_warm_plans(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return { status: 'erro', table: DB.LICENSES, error: { message: error.message, code: error.code } };
      return { status: 'ok', table: DB.LICENSES, rows: data?.length ?? 0 };
    });

    await check('plans', async () => {
      const { data, error } = await supabase
        .from(DB.PLANS)
        .select('id, name, price, neon_warm_enabled')
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) return { status: 'erro', table: DB.PLANS, error: { message: error.message, code: error.code } };
      return { status: 'ok', table: DB.PLANS, rows: data?.length ?? 0 };
    });

    await check('numbers', async () => {
      const { data, error } = await supabase
        .from(DB.NUMBERS)
        .select('id')
        .limit(1);
      if (error) return { status: 'erro', table: DB.NUMBERS, error: { message: error.message, code: error.code } };
      return { status: 'ok', table: DB.NUMBERS, rows: data?.length ?? 0 };
    });

    await check('logs', async () => {
      const { data, error } = await supabase
        .from(DB.LOGS)
        .select('id, event_type, metadata, created_at, user_id, phone_number_id, device_id, neon_warm_users(email, name), neon_warm_numbers(phone_number)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return { status: 'erro', table: DB.LOGS, error: { message: error.message, code: error.code } };
      return { status: 'ok', table: DB.LOGS, rows: data?.length ?? 0 };
    });
  }

  return Response.json(out);
}
