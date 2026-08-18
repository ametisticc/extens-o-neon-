import { readAdminSession } from '@/lib/admin.js';
import AdminShell from './AdminShell.jsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Layout do painel administrativo
// ============================================================
// Autentica via cookie assinado. Com sessão, renderiza o AdminShell
// (sidebar + drawer mobile + conteúdo). Sem sessão, renderiza a tela
// de login (children). IMPORTANTE: o layout raiz (src/app/layout.jsx)
// já renderiza <html> e <body> — aqui não há tags de documento.
async function AdminLayout({ children }) {
  const session = await readAdminSession();

  return session ? (
    <AdminShell email={session}>{children}</AdminShell>
  ) : (
    <div className="login-full">{children}</div>
  );
}

export default AdminLayout;
