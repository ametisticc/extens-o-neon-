'use client';

// ============================================================
// AdminShell — shell do painel (Client Component)
// ============================================================
// Estrutura visual compartilhada por todas as páginas /admin:
//   - sidebar fixa (desktop) com logo, ícones, item ativo com glow
//   - drawer deslizante + backdrop no mobile
//   - rodapé da sidebar com "plano" (papel do operador) + usuário logado
//   - conteúdo à direita (children = Server Components)
//
// Sem bibliotecas externas: ícones SVG inline, estado local via
// useState, rota atual via usePathname (substitui o flag `exact`).
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ----------------------------- ícones ----------------------------- */
const ICON = {
  logo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  pairing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  numbers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  licenses: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H17" />
      <path d="M6 12H4a2 2 0 0 1 2-2v4a2 2 0 0 1-2-2z" />
    </svg>
  ),
  maturation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <path d="M12 1v6m0 6v6" />
      <path d="M4.22 4.22l4.24 4.24m0 5.08l-4.24 4.24" />
      <path d="M19.78 4.22l-4.24 4.24m0 5.08l4.24 4.24" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
};

/* --------------------------- navegação --------------------------- */
const NAV_GROUPS = [
  {
    label: 'Visão geral',
    items: [{ href: '/admin', label: 'Dashboard', icon: ICON.dashboard }],
  },
  {
    label: 'Maturação',
    items: [
      { href: '/admin/maturation', label: 'Controle em Tempo Real', icon: ICON.maturation },
      { href: '/admin/maturation/analytics', label: 'Analytics', icon: ICON.chart },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/admin/pairing', label: 'Pareamento', icon: ICON.pairing },
      { href: '/admin/plans', label: 'Planos', icon: ICON.plans },
      { href: '/admin/numbers', label: 'Números', icon: ICON.numbers },
      { href: '/admin/licenses', label: 'Licenças', icon: ICON.licenses },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/messages', label: 'Mensagens', icon: ICON.messages },
      { href: '/admin/logs', label: 'Logs', icon: ICON.logs },
    ],
  },
];

/* ------------------------------ shell ----------------------------- */
export default function AdminShell({ email, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href, exact) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  const initial = (email || 'O').trim().charAt(0).toUpperCase();

  return (
    <div className="admin-shell">
      {/* Topbar mobile */}
      <div className="mobile-topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
        >
          {ICON.menu}
        </button>
        <span className="mobile-brand">
          <span className="brand-mark">{ICON.logo}</span>
          Neon Warm
        </span>
      </div>

      {/* Backdrop (fecha o drawer ao clicar fora) */}
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`admin-sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">{ICON.logo}</span>
          <span>
            Neon Warm
            <small>Painel de controle</small>
          </span>
        </div>

        <nav className="admin-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${isActive(item.href, item.href === '/admin') ? ' active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-plan">
            <span className="plan-badge">Admin</span>
            <span>Operador · acesso total</span>
          </div>
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initial}</span>
            <span className="user-meta">
              <strong>{email}</strong>
              <span>Conectado agora</span>
            </span>
          </div>
          <form action="/admin/logout" method="post" className="logout-form">
            <button type="submit" className="btn btn-outline btn-sm">
              {ICON.logout}
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="admin-main">{children}</main>
    </div>
  );
}
