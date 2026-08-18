// ============================================================
// Painel de planos de maturação — /admin/plans
// ============================================================
// Mostra, para cada número conectado:
//   - o plano atual (limite diário, intervalo de ciclo, status)
//   - enviadas/recebidas HOJE
//   - última atividade / último par
//   - a sugestão automática de plano
// Com ações: Continuar (aprova pausa), Pausar, Aplicar sugestão, Editar.
//
// Server Component (dados via buildMaturationBoardWithClient) + o
// Client Component PlanActions para os formulários (event handlers).
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import { buildMaturationBoardWithClient } from '@/lib/maturation-board.js';
import { fmtDateTime } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import PlanActions from './PlanActions.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusBadge(row) {
  if (row.status === 'paused') {
    const reason = row.paused_reason === 'daily_limit' ? 'limite diário' : row.paused_reason || 'manual';
    return <span className="badge blocked" title={`Pausado em ${fmtDateTime(row.paused_at)} · ${reason}`}>pausado</span>;
  }
  if (row.status === 'active') return <span className="badge success">ativo</span>;
  return <span className="badge inactive">sem plano</span>;
}

function fmtCycle(seconds) {
  if (!seconds) return 'padrão';
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

function fmtCycles(done, limit) {
  if (!limit) return done ? `${done} feito` : '—';
  return `${done} / ${limit}`;
}

export default async function AdminPlansPage({ searchParams }) {
  const session = await readAdminSession();
  if (!session) return null; // layout renderiza o login

  const params = await searchParams;
  const msgCode = params?.msg;
  const phone = params?.phone ? decodeURIComponent(String(params.phone)) : null;

  const MSG_MAP = {
    saved: { text: phone ? `Plano de ${phone} salvo.` : 'Plano salvo.', type: 'success' },
    started: { text: phone ? `Maturação de ${phone} iniciada — a extensão segue o plano no próximo ciclo.` : 'Maturação iniciada.', type: 'success' },
    paused: { text: phone ? `Maturação de ${phone} pausada.` : 'Maturação pausada.', type: 'success' },
    approved: { text: phone ? `${phone} aprovado — a extensão retoma no próximo ciclo.` : 'Plano aprovado.', type: 'success' },
    applied: { text: phone ? `Sugestão aplicada para ${phone}.` : 'Sugestão aplicada.', type: 'success' },
    no_suggest: { text: 'Sem dados suficientes para sugerir um plano para este número ainda.', type: 'warning' },
    invalid: { text: 'Dados inválidos. Confira os campos.', type: 'error' },
    error: { text: 'Erro ao salvar. Tente novamente.', type: 'error' },
  };
  const message = MSG_MAP[msgCode] || null;

  const supabase = tryGetSupabaseAdmin();
  let board = null;
  let fetchError = null;
  if (supabase) {
    try {
      const res = await buildMaturationBoardWithClient(supabase);
      if (!res.ok) {
        fetchError = `Falha ao carregar planos: ${res.error ?? 'erro desconhecido'}`;
      } else {
        board = res;
      }
    } catch (err) {
      console.error('[admin] exceção ao montar quadro de planos:', err);
      fetchError = `Erro inesperado ao carregar dados: ${err.message}`;
    }
  }

  const rows = board?.rows ?? [];
  const stats = board?.stats ?? { total_connected: 0, with_plan: 0, paused: 0, at_limit: 0 };

  return (
    <>
      <h1 className="page-title">Planos de maturação</h1>
      <p className="page-subtitle">
        Limite diário, intervalo de ciclo e pausa por número. As regras são aplicadas no servidor
        (sem instalar nada nos clientes): quando o limite é atingido ou o plano é pausado, o backend
        segura o pareamento e a extensão retoma sozinha quando você continuar.
      </p>

      <AdminSetupWarning />

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : message.type === 'warning' ? 'alert-warning' : 'alert-error'}`}>
          {message.text}
        </div>
      )}

      {fetchError && (
        <div className="alert alert-error" style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <strong>Erro ao carregar o painel:</strong> {fetchError}
        </div>
      )}

      <div className="grid-cards">
        <div className="stat-card">
          <div className="label">Números (hoje)</div>
          <div className="value">{stats.total_connected}</div>
        </div>
        <div className="stat-card">
          <div className="label">Com plano</div>
          <div className="value success">{stats.with_plan}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pausados</div>
          <div className="value warning">{stats.paused}</div>
        </div>
        <div className="stat-card">
          <div className="label">No limite</div>
          <div className="value">{stats.at_limit}</div>
        </div>
      </div>

      {stats.suggested_limit || stats.suggested_cycle ? (
        <div className="alert alert-info" style={{ fontSize: 13 }}>
          <strong>Sugestão automática global:</strong>{' '}
          {stats.suggested_limit ? <>limite de <strong>{stats.suggested_limit}</strong> enviadas/dia</> : null}
          {stats.suggested_limit && stats.suggested_cycle ? ' · ' : null}
          {stats.suggested_cycle ? <>ciclo de <strong>{fmtCycle(stats.suggested_cycle)}</strong></> : null}
          {' '}— baseada nas contas saudáveis. Use "Aplicar sugestão" em cada número para ajustar.
        </div>
      ) : null}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Hoje (enviadas)</th>
                <th>Hoje (recebidas)</th>
                <th>Ciclos</th>
                <th>Última atividade</th>
                <th>Sugestão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((r, i) => (
                  <tr key={r.phone_number_normalized || i} style={r.status === 'paused' ? { background: 'rgba(244,63,94,.05)' } : undefined}>
                    <td className="mono">{r.phone_number_normalized}</td>
                    <td style={{ fontSize: 12 }}>
                      <span className="muted">limite</span> {r.daily_msg_limit ?? '∞'}
                      <br />
                      <span className="muted">ciclo</span> {fmtCycle(r.cycle_seconds)}
                    </td>
                    <td>{statusBadge(r)}</td>
                    <td className="mono">
                      {r.sent_today}
                      {r.daily_msg_limit && r.at_limit ? (
                        <span className="badge warning" style={{ marginLeft: 6 }}>no limite</span>
                      ) : null}
                    </td>
                    <td className="mono">{r.received_today}</td>
                    <td className="mono">
                      {fmtCycles(r.cycles_done, r.cycle_limit)}
                      {r.at_cycle_limit ? (
                        <span className="badge warning" style={{ marginLeft: 6 }}>pausado</span>
                      ) : null}
                    </td>
                    <td>{fmtDateTime(r.last_activity_at)}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.suggested_limit || r.suggested_cycle ? (
                        <>
                          {r.suggested_limit ? <>limite <strong>{r.suggested_limit}</strong></> : null}
                          {r.suggested_limit && r.suggested_cycle ? ' · ' : null}
                          {r.suggested_cycle ? <>ciclo <strong>{fmtCycle(r.suggested_cycle)}</strong></> : null}
                        </>
                      ) : (
                        <span className="muted">aguardando dados</span>
                      )}
                    </td>
                    <td>
                      <PlanActions row={r} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty">
                    Nenhum número conectado ou com plano ainda. Os números conectados aparecem aqui
                    conforme trocam mensagens (os clientes não precisam reinstalar nada).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          "Enviadas hoje" = pares confirmados hoje (1 par confirmado ≈ 1 mensagem enviada e 1 recebida por lado).
          Sem plano configurado, o número fica sem limite (comportamento atual). O botão <strong>Continuar</strong>{" "}
          reaprova um número pausado — a extensão retoma sozinha no próximo ciclo.
        </p>
      </div>
    </>
  );
}
