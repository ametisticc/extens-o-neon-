import { readAdminSession } from '@/lib/admin.js';
import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function AdminLayout({ children }) {
  const session = await readAdminSession();

  const nav = [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/numbers', label: 'Números', exact: false },
    { href: '/admin/licenses', label: 'Licenças', exact: false },
    { href: '/admin/logs', label: 'Logs', exact: false },
  ];

  // IMPORTANTE: o layout raiz (src/app/layout.jsx) já renderiza <html> e <body>.
  // Aqui só renderizamos o conteúdo, sem tags de documento duplicadas.
  return session ? (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">Neon Warm</div>
        <nav className="admin-nav">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/logout" method="post" className="logout-form">
          <button type="submit" className="btn btn-outline btn-sm">
            Sair
          </button>
        </form>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  ) : (
    <div className="login-full">{children}</div>
  );
}

export default AdminLayout;
