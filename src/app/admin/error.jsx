'use client';

// ============================================================
// Error boundary do painel admin
// ============================================================
// Quando uma página do painel (server component) lança uma exceção
// durante o render, o Next.js busca o `error.jsx` mais próximo e
// renderiza este componente NO LUGAR do "Application error" genérico
// da Vercel.
//
// IMPORTANTE: este é um Client Component, então NUNCA imprima aqui
// dados sensíveis (service role, tokens, chaves). O `error.digest`
// é um hash opaco que serve para correlacionar com os logs da Vercel.
export default function AdminError({ error, reset }) {
  const digest = error?.digest ? `Digest: ${error.digest}` : '';
  return (
    <div className="admin-error">
      <h2>Erro ao carregar a página</h2>
      <p className="muted">
        Ocorreu uma exceção ao renderizar este painel. {digest}
      </p>
      <p className="muted" style={{ fontSize: 13 }}>
        Para ver a causa exata, abra <strong>/admin/diagnose</strong> (rota de
        diagnóstico que repete as consultas do painel e mostra o erro real do
        banco), ou confira os logs do deploy na Vercel usando o digest acima.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => reset()}>
          Tentar novamente
        </button>
        <a href="/admin/diagnose" className="btn btn-outline">
          Abrir diagnóstico
        </a>
        <a href="/admin" className="btn btn-outline">
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
