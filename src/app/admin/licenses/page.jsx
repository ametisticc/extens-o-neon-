import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';

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
    created: {
      text: params?.key ? `Licença criada com sucesso! Chave: ${params.key}` : 'Licença criada com sucesso!',
      type: 'success',
    },
    invalid: { text: 'Dados inválidos. Confira os campos.', type: 'error' },
    notfound: { text: 'Licença não encontrada.', type: 'error' },
    error: { text: 'Erro ao criar/atualizar licença.', type: 'error' },
  };
  const message = MSG_MAP[msgCode] || null;

  const supabase = tryGetSupabaseAdmin();
  let licenses = null;
  let plans = [];
  if (supabase) {
    const [licensesRes, plansRes] = await Promise.all([
      supabase
        .from(DB.LICENSES)
        .select('*, neon_warm_users(email, name), neon_warm_numbers(phone_number, phone_number_normalized), neon_warm_plans(name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from(DB.PLANS)
        .select('id, name, price, neon_warm_enabled')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);
    licenses = licensesRes.data;
    plans = plansRes.data ?? [];
  }

  return (
    <>
      <h1 className="page-title">Licenças</h1>
      <p className="page-subtitle">Gerenciamento de licenças do Neon Warm</p>

      <AdminSetupWarning />

      {message && <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>{message.text}</div>}

      <div className="card">
        <h2>Nova licença</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
          Cria o cliente, o número e a assinatura automaticamente se ainda não existirem.
        </p>
        <form action="/admin/licenses/create" method="post" className="license-create-form">
          <div className="form-row">
            <label htmlFor="name">Nome</label>
            <input type="text" id="name" name="name" placeholder="Nome do cliente" autoComplete="off" />
          </div>
          <div className="form-row">
            <label htmlFor="email">E-mail *</label>
            <input type="email" id="email" name="email" placeholder="cliente@email.com" required autoComplete="off" />
          </div>
          <div className="form-row">
            <label htmlFor="phone">Telefone (WhatsApp) *</label>
            <input type="tel" id="phone" name="phone" placeholder="(11) 99999-9999" required autoComplete="off" />
          </div>
          <div className="form-row">
            <label htmlFor="plan_id">Plano *</label>
            <select id="plan_id" name="plan_id" required>
              <option value="">Selecione o plano…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — R$ {Number(p.price).toFixed(2)}
                  {!p.neon_warm_enabled ? ' (sem Neon Warm)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="expires_at">Vencimento *</label>
            <input type="date" id="expires_at" name="expires_at" required />
          </div>
          <div className="form-row">
            <button type="submit" className="btn">Criar licença</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Número</th>
                <th>Plano</th>
                <th>Chave</th>
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
                    <td className="mono">{l.license_key ?? '—'}</td>
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
                  <td colSpan={8} className="empty">Nenhuma licença cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
