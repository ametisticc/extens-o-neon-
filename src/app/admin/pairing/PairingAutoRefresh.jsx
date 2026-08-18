'use client';

// ============================================================
// Auto-refresh do painel de pareamento (Client Component)
// ============================================================
// Um Server Component não pode ter `setInterval`/`onClick` (event
// handlers). Este componente cliente isola a lógica de atualizar a
// página a cada N segundos, mantendo a tabela como Server Component.
// `router.refresh()` re-renderiza os Server Components e busca dados
// novos (a página é force-dynamic) SEM recarregar a página inteira —
// sem perder o scroll, sem piscar.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PairingAutoRefresh({ seconds = 10 }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [seconds, router]);

  return null;
}
