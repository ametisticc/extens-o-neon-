'use client';

// ============================================================
// Botão "Zerar dispositivos" (Client Component)
// ============================================================
// O `onSubmit` com `confirm()` é um event handler, que NÃO pode
// existir num Server Component (Next.js App Router) — isso lança
// "An error occurred in the Server Components render" em produção.
// Este componente cliente isola o handler e mantém o resto da
// página como Server Component.
export default function ResetDevicesButton({ licenseId }) {
  return (
    <form
      action="/admin/licenses/action"
      method="post"
      onSubmit={(e) => {
        if (!confirm('Zerar dispositivos desta licença? Isso encerra sessões ativas e libera o limite do plano.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={licenseId} />
      <input type="hidden" name="action" value="reset_devices" />
      <button type="submit" className="btn btn-sm btn-warning" title="Zerar dispositivos (limite do plano)">
        Zerar dispositivos
      </button>
    </form>
  );
}
