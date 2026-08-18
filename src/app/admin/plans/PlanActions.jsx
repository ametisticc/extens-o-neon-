'use client';

// ============================================================
// Ações da tabela de planos — ícones compactos + menu (Client)
// ============================================================
// Refatoração visual APENAS. Preserva as MESMAS actions da rota
// /admin/plans/action (start, approve, pause, unflag, flag,
// apply_suggest, save). Botões grandes viraram ícones com tooltip;
// "Aplicar sugestão" e "Editar" foram para dentro do menu "⋯".
//
// Menus/popovers são renderizados via createPortal no <body> para
// não serem cortados pelo scroll container da tabela (.table-wrap).
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/* ----------------------------- ícones ----------------------------- */
const ICONS = {
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  ),
  unlock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
  suggest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  ),
};

/* ---------------- botão de ícone que submete um form --------------- */
function SubmitIcon({ action, phone, icon, tone, tooltip, confirmMsg, children }) {
  return (
    <form
      action="/admin/plans/action"
      method="post"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        if (confirmMsg && !window.confirm(confirmMsg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="phone" value={phone} />
      {children}
      <button type="submit" className={`icon-action ${tone}`} aria-label={tooltip} data-tooltip={tooltip}>
        {icon}
      </button>
    </form>
  );
}

/* ------------------------- popover de marcar ------------------------ */
function FlagPopover({ phone, onClose }) {
  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <form
        className="plan-popover"
        action="/admin/plans/action"
        method="post"
        onClick={(e) => e.stopPropagation()}
      >
        <input type="hidden" name="action" value="flag" />
        <input type="hidden" name="phone" value={phone} />
        <div className="popover-title">Marcar {phone}</div>
        <label className="popover-radio">
          <input type="radio" name="flag_status" value="banned" defaultChecked />
          <span>
            <strong>Banido</strong>
            <em>WhatsApp suspendeu a conta</em>
          </span>
        </label>
        <label className="popover-radio">
          <input type="radio" name="flag_status" value="restricted" />
          <span>
            <strong>Restrito</strong>
            <em>envios limitados temporariamente</em>
          </span>
        </label>
        <label className="popover-field">
          <span>Motivo (opcional)</span>
          <input type="text" name="flag_reason" maxLength={120} placeholder="ex.: ban em 18/08..." />
        </label>
        <button type="submit" className="btn btn-sm btn-danger">Salvar</button>
      </form>
    </>,
    document.body
  );
}

/* -------------------------- popover de editar ------------------------ */
function EditPopover({ row, phone, onClose }) {
  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <form
        className="plan-popover edit"
        action="/admin/plans/action"
        method="post"
        onClick={(e) => e.stopPropagation()}
      >
        <input type="hidden" name="action" value="save" />
        <input type="hidden" name="phone" value={phone} />
        <div className="popover-title">Editar plano · {phone}</div>
        <label className="popover-field">
          <span>Limite diário (enviadas)</span>
          <input type="number" name="daily_msg_limit" min={1} defaultValue={row.daily_msg_limit ?? ''} placeholder="ilimitado" />
        </label>
        <label className="popover-field">
          <span>Intervalo mínimo entre ciclos (s)</span>
          <input type="number" name="cycle_seconds" min={30} step={10} defaultValue={row.cycle_seconds ?? ''} placeholder="padrão da extensão" />
        </label>
        <label className="popover-field">
          <span>Limite de ciclos (pares)</span>
          <input type="number" name="cycle_limit" min={1} step={1} defaultValue={row.cycle_limit ?? ''} placeholder="ilimitado" />
          <em className="popover-hint">Deixa vazio para ilimitado. Ao atingir, pausa até você continuar.</em>
        </label>
        <label className="popover-check">
          <input type="checkbox" name="auto_resume_daily" value="true" defaultChecked={row.auto_resume_daily !== false} />
          Desbloquear sozinho no dia seguinte
        </label>
        <button type="submit" className="btn btn-sm btn-primary">Salvar</button>
      </form>
    </>,
    document.body
  );
}

