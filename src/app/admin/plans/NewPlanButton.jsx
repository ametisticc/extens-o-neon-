'use client';

// ============================================================
// "+ Novo plano" — abre um popover que inicia a maturação (Client)
// ============================================================
// Cria um plano para um número conectado usando a MESMA rota/action
// já existente (POST /admin/plans/action, action=start), que cria o
// plano e ativa a maturação. O botão fica compacto no header.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const PLUS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function NewPlanButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="popover-wrap">
      <button type="button" className="btn btn-outline btn-new-plan" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {PLUS_ICON}
        Novo plano
      </button>

      {mounted && open &&
        createPortal(
          <>
            <div className="popover-backdrop" onClick={() => setOpen(false)} />
            <form
              className="plan-popover"
              action="/admin/plans/action"
              method="post"
              onClick={(e) => e.stopPropagation()}
            >
              <input type="hidden" name="action" value="start" />
              <div className="popover-title">Iniciar maturação</div>
              <label className="popover-field">
                <span>Número conectado (com DDI e DDD)</span>
                <input
                  type="tel"
                  name="phone"
                  required
                  autoFocus
                  inputMode="tel"
                  placeholder="+55 (11) 95555-5566"
                />
                <em className="popover-hint">
                  Cria um plano ativo para este número (sem limites). Depois use "Editar" para definir
                  limite diário e intervalo de ciclo.
                </em>
              </label>
              <button type="submit" className="btn btn-sm btn-primary">Iniciar</button>
            </form>
          </>,
          document.body
        )}
    </div>
  );
}
