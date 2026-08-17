// ============================================================
// POST /api/maturador/validate
// ============================================================
// Compatibilidade com o fluxo legado da extensão. O content script
// chama este endpoint após o "pair" para saber se o par confirmou.
// Como o pareamento ainda não está implementado, responde que não
// há par confirmado — a extensão re-tenta em alguns segundos.
import { jsonOk, readJsonBody } from '@/lib/http.js';
import { logEvent } from '@/lib/logger.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await readJsonBody(request);
  const chipId = body?.chipId || body?.chip_id || null;

  if (chipId) {
    await logEvent({
      eventType: 'validate_pair_legacy',
      metadata: { chip_id: chipId },
    }).catch(() => {});
  }

  return jsonOk({ code: 0, ambosConfirmados: false, pairWith: null });
}
