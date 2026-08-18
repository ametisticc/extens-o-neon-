// ============================================================
// Painel de planos de maturação — /admin/plans
// ============================================================
// Mostra, para cada número conectado:
//   - o plano atual (limite diário, intervalo de ciclo, status)
//   - enviadas/recebidas HOJE
//   - última atividade / último par
//   - a sugestão automática de plano
// Com ações: Continuar (aprova pausa), Pausar, Iniciar, Marcar,
// Aplicar sugestão e Editar (via menu "⋯" na linha).
//
// Server Component (dados via buildMaturationBoardWithClient) + os
// Client Components PlanActions (ícones/menu), CopyNumber (copiar
// número) e NewPlanButton (+ Novo plano). Refatoração visual APENAS:
// NENHUMA query, rota ou regra de negócio foi alterada.
import { readAdminSession } from '@/lib/admin.js';
import { tryGetSupabaseAdmin } from '@/lib/supabase.js';
import { buildMaturationBoardWithClient } from '@/lib/maturation-board.js';
import { fmtDate } from '@/lib/fmt.js';
import { AdminSetupWarning } from '@/components/AdminSetupWarning.jsx';
import PlanActions from './PlanActions.jsx';
import CopyNumber from './CopyNumber.jsx';
import NewPlanButton from './NewPlanButton.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* --------------------------- formatação --------------------------- */
function fmtCycle(seconds) {
  if (!seconds) return 'padrão';
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

function fmtCycles(done, limit) {
  if (!limit) return done ? `${done} feito` : '—';
  return `${done} / ${limit}`;
}

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/* ---------------------------- status dot --------------------------- */
function StatusDot({ row }) {
  if (row.penalty_status) {
    const isBan = row.penalty_status === 'banned';
    const extra = row.flag_reason ? ` · ${row.flag_reason}` : '';
    return (
      <span
        className={`dot-badge red${isBan ? '' : ' amber'}`}
        title={`Marcado em ${fmtDate(row.flagged_at)}${extra}`}
      >
        <i />
        {isBan ? 'banido' : 'restrito'}
      </span>
    );
  }
  if (row.status === 'paused') {
    const reason = row.paused_reason === 'daily_limit' ? 'limite diário' : row.paused_reason === 'cycle_limit' ? 'limite de ciclos' : row.paused_reason || 'manual';
    return (
      <span className="dot-badge amber" title={`Pausado · ${reason}`}>
        <i />
        pausado
      </span>
    );
  }
  if (row.status === 'active') {
    return (
      <span className="dot-badge green">
        <i />
        ativo
      </span>
    );
  }
  return (
    <span className="dot-badge gray">
      <i />
      sem plano
    </span>
  );
}

/* ----------------------------- ícones ----------------------------- */
const ICONS = {
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  ),
  ban: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  ),
};

/* ------------------------- cards de resumo ------------------------- */
function buildStats(stats) {
  return [
    {
      label: 'Números (hoje)',
      value: stats.total_connected ?? 0,
      icon: 'phone',
      tone: 'purple',
      complement: 'conectados com atividade',
      valueClass: 'primary',
    },
    {
      label: 'Com plano',
      value: stats.with_plan ?? 0,
      icon: 'check',
      tone: 'green',
      complement: 'ativos com limite/ciclo',
      valueClass: 'success',
    },
    {
      label: 'Pausados',
      value: stats.paused ?? 0,
      icon: 'pause',
      tone: 'orange',
      complement: 'aguardando liberação',
      valueClass: 'warning',
    },
    {
      label: 'No limite',
      value: stats.at_limit ?? 0,
      icon: 'gauge',
      tone: 'pink',
      complement: 'atingiram o teto do dia',
      valueClass: 'pink',
    },
    {
      label: 'Banidos/Restritos',
      value: stats.flagged ?? 0,
      icon: 'ban',
      tone: 'red',
      complement: 'suspensos pelo WhatsApp',
      valueClass: 'danger',
    },
  ];
}

