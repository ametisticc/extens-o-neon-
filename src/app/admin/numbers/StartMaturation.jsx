'use client';

// ============================================================
// StartMaturation — Tabela "Números" com Iniciar Maturação (Client)
// ============================================================
// Renderiza a tabela inteira da tela Números (os dados vêm prontos do
// server) e adiciona: checkbox de seleção, coluna "Maturação", coluna
// "Ações" com o botão 🌡️ Iniciar, barra de seleção em massa e resumo.
//
// O botão aciona POST /admin/numbers/action, que no servidor REVALIDA
// a elegibilidade e chama a função EXISTENTE startPlanWithClient.
// Loading no botão, anti-duplo-clique, estado visual só muda com a
// resposta real do backend.
//
// NÃO altera extensão/ZIP — é apenas uma interface para o fluxo que já
// existe no backend.
import { useState, useCallback } from 'react';

const THERMO_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Tooltip legível para o motivo de não-elegível.
export function ineligibleTip(reason) {
  const map = {
    offline: 'Usuário offline',
    no_session: 'Usuário offline',
    heartbeat_stale: 'Usuário offline',
    no_heartbeat: 'Usuário offline',
    status_ended: 'Sessão encerrada',
    status_revoked: 'Sessão revogada',
    no_phone_number: 'Sessão sem número vinculado',
    number_not_active: 'Número inativo',
    blocked: 'Número bloqueado',
    banned: 'Número banido',
    restricted: 'Número restrito',
    paused: 'Maturação pausada',
    number_not_found: 'Número não encontrado',
    not_eligible: 'Número não disponível',
    start_failed: 'Não foi possível iniciar',
  };
  return map[reason] || (reason ? `Indisponível (${reason})` : 'Indisponível');
}

// Deriva o estado visual de maturação a partir da linha enriquecida.
// Precedência: penalidade > pausa > já iniciado > offline > aguardando.
export function deriveRowStatus(row) {
  if (!row) return 'waiting';
  if (row.plan_status === 'banned') return 'banned';
  if (row.plan_status === 'restricted') return 'restricted';
  if (row.plan_status === 'paused') return 'paused';
  if (row.plan_status === 'active') return 'maturing';
  if (!row.online) return 'offline';
  return 'waiting'; // online + sem plano ainda → não iniciado
}

const STATUS_META = {
  waiting: { emoji: '⏳', label: 'Não iniciado', tone: 'slate' },
  maturing: { emoji: '🌡️', label: 'Maturando', tone: 'purple' },
  active: { emoji: '🟢', label: 'Ativo', tone: 'green' },
  offline: { emoji: '⚫', label: 'Offline', tone: 'slate' },
  paused: { emoji: '💤', label: 'Pausado', tone: 'slate' },
  restricted: { emoji: '⚠️', label: 'Restrito', tone: 'amber' },
  banned: { emoji: '🚫', label: 'Banido', tone: 'red' },
};

function MaturationBadge({ row }) {
  const key = deriveRowStatus(row);
  const meta = STATUS_META[key] || STATUS_META.waiting;
  let tip = meta.label;
  if (key === 'waiting') tip = 'Online · ainda não iniciado';
  else if (key === 'offline') tip = 'Usuário offline';
  else if (key === 'maturing') {
    tip = row.daily_msg_limit ? `Maturando · limite ${row.daily_msg_limit}/dia` : 'Maturando';
  } else if (key === 'paused') {
    tip = row.paused_reason === 'daily_limit' ? 'Pausado · limite diário' : row.paused_reason === 'cycle_limit' ? 'Pausado · limite de ciclos' : 'Pausado';
  } else if (key === 'restricted' || key === 'banned') {
    tip = row.flag_reason ? `${meta.label} · ${row.flag_reason}` : meta.label;
  }
  return (
    <span className={`mat-badge ${meta.tone}`} title={tip}>
      <span className="mat-emoji" aria-hidden="true">{meta.emoji}</span>
      <span className="mat-label">{meta.label}</span>
    </span>
  );
}

