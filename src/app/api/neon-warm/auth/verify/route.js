// ============================================================
// POST /api/neon-warm/auth/verify
// ============================================================
// Valida um Bearer token. Endpoint de teste/diagnóstico.
// Retorna informações públicas sobre o token.

import { guardBearerRoute } from '@/lib/api-guard-bearer.js';
import { jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await guardBearerRoute(request, 'auth_verify');
  if (!guard.ok) return guard.response;

  const token = guard.tokenRecord;
  
  return jsonOk({
    ok: true,
    message: 'Bearer token válido',
    token_info: {
      extension_id: token.extension_id,
      device_id: token.device_id,
      created_at: token.created_at,
      expires_at: token.expires_at,
      last_used_at: token.last_used_at,
    },
  });
}
