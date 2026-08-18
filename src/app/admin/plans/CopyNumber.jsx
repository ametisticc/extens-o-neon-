'use client';

// ============================================================
// Copiar número — botão de ícone com feedback (Client)
// ============================================================
// Mostra o número limpo + um pequeno ícone de copiar (sem texto).
// Ao clicar, copia o número e troca o tooltip para "Copiado!".
// Sem bibliotecas: navigator.clipboard com fallback via execCommand.
import { useState, useRef } from 'react';

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export default function CopyNumber({ phone }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  const copy = async () => {
    const text = String(phone || '');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback (contextos sem permissão de clipboard).
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span className="phone-cell">
      <span className="phone-num">{phone}</span>
      <button
        type="button"
        className={`copy-btn${copied ? ' copied' : ''}`}
        aria-label={copied ? 'Número copiado' : 'Copiar número'}
        data-tooltip={copied ? 'Copiado!' : 'Copiar número'}
        onClick={copy}
      >
        {copied ? CHECK_ICON : COPY_ICON}
      </button>
    </span>
  );
}
