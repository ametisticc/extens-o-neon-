'use client';

// ============================================================
// Botões de ação do painel de pareamento (Client Component)
// ============================================================
// Um Server Component não pode ter `onSubmit`/`confirm()` (event
// handlers) — em produção isso quebra com "An error occurred in the
// Server Components render". Este componente cliente isola os
// formulários/botões que mexem nos pares.
export default function PairingActions() {
  return (
    <div className="form-row" style={{ marginBottom: 0 }}>
      <form
        action="/admin/pairing/action"
        method="post"
        onSubmit={(e) => {
          if (!confirm('Encerrar todos os pares em que um dos números está offline? Isso destrava os chips presos e libera para formarem novos pares.')) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="action" value="release_stale" />
        <button type="submit" className="btn btn-warning btn-sm">Liberar pares travados</button>
      </form>
      <form
        action="/admin/pairing/action"
        method="post"
        onSubmit={(e) => {
          const phone = prompt('Digite o número para tirar do pareamento (com DDI, ex.: 5511958856990):');
          if (!phone) {
            e.preventDefault();
            return;
          }
          // Passa o número para o campo hidden do formulário.
          const input = e.currentTarget.querySelector('input[name="phone"]');
          input.value = phone.replace(/\D/g, '');
        }}
      >
        <input type="hidden" name="action" value="release_number" />
        <input type="hidden" name="phone" value="" />
        <button type="submit" className="btn btn-sm">Tirar número do pareamento</button>
      </form>
    </div>
  );
}