/* ---------------------------- página ---------------------------- */
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
    flagged: { text: phone ? `${phone} marcado. Pareamento suspenso e número excluído dos parceiros.` : 'Número marcado.', type: 'success' },
    unflag: { text: phone ? `${phone} liberado — pode voltar a parear.` : 'Número liberado.', type: 'success' },
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
  const stats = board?.stats ?? { total_connected: 0, with_plan: 0, paused: 0, at_limit: 0, flagged: 0 };
  const statsCards = buildStats(stats);

  return (
    <>
      {/* Header — título + texto existentes (peso visual reduzido) + Novo plano */}
      <div className="admin-header plans-header">
        <div>
          <h1 className="page-title">Planos de maturação</h1>
          <p className="page-subtitle">
            Limite diário, intervalo de ciclo e pausa por número. As regras são aplicadas no servidor
            (sem instalar nada nos clientes): quando o limite é atingido, o plano é pausado ou o número
            é marcado como <strong>banido/restrito</strong>, o backend segura o pareamento e a extensão
            retoma sozinha quando você liberar.
          </p>
        </div>
        <div className="header-right">
          <NewPlanButton />
        </div>
      </div>

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

      {/* Resumo — 5 cards com ícone discreto */}
      <div className="grid-cards">
        {statsCards.map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.tone}`}>{ICONS[s.icon]}</span>
            <span className="label">{s.label}</span>
            <div className={`value ${s.valueClass}`}>{s.value}</div>
            <div className="stat-complement">{s.complement}</div>
          </div>
        ))}
      </div>

      {/* Sugestão automática global — faixa discreta (sem botão falso) */}
      {stats.suggested_limit || stats.suggested_cycle ? (
        <div className="suggest-banner">
          <span className="suggest-icon">{ICONS.sparkle}</span>
          <span className="suggest-text">
            <strong>Sugestão automática:</strong>{' '}
            {stats.suggested_limit ? <>limite de <strong>{stats.suggested_limit}</strong> enviadas/dia</> : null}
            {stats.suggested_limit && stats.suggested_cycle ? ' · ' : null}
            {stats.suggested_cycle ? <>ciclo de <strong>{fmtCycle(stats.suggested_cycle)}</strong></> : null}
            {' '}— baseada nas contas saudáveis. Aplique por número no menu <strong>⋯</strong> de cada linha.
          </span>
        </div>
      ) : null}

      {/* Tabela — lista premium */}
      <div className="card">
        <div className="table-wrap">
          <table className="data-table table-plans">
            <thead>
              <tr>
                <th>Número</th>
                <th>Plano</th>
                <th>Status</th>
                <th className="num">Hoje · Enviadas</th>
                <th className="num">Hoje · Recebidas</th>
                <th className="num">Ciclos</th>
                <th>Última atividade</th>
                <th>Sugestão</th>
                <th className="actions-col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((r, i) => (
                  <tr key={r.phone_number_normalized || i}>
                    <td data-label="Número">
                      <CopyNumber phone={r.phone_number_normalized} />
                    </td>
                    <td data-label="Plano">
                      <div className="plan-cell">
                        <span className="plan-limit">{r.daily_msg_limit ?? '∞'}</span>
                        <span className="plan-cycle">{fmtCycle(r.cycle_seconds)}</span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <StatusDot row={r} />
                    </td>
                    <td className="num" data-label="Enviadas hoje">
                      {r.sent_today}
                      {r.daily_msg_limit && r.at_limit ? (
                        <span className="mini-note limit">no limite</span>
                      ) : null}
                    </td>
                    <td className="num" data-label="Recebidas hoje">{r.received_today}</td>
                    <td className="num" data-label="Ciclos">
                      {fmtCycles(r.cycles_done, r.cycle_limit)}
                      {r.at_cycle_limit ? (
                        <span className="mini-note">pausado</span>
                      ) : null}
                    </td>
                    <td data-label="Última atividade">
                      <div className="last-activity">
                        <span className="date">{fmtDate(r.last_activity_at)}</span>
                        <span className="time">{fmtTime(r.last_activity_at)}</span>
                      </div>
                    </td>
                    <td data-label="Sugestão">
                      {r.suggested_limit || r.suggested_cycle ? (
                        <span className="suggest-cell">
                          {r.suggested_limit ? <>limite <strong>{r.suggested_limit}</strong></> : null}
                          {r.suggested_limit && r.suggested_cycle ? ' · ' : null}
                          {r.suggested_cycle ? <>ciclo <strong>{fmtCycle(r.suggested_cycle)}</strong></> : null}
                        </span>
                      ) : (
                        <span className="muted suggest-empty">aguardando dados</span>
                      )}
                    </td>
                    <td className="actions-col" data-label="">
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
        <p className="muted plans-footer">
          "Enviadas hoje" = pares confirmados hoje (1 par confirmado ≈ 1 mensagem enviada e 1 recebida por lado).
          Sem plano configurado, o número fica sem limite (comportamento atual). Use <strong>⋯</strong> para
          aplicar a sugestão, editar limites ou marcar um número como banido/restrito.
        </p>
      </div>
    </>
  );
}
