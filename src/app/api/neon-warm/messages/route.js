// ============================================================
// POST /api/neon-warm/messages
// ============================================================
// Banco de mensagens do Neon Dev: devolve as frases ativas para a
// extensão montar a próxima mensagem (rotas de mensagens).
//
// Autenticação: mesma das demais rotas da extensão
//   (guardExtensionRoute: X-NeonWarm-Key + X-NeonWarm-Extension).
// A resposta é limitada (até 200 frases) e NUNCA expõe dados de
// cliente — apenas texto + categoria.
//
// A extensão usa este retorno apenas como REFORÇO às frases que já
// tem embutidas: se a API falhar, a maturação continua funcionando
// com o conteúdo local (fallback). Por isso este endpoint é "leve"
// e sem estado.
import { guardExtensionRoute } from '@/lib/api-guard.js';
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';
import { readJsonBody, jsonOk, jsonError } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 200;

export async function POST(request) {
  const guard = await guardExtensionRoute(request, 'neon_warm_messages');
  if (!guard.ok) return guard.response;

  // Aceita um corpo (pode vir vazio). Não exigimos nada além da autenticação.
  await readJsonBody(request);

  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from(DB.MESSAGES)
    .select('id, category, text, priority')
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error('[messages] erro ao buscar mensagens:', error.message);
    return jsonError('Erro ao carregar mensagens.', 500, { reason: 'internal_error' });
  }

  return jsonOk({
    ok: true,
    count: rows?.length ?? 0,
    messages: rows ?? [],
    cached_for: 3600, // segundos — a extensão pode cachear por 1h
  });
}
