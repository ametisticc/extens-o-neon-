import { NextResponse } from 'next/server';

// Middleware global: aplica CORS básico em /api/* e bloca OPTIONS
// sem passar pelos route handlers. A autorização em si acontece
// dentro de cada rota (a extensão é cliente não confiável — validar no servidor).
export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const allowedOriginsRaw = process.env.NEON_WARM_ALLOWED_ORIGIN || '';
  const allowedOrigins = allowedOriginsRaw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const origin = request.headers.get('origin');

  const isAllowed = origin ? allowedOrigins.includes(origin) : false;

  if (request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowed) {
      res.headers.set('Access-Control-Allow-Origin', origin);
      res.headers.set('Vary', 'Origin');
      res.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-NeonWarm-Key, X-NeonWarm-Extension, X-NeonWarm-Device');
      res.headers.set('Access-Control-Max-Age', '86400');
    }
    return res;
  }

  if (origin && !isAllowed) {
    return NextResponse.json(
      { authorized: false, status: 'unauthorized', reason: 'origin_not_allowed', message: 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  const response = NextResponse.next();
  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-NeonWarm-Key, X-NeonWarm-Extension, X-NeonWarm-Device');
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
