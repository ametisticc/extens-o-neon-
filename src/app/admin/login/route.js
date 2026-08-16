import { verifyAdminCredentials, createAdminCookie, isAdminConfigured, COOKIE_NAME } from '@/lib/admin.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const ok = verifyAdminCredentials(email, password);
  const cookieValue = ok ? createAdminCookie(email) : null;

  if (!ok || !cookieValue) {
    redirect('/admin?error=invalid');
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60,
  });

  redirect('/admin');
}
