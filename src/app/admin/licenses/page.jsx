import { readAdminSession } from '@/lib/admin.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusBadge(status) {
  const map = {
    active: 'success',
    inactive: 'inactive',
    expired: 'expired',
    revoked: 'revoked',
    blocked: 'blocked',
  };
  return <span className={`badge ${map[status] || 'inactive'}`}>{status}</span>;
}

export default async function AdminLicensesPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return null;

  const params = await searchParams;
  const msgCode = params?.msg;

  const MSG_MAP = {
    ok: { text: 'Licença atualizada com sucesso.', type: 'success' },
    invalid: { text: 'Ação inválida.', type: 'error' },
    notfound: { text: 'Licença não encontrada.', type: 'error' },
    error: { text: 'Erro ao atualizar licença.', type: 'error' },
  };
  const message = MSG_MAP[msgCode] || null;

  const { data: licenses } = await getSupabaseAdmin()
    .from(DB.LICENSES)
    .select('*, neon_warm_users(email, name), neon_warm_numbers(phone_number, phone_number_normalized), neon_warm_plans(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <h1 className="page-title">Licenças</h1>
      <p className="page-subtitle">Gerenciamento de licenças do Neon Warm</p>

      {message && <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>{message.text}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Número</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Vencimento</th>
                <th>Última validação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {licenses && licenses.length > 0 ? (
                licenses.map((l) => (
                  <tr key={l.id}>
                    <td>{l.neon_warm_users?.name || l.neon_warm_users?.email || '—'}</td>
                    <td className="mono">{l.neon_warm_numbers?.phone_number ?? '—'}</td>
                    <td>{l.neon_warm_plans?.name ?? '—'}</td>
                    <td>{statusBadge(l.status)}</td>
                    <td>{l.expires_at ? new Date(l.expires_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{l.last_validation_at ? new Date(l.last_validation_at).toLocaleString('pt-BR') : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {l.status !== 'active' && (
                          <form action="/admin/licenses/action" method="post">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="action" value="activate" />
                            <button type="submit" className="btn btn-sm">Ativar</button>
                          </form>
                        )}
                        {l.status !== 'revoked' && (
                          <form action="/admin/licenses/action" method="post">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="action" value="revoke" />
                            <button type="submit" className="btn btn-sm btn-danger">Revogar</button>
                          </form>
                        )}
                        {l.status !== 'blocked' ? (
                          <form action="/admin/licenses/action" method="post">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="action" value="block" />
                            <button type="submit" className="btn btn-sm btn-warning">Bloquear</button>
                          </form>
                        ) : (
                          <form action="/admin/licenses/action" method="post">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="action" value="unblock" />
                            <button type="submit" className="btn btn-sm">Desbloquear</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">Nenhuma licença cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
