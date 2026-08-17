'use client';

// ============================================================
// Botão "Excluir" de mensagem (Client Component)
// ============================================================
// O `onSubmit` com `confirm()` é um event handler, que NÃO pode
// existir num Server Component (Next.js App Router) — isso lança
// "An error occurred in the Server Components render" em produção.
// Este componente cliente isola o handler e mantém o resto da
// página como Server Component.
export default function MessageDeleteButton({ messageId }) {
  return (
    <form
      action="/admin/messages/action"
      method="post"
      onSubmit={(e) => {
        if (!confirm('Excluir esta mensagem? A extensão para de usar imediatamente (após a próxima sincronização).')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={messageId} />
      <input type="hidden" name="action" value="delete" />
      <button type="submit" className="btn btn-sm btn-danger">
        Excluir
      </button>
    </form>
  );
}
