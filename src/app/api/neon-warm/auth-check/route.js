// ============================================================
// POST /api/neon-warm/auth-check
// ============================================================
// Teste rápido de autenticação: valida a API key + extension id
// sem depender de número/plano. Usado pelo popup da extensão
// para diagnosticar credenciais.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { jsonOk } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'auth-check');
  if (!guard.ok) return guard.response;
  return jsonOk({ ok: true, extension_id: guard.extensionId });
}
