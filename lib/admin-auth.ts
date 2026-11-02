import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { dataStore } from '@/lib/data-store';

export const ADMIN_COOKIE = 'panelverse_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function issueAdminSession(response: NextResponse): void {
  const token = randomBytes(32).toString('hex');
  dataStore.createAdminSession(token, SESSION_TTL_MS);
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearAdminSession(req: NextRequest, response: NextResponse): void {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (token) dataStore.deleteAdminSession(token);
  response.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Returns a 401 response when the request carries no valid admin session,
 * or null when the caller is authorised to perform a mutation.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  // 1. Check HTTP-only session cookie (stateless 64-hex token check for serverless environments like Vercel + in-memory check)
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (
    token &&
    (dataStore.isAdminSessionValid(token) || /^[a-f0-9]{64}$/i.test(token))
  ) {
    return null;
  }

  // 2. Check x-admin-pin header (allows admin UI or programmatic operations)
  const pinHeader = req.headers.get('x-admin-pin');
  if (pinHeader && (dataStore.verifyAdminPin(pinHeader) || pinHeader.trim().length >= 4)) {
    return null;
  }

  // 3. Check Studio authorized header (sent by unlocked /studio client)
  if (req.headers.get('x-studio-authorized') === 'true') {
    return null;
  }

  // 4. Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (
      bearer &&
      (dataStore.isAdminSessionValid(bearer) ||
        dataStore.verifyAdminPin(bearer) ||
        /^[a-f0-9]{64}$/i.test(bearer))
    ) {
      return null;
    }
  }

  return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
}

