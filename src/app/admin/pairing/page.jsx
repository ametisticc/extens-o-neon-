// ============================================================
// Painel de pareamento — quem está online e para quem manda
// ============================================================
// Server Component. Consulta o banco via buildPairingBoard e monta a
// tabela de "número online → parceiro atual". Atualiza sozinho a cada
// 10s (PairingAutoRefresh usa router.refresh(), sem recarregar a página).
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import { buildPairingBoardWithClient } from '@/lib/pairing-board.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import PairingAutoRefresh from './PairingAutoRefresh.jsx';
import PairingActions from './PairingActions.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function onlineBadge(row) {
  if (row.online) return <span className="badge success">online</span>;
  const reasonMap = {
    heartbeat_stale: 'heartbeat antigo',
    session_ended: 'sessão encerrada',
    no_heartbeat: 'sem heartbeat',
    no_phone_number: 'sem número',
    no_session: 'sem sessão',
    status_ended: 'status ended',
    status_revoked: 'status revoked',
    status_expired: 'status expired',
    status_inactive: 'status inactive',
    status_unknown: 'status desconhecido',
  };
  return (
    <span className="badge inactive" title={row.online_reason ?? ''}>
      offline{row.online_reason ? ` · ${reasonMap[row.online_reason] || row.online_reason}` : ''}
    </span>
  );
}

function pairBadge(row) {
  if (!row.online) return <span className="badge inactive">—</span>;
  if (!row.eligible) return <span className="badge inactive" title={row.ineligible_reason ?? ''}>inativo</span>;
  if (!row.pair_with) return <span className="badge pending">aguardando par</span>;
  const map = { waiting: 'pending', paired: 'active', confirmed: 'success' };
  return <span className={`badge ${map[row.pair_status] || 'active'}`}>{row.pair_status}</span>;
}

export default async function AdminPairingPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return null; // layout renderiza o login

  const params = await searchParams;
  const msg = params?.msg;
  const releasedCount = params?.count;

  const supabase = tryGetSupabaseAdmin();
  let board = null;
  let fetchError = null;
  if (supabase) {
    try {
      const res = await buildPairingBoardWithClient(supabase, { limit: 200 });
      if (!res.ok) {
        fetchError = `Falha ao carregar quadro de pareamento: ${res.error ?? res.reason ?? 'erro desconhecido'}`;
      } else {
        board = res;
      }
    } catch (err) {
      console.error('[admin] exceção ao montar quadro de pareamento:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  const rows = board?.rows ?? [];
  const stats = board?.stats ?? { online: 0, paired: 0, waiting: 0 };

  return (
    <>
      <PairingAutoRefresh seconds={10} />

      <h1 className="page-title">Pareamento ao vivo</h1>
      <p className="page-subtitle">
        Números conectados e para quem cada um está enviando mensagem neste ciclo
        {board?.generated_at ? <> · atualizado {fmtDateTime(board.generated_at)}</> : null}
      </p>

      <AdminSetupWarning />

      {msg === 'released' && (
        <div className="alert alert-success">
          Pares liberados: <strong>{releasedCount ?? 0}</strong> par(es) com um dos lados offline foi encerrado. Os chips online vão formar novos pares no próximo ciclo.
        </div>
      )}
      {msg === 'rotated' && (
        <div className="alert alert-success">
          Rotação feita: <strong>{releasedCount ?? 0}</strong> par(es) encerrado(s). Todos os números vão trocar de parceiro no próximo ciclo — a rotação evita repetir quem já interagiu antes.
        </div>
      )}
      {msg === 'error' && (
        <div className="alert alert-error">Erro ao liberar pares. Tente novamente.</div>
      )}

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

      <div className="card" style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span className="muted">Quando um número cai do WhatsApp, o par fica travado e as mensagens param. Use os botões para destravar.</span>
          <PairingActions />
        </div>
      </div>

      <div className="grid-cards">
        <div className="stat-card">
          <div className="label">Online agora</div>
          <div className="value success">{stats.online}</div>
        </div>
        <div className="stat-card">
          <div className="label">Em troca (pareados)</div>
          <div className="value">{stats.paired}</div>
        </div>
        <div className="stat-card">
          <div className="label">Aguardando par</div>
          <div className="value warning">{stats.waiting}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Número</th>
                <th>Status</th>
                <th>Par</th>
                <th>Envia para</th>
                <th>Último heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((r, i) => (
                  <tr key={r.phone_normalized || i}>
                    <td>{r.user || '—'}</td>
                    <td className="mono">{r.phone}</td>
                    <td>{onlineBadge(r)}</td>
                    <td>{pairBadge(r)}</td>
                    <td className="mono">
                      {r.online && r.eligible && r.pair_with ? (
                        <strong>{r.pair_with}</strong>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {r.pair_with && r.online && r.eligible && !r.pair_with_online ? (
                        <span className="badge inactive" style={{ marginLeft: 6 }} title="O parceiro não está com sessão online agora">
                          offline
                        </span>
                      ) : null}
                    </td>
                    <td>{fmtDateTime(r.last_heartbeat_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">Nenhum número conectado no momento.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          A página recarrega sozinha a cada 10 segundos. “Online” considera sessão ativa com heartbeat nos
          últimos 3 minutos. “Envia para” mostra o parceiro do ciclo atual — com a rotação ligada, cada
          número troca de parceiro a cada ciclo em que ambos confirmam.
        </p>
      </div>
    </>
  );
}
