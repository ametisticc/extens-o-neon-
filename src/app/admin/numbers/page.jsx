import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin, DB } from '@/lib/supabase.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusBadge(status) {
  const map = {
    active: 'success',
    blocked: 'blocked',
    inactive: 'inactive',
    expired: 'expired',
  };
  return <span className={`badge ${map[status] || 'inactive'}`}>{status}</span>;
}

export default async function AdminNumbersPage() {
  const session = await readAdminSession();
  if (!session) return null; // layout renderiza o login

  const supabase = tryGetSupabaseAdmin();
  let numbers = null;
  let fetchError = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(DB.NUMBERS)
        .select('*, neon_warm_users(email, name), neon_warm_devices(id, device_id, last_seen_at, status)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        fetchError = `Falha ao carregar números: ${error.message} (${error.code ?? 'sem código'})`;
      } else {
        numbers = data;
      }
    } catch (err) {
      console.error('[admin] exceção ao carregar números:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  return (
    <>
      <h1 className="page-title">Números</h1>
      <p className="page-subtitle">Números de WhatsApp cadastrados no Neon Warm</p>

      <AdminSetupWarning />

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

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
                <th>Última atividade</th>
                <th>Dispositivos</th>
              </tr>
            </thead>
            <tbody>
              {numbers && numbers.length > 0 ? (
                numbers.map((n) => (
                  <tr key={n.id}>
                    <td>{n.neon_warm_users?.name || n.neon_warm_users?.email || '—'}</td>
                    <td className="mono">{n.phone_number}</td>
                    <td>—</td>
                    <td>{statusBadge(n.status)}</td>
                    <td>—</td>
                    <td>{fmtDateTime(n.last_seen_at)}</td>
                    <td>{n.neon_warm_devices?.length ?? 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">Nenhum número cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
