import { readAdminSession } from '@/lib/admin.js';
import { isAdminConfigured } from '@/lib/admin-config.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper para contar registros sem trazer todos.
async function countRows(table, filters = {}) {
  const supabase = tryGetSupabaseAdmin();
  if (!supabase) return 0;
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`[admin] erro ao contar ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  const configured = isAdminConfigured();

  return (
    <div className="login-card">
      <h1>Painel Neon Warm</h1>
      <p className="muted">Acesso restrito ao operador.</p>

      {error === 'invalid' && <div className="alert alert-error">Credenciais inválidas.</div>}

      {!configured && (
        <div className="alert alert-error" style={{ fontSize: 13 }}>
          Painel não configurado. Adicione <strong>NEON_WARM_ADMIN_EMAIL</strong>,{' '}
          <strong>NEON_WARM_ADMIN_PASSWORD</strong> e <strong>NEON_WARM_ADMIN_SECRET</strong> nas
          variáveis de ambiente do Vercel e faça um novo deploy.
        </div>
      )}

      {configured && <AdminSetupWarning />}

      <form action="/admin/login" method="post" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" name="email" placeholder="E-mail" required autoComplete="username" />
        <input type="password" name="password" placeholder="Senha" required autoComplete="current-password" />
        <button type="submit" className="btn">Entrar</button>
      </form>
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return <LoginPage searchParams={searchParams} />;

  const [
    numbersActive,
    numbersBlocked,
    licensesActive,
    licensesExpired,
    sessionsActive,
    totalValidations,
  ] = await Promise.all([
    countRows(DB.NUMBERS, { status: 'active' }),
    countRows(DB.NUMBERS, { status: 'blocked' }),
    countRows(DB.LICENSES, { status: 'active' }),
    countRows(DB.LICENSES, { status: 'expired' }),
    countRows(DB.SESSIONS, { status: 'active' }),
    countRows(DB.LOGS),
  ]);

  const stats = [
    { label: 'Números autorizados', value: numbersActive, className: 'success' },
    { label: 'Números bloqueados', value: numbersBlocked, className: 'danger' },
    { label: 'Licenças ativas', value: licensesActive, className: 'success' },
    { label: 'Licenças expiradas', value: licensesExpired, className: 'warning' },
    { label: 'Sessões ativas', value: sessionsActive, className: '' },
    { label: 'Validações (total)', value: totalValidations, className: '' },
  ];

  // Últimas validações (logs de validação)
  const supabase = tryGetSupabaseAdmin();
  let lastLogs = null;
  if (supabase) {
    const res = await supabase
      .from(DB.LOGS)
      .select('id, event_type, metadata, created_at, phone_number_id')
      .in('event_type', ['validation_success', 'validation_failed'])
      .order('created_at', { ascending: false })
      .limit(10);
    lastLogs = res.data;
  }

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Visão geral do Neon Warm</p>

      <div className="grid-cards">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="label">{s.label}</div>
            <div className={`value ${s.className}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Últimas validações</h2>
        {lastLogs && lastLogs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Número</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {lastLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDateTime(log.created_at)}</td>
                    <td>
                      <span className={`badge ${log.event_type === 'validation_success' ? 'success' : 'blocked'}`}>
                        {log.event_type === 'validation_success' ? 'Autorizado' : 'Negado'}
                      </span>
                    </td>
                    <td className="mono">{log.metadata?.phone_number ?? '—'}</td>
                    <td>{log.metadata?.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhuma validação registrada ainda.</div>
        )}
      </div>
    </>
  );
}