function OnlineBadge({ online }) {
  return online ? (
    <span className="online-badge on" title="Usuário online">
      <span className="online-dot" aria-hidden="true" /> Online
    </span>
  ) : (
    <span className="online-badge off" title="Usuário offline">
      <span className="online-dot" aria-hidden="true" /> Offline
    </span>
  );
}

function NumberStatusBadge({ status }) {
  const map = { active: 'success', blocked: 'blocked', inactive: 'inactive', expired: 'expired' };
  return <span className={`badge ${map[status] || 'inactive'}`}>{status}</span>;
}

function StartButton({ row, busy, onStart }) {
  const canStart = row.eligible && !busy;
  const tooltip = canStart ? 'Iniciar maturação' : ineligibleTip(row.ineligible_reason || 'not_eligible');

  return (
    <button
      type="button"
      className={`btn-start ${canStart ? 'enabled' : 'disabled'}`}
      disabled={!canStart}
      onClick={(e) => {
        e.stopPropagation();
        if (canStart) onStart([row.phone_number_normalized]);
      }}
      title={tooltip}
      aria-label="Iniciar maturação"
    >
      {busy ? <span className="btn-start-spinner" aria-hidden="true" /> : THERMO_ICON}
      <span>{busy ? 'Iniciando' : 'Iniciar'}</span>
    </button>
  );
}

function Checkbox({ row, checked, onToggle }) {
  return (
    <label className="sel-check" title={row.eligible ? 'Selecionar' : 'Não disponível para iniciar'}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!row.eligible}
        onChange={(e) => {
          e.stopPropagation();
          onToggle(row.phone_number_normalized, e.target.checked);
        }}
      />
      <span className="sel-box" aria-hidden="true">{checked ? CHECK_ICON : null}</span>
    </label>
  );
}

