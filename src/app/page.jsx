import Link from 'next/link';

export const runtime = 'nodejs';

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f9', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 12, border: '1px solid #e3e6ea', maxWidth: 480 }}>
        <h1 style={{ marginTop: 0, color: '#6d28d9' }}>Neon Warm API</h1>
        <p style={{ color: '#64748b' }}>
          Backend de validação de licença para a extensão Chrome Neon Warm.
        </p>
        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/admin" style={{ padding: '10px 18px', background: '#6d28d9', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
            Painel administrativo
          </Link>
          <Link href="/api/neon-warm/health" style={{ padding: '10px 18px', background: '#fff', color: '#1a202c', borderRadius: 8, textDecoration: 'none', fontWeight: 600, border: '1px solid #e3e6ea' }}>
            Health check
          </Link>
        </div>
        <p className="muted" style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>
          Documentação completa no README do projeto.
        </p>
      </div>
    </main>
  );
}