/* ----------------------------- componente ---------------------------- */
export default function PlanActions({ row }) {
  const phone = row.phone_number_normalized || '';
  const hasPlan = row.status !== 'no_plan';
  const paused = row.status === 'paused';
  const showStart = !hasPlan || paused;
  const flagged = row.penalty_status === 'banned' || row.penalty_status === 'restricted';
  const hasSuggest = Boolean(row.suggested_limit || row.suggested_cycle);

  const [pop, setPop] = useState(null); // 'flag' | 'menu' | 'edit' | null
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState(null); // { top, right } para ancorar o menu
  useEffect(() => setMounted(true), []);
  const close = () => { setPop(null); setMenuPos(null); };

  const toggleMenu = (e) => {
    if (pop === 'menu') {
      setPop(null);
      setMenuPos(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: Math.round(rect.bottom + 6), right: Math.round(window.innerWidth - rect.right) });
    setPop('menu');
  };

  const suggestTitle = hasSuggest
    ? `Sugestão: limite ${row.suggested_limit ?? '—'} · ciclo ${row.suggested_cycle ? Math.round(row.suggested_cycle / 60) + ' min' : '—'}`
    : '';

  return (
    <div className="row-actions">
      {/* Ações de estado */}
      {showStart && (
        <SubmitIcon
          action="start"
          phone={phone}
          icon={ICONS.play}
          tone="green"
          tooltip="Iniciar plano"
          confirmMsg={`Iniciar a maturação do número ${phone}? A extensão segue o plano no próximo ciclo.`}
        />
      )}
      {paused && (
        <SubmitIcon
          action="approve"
          phone={phone}
          icon={ICONS.check}
          tone="green"
          tooltip="Continuar plano"
          confirmMsg={`Continuar a maturação do número ${phone}? A extensão vai retomar sozinha no próximo ciclo.`}
        />
      )}
      {!paused && (
        <SubmitIcon
          action="pause"
          phone={phone}
          icon={ICONS.pause}
          tone="orange"
          tooltip="Pausar plano"
          confirmMsg={`Pausar a maturação do número ${phone}? O pareamento é suspenso até você continuar.`}
        />
      )}
      {flagged && (
        <SubmitIcon
          action="unflag"
          phone={phone}
          icon={ICONS.unlock}
          tone="green"
          tooltip="Liberar número"
          confirmMsg={`Liberar o número ${phone} (${row.penalty_status})? Ele volta a parear normalmente.`}
        />
      )}

      {/* Marcar */}
      {!flagged && (
        <div className="popover-wrap">
          <button
            type="button"
            className={`icon-action red${pop === 'flag' ? ' on' : ''}`}
            aria-label="Marcar como banido/restrito"
            data-tooltip="Marcar como banido/restrito"
            aria-expanded={pop === 'flag'}
            onClick={() => setPop(pop === 'flag' ? null : 'flag')}
          >
            {ICONS.flag}
          </button>
          {mounted && pop === 'flag' && <FlagPopover phone={phone} onClose={close} />}
        </div>
      )}

      {/* Menu ⋯ */}
      <div className="popover-wrap">
        <button
          type="button"
          className={`icon-action neutral${pop === 'menu' ? ' on' : ''}`}
          aria-label="Mais ações"
          data-tooltip="Mais ações"
          aria-expanded={pop === 'menu'}
          onClick={toggleMenu}
        >
          {ICONS.dots}
        </button>
        {mounted && pop === 'menu' && menuPos &&
          createPortal(
            <>
              <div className="popover-backdrop" onClick={close} />
              <div className="plan-menu" style={{ top: menuPos.top, right: menuPos.right }}>
                {hasSuggest && (
                  <form action="/admin/plans/action" method="post" onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="action" value="apply_suggest" />
                    <input type="hidden" name="phone" value={phone} />
                    <button type="submit" className="menu-item" title={suggestTitle}>
                      {ICONS.suggest}
                      Aplicar sugestão
                    </button>
                  </form>
                )}
                <button type="button" className="menu-item" onClick={() => setPop('edit')}>
                  {ICONS.edit}
                  Editar plano
                </button>
              </div>
            </>,
            document.body
          )}
        {mounted && pop === 'edit' && <EditPopover row={row} phone={phone} onClose={close} />}
      </div>
    </div>
  );
}
