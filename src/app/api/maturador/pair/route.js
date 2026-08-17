// ============================================================
// POST /api/maturador/pair
// ============================================================
// Compatibilidade com o fluxo legado da extensão (content script
// faz chamada direta da página do WhatsApp Web). O serviço de
// pareamento completo ainda não foi implementado no Neon Warm —
// este stub responde "sem par disponível" para o ciclo ficar em
// espera graciosa (sem quebrar a extensão com 404).
import { jsonOk, readJsonBody } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await readJsonBody(request);
  const chipId = body?.chipId || body?.chip_id || null;

  // Registro leve no log para sabermos quantos chips estão tentando parear
  if (chipId) {
    await logEvent({
      eventType: 'pair_request_legacy',
      metadata: { chip_id: chipId },
    }).catch(() => {});
  }

  return jsonOk({ code: 0, pairWith: null, message: 'sem_par_disponivel' });
}