function fmtCycle(seconds) {
  if (!seconds) return '—';
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

function fmtCycles(done, limit) {
  if (!limit) return done ? `${done} feito` : '—';
  return `${done} / ${limit}`;
}

export default function StartMaturation({ rows = [] }) {
  const [selected, setSelected] = useState(() => new Set());
  const [busyPhones, setBusyPhones] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [result, setResult] = useState(null); // { type:'success'|'error', message }
  const [dismissed, setDismissed] = useState(false);

  const eligibleCount = rows.filter((r) => r.eligible).length;
  const selectedEligible = [...selected].filter((p) => rows.find((r) => r.phone_number_normalized === p)?.eligible);
  const allSelected = eligibleCount > 0 && selectedEligible.length === eligibleCount;
  const anySelected = selectedEligible.length > 0;

  const toggle = useCallback((phone, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(phone);
      else next.delete(phone);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const r of rows) if (r.eligible) next.delete(r.phone_number_normalized);
      } else {
        for (const r of rows) if (r.eligible) next.add(r.phone_number_normalized);
      }
      return next;
    });
  }, [rows, allSelected]);

  const runStart = useCallback(async (phones) => {
    setResult(null);
    setDismissed(false);
    setBusyPhones((prev) => new Set([...prev, ...phones]));
    if (phones.length > 1) setBulkBusy(true);

    try {
      const res = await fetch('/admin/numbers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.ok !== true) {
        setResult({ type: 'error', message: data?.error || 'Não foi possível iniciar a maturação.' });
        return;
      }

      const started = data.started || [];
      const skipped = data.skipped || [];

      // Remove da seleção os que foram iniciados (os não disponíveis saem também:
      // já foram contabilizados no resumo).
      setSelected((prev) => {
        const next = new Set(prev);
        for (const s of started) next.delete(s.phone);
        for (const s of skipped) next.delete(s.phone);
        return next;
      });

      if (phones.length === 1) {
        if (started.length === 1) {
          setResult({ type: 'success', message: 'Maturação iniciada.' });
        } else {
          const reason = skipped[0]?.reason || 'indisponível';
          setResult({ type: 'error', message: `Não foi possível iniciar a maturação (${ineligibleTip(reason)}).` });
        }
      } else {
        const notEligible = skipped.length;
        if (started.length > 0 && notEligible > 0) {
          setResult({
            type: 'success',
            message: `${started.length} números elegíveis para iniciar. ${notEligible} números não estão disponíveis.`,
          });
        } else if (started.length > 0) {
          setResult({ type: 'success', message: `${started.length} números iniciados.` });
        } else {
          setResult({
            type: 'error',
            message: notEligible > 0 ? `${notEligible} números não estão disponíveis.` : 'Nenhum número foi iniciado.',
          });
        }
      }
    } catch {
      setResult({ type: 'error', message: 'Não foi possível iniciar a maturação.' });
    } finally {
      setBusyPhones((prev) => {
        const next = new Set(prev);
        for (const p of phones) next.delete(p);
        return next;
      });
      setBulkBusy(false);
    }
  }, []);

  return (
    <div className="numbers-table-wrap">
      {/* Barra de seleção em massa */}
      {anySelected && (
        <div className="mass-bar">
          <label className="sel-check mass-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="sel-box" aria-hidden="true">{allSelected ? CHECK_ICON : null}</span>
          </label>
          <span className="mass-count">
            {selectedEligible.length} selecionado{selectedEligible.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="btn-mass"
            disabled={bulkBusy || selectedEligible.length === 0}
            onClick={() => runStart(selectedEligible)}
          >
            {bulkBusy ? <span className="btn-start-spinner" aria-hidden="true" /> : THERMO_ICON}
            <span>{bulkBusy ? 'Iniciando…' : 'Iniciar maturação selecionados'}</span>
          </button>
          <button type="button" className="mass-clear" onClick={() => setSelected(new Set())} title="Limpar seleção">
            ✕
          </button>
        </div>
      )}

      {/* Feedback do resultado */}
      {result && !dismissed && (
        <div className={`mass-result ${result.type}`}>
          <span>{result.message}</span>
          <button type="button" className="mass-result-close" onClick={() => setDismissed(true)} aria-label="Fechar">✕</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table table-numbers">
          <thead>
            <tr>
              <th className="th-check">
                <label className="sel-check mass-select-all" title="Selecionar todos elegíveis">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span className="sel-box" aria-hidden="true">{allSelected ? CHECK_ICON : null}</span>
                </label>
              </th>
              <th>Cliente</th>
              <th>Número</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Maturação</th>
              <th>Vencimento</th>
              <th>Última atividade</th>
              <th>Dispositivos</th>
              <th className="actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => {
                const phone = row.phone_number_normalized;
                const busy = busyPhones.has(phone);
                const checked = selected.has(phone);
                return (
                  <tr key={phone}>
                    <td className="td-check" data-label="">
                      <Checkbox row={row} checked={checked} onToggle={toggle} />
                    </td>
                    <td data-label="Cliente">{row.user_name || '—'}</td>
                    <td className="mono" data-label="Número">{row.phone_number}</td>
                    <td data-label="Plano">
                      {row.has_plan ? (
                        <span className="num-plan">
                          <span className="plan-limit">{row.daily_msg_limit ?? '∞'}</span>
                          <span className="plan-cycle">{fmtCycle(row.cycle_seconds)}</span>
                          {row.cycle_limit ? (
                            <span className="plan-cycles">{fmtCycles(row.cycles_done, row.cycle_limit)}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <OnlineBadge online={row.online} />
                    </td>
                    <td data-label="Maturação">
                      <MaturationBadge row={row} />
                    </td>
                    <td data-label="Vencimento">
                      <span className="muted">—</span>
                    </td>
                    <td data-label="Última atividade">{row.last_activity || '—'}</td>
                    <td data-label="Dispositivos">{row.device_count}</td>
                    <td className="actions-col" data-label="Ações">
                      <StartButton row={row} busy={busy} onStart={runStart} />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="empty">Nenhum número cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
