'use client';

// ============================================================
// Error boundary do painel admin
// ============================================================
// Quando uma página do painel (server component) lança uma exceção
// durante o render, o Next.js busca o `error.jsx` mais próximo e
// renderiza este componente NO LUGAR do "Application error" genérico
// da Vercel. Ele mostra o `error.message` real (sem stack), para o
// operador conseguir reportar a causa com precisão.
//
// IMPORTANTE: este é um Client Component, então NUNCA imprima aqui
// dados sensíveis (service role, tokens, chaves). Apenas a mensagem
// do erro, que já é tratada como informação de diagnóstico.
export default function AdminError({ error, reset }) {
  const message = error?.message || String(error || 'Erro desconhecido');
  return (
    <div className="admin-error">
      <h2>Erro ao carregar a página</h2>
      <p className="muted">Ocorreu uma exceção ao renderizar este painel.</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
        {message}
      </pre>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => reset()}>
          Tentar novamente
        </button>
        <a href="/admin" className="btn btn-outline">
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
