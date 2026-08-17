// ============================================================
// GET /api/maturador/debug
// ============================================================
// Endpoint de DIAGNÓSTICO TEMPORÁRIO (seção 10 do pedido).
//
// PROTEGIDO: exige o header X-NeonWarm-Debug-Key com a mesma chave
// do painel admin (NEON_WARM_ADMIN_PASSWORD), ou um cookie de sessão
// admin válido. NÃO expõe dados de clientes — apenas telefones
// mascarados, flags técnicas e contagens.
//
// Retorna:
//   {
//     ok: true,
//     time,
//     windows: { presence_ms },
//     summary: { sessions_total, sessions_active, sessions_online,
//                eligible, pairs_active },
//     sessions: [ { phone_masked, status, heartbeat_recent, eligible } ],
//     pairs: [ { a_masked, b_masked, status, updated_at } ]
//   }
//
// Para desabilitar: set NEON_WARM_DEBUG=0 (ou remova o arquivo).
import { getSupabaseAdmin, DB } from '@/lib/supabase.js';
import { isSessionOnline, presenceWindowMs } from '@/lib/pairing-presence.js';
import { hmacHex, safeEqual } from '@/lib/crypto.js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  if (s.length < 8) return s.slice(0, 2) + '***';
  return s.slice(0, 4) + '****' + s.slice(-2);
}

function isDebugEnabled() {
  const raw = process.env.NEON_WARM_DEBUG;
  if (raw === undefined || raw === '') return true; // ligado por padrão (temporário)
  return !['0', 'false', 'off', 'no'].includes(String(raw).toLowerCase());
}

function isDebugKeyConfigured() {
  return Boolean(process.env.NEON_WARM_ADMIN_PASSWORD && process.env.NEON_WARM_ADMIN_SECRET);
}

function validDebugKey(req) {
  if (!isDebugKeyConfigured()) return false;
  const header = req.headers.get('x-neonwarm-debug-key');
  if (!header) return false;
  const expected = process.env.NEON_WARM_ADMIN_PASSWORD;
  return safeEqual(header.trim(), expected);
}

async function validAdminCookie() {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get('neon_warm_admin')?.value;
    if (!value) return false;
    const parts = value.split('.');
    if (parts.length !== 2) return false;
    const [payload, sig] = parts;
    const expectedSig = hmacHex(process.env.NEON_WARM_ADMIN_SECRET || '', payload);
    if (!safeEqual(sig, expectedSig)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!isDebugEnabled()) {
    return Response.json({ ok: false, reason: 'debug_disabled' }, { status: 404 });
  }

  const authed =
    validDebugKey(request) ||
    (process.env.NEON_WARM_ADMIN_SECRET ? await validAdminCookie() : false);

  if (!authed) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - presenceWindowMs()).toISOString();

    const [sessionsRes, pairsRes, numbersRes] = await Promise.all([
      getSupabaseAdmin()
        .from(DB.SESSIONS)
        .select('id, phone_number_id, device_id, status, last_heartbeat_at, ended_at'),
      getSupabaseAdmin()
        .from(DB.PAIRS)
        .select('chip_a, chip_b, status, updated_at')
        .in('status', ['waiting', 'paired', 'confirmed'])
        .order('updated_at', { ascending: false })
        .limit(50),
      getSupabaseAdmin()
        .from(DB.NUMBERS)
        .select('id, phone_number_normalized, status, pairing_enabled'),
    ]);

    const sessions = sessionsRes.data || [];
    const pairs = pairsRes.data || [];
    const numbers = numbersRes.data || [];

    const numById = new Map(numbers.map((n) => [n.id, n]));

    let sessionsOnline = 0;
    let eligible = 0;
    const sessionList = sessions.map((s) => {
      const onlineCheck = isSessionOnline(s);
      const num = numById.get(s.phone_number_id);
      const eligibleFlag =
        onlineCheck.online === true &&
        num?.status === 'active' &&
        num?.pairing_enabled !== false;
      if (onlineCheck.online) sessionsOnline += 1;
      if (eligibleFlag) eligible += 1;
      return {
        phone_masked: maskPhone(num?.phone_number_normalized ?? s.phone_number_id),
        status: s.status,
        heartbeat_recent: onlineCheck.online,
        online_reason: onlineCheck.reason,
        eligible: eligibleFlag,
        has_phone: Boolean(num?.phone_number_normalized),
      };
    });

    const pairList = pairs.map((p) => ({
      a_masked: maskPhone(p.chip_a),
      b_masked: maskPhone(p.chip_b),
      status: p.status,
      updated_at: p.updated_at,
    }));

    const sessionsActive = sessions.filter((s) => s.status === 'active').length;

    return Response.json({
      ok: true,
      time: new Date().toISOString(),
      windows: { presence_ms: presenceWindowMs() },
      summary: {
        sessions_total: sessions.length,
        sessions_active: sessionsActive,
        sessions_online: sessionsOnline,
        eligible,
        pairs_active: pairs.length,
      },
      sessions: sessionList,
      pairs: pairList,
    });
  } catch (err) {
    console.error('[maturador/debug] erro:', err.message);
    return Response.json({ ok: false, reason: 'internal_error', message: 'Erro interno.' }, { status: 500 });
  }
}
