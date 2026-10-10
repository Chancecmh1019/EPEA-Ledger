import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { User } from '../src/types.js';
import { ApiError } from './repository.js';
const name = 'epea_session';
const lifetime = 90 * 24 * 60 * 60;
const logoutName = 'epea_logged_out';
function cookie(req: Request, name: string) {
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}
export function loggedOut(req: Request) { return cookie(req, logoutName) === '1'; }
function key() {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32) throw new ApiError(503, '伺服器登入會話設定未完成');
  // Separate the session signing key from the database credential's other uses.
  return createHmac('sha256', secret).update('epea:session:v1').digest();
}
function signature(value: string) { return createHmac('sha256', key()).update(value).digest(); }
function secure(req: Request) { return req.secure || req.headers['x-forwarded-proto'] === 'https' || !!process.env.VERCEL; }
export function writeSession(req: Request, res: Response, user: User, fresh = false) {
  if (fresh) res.clearCookie(logoutName, { httpOnly: true, secure: secure(req), sameSite: 'strict', path: '/' });
  const now = Math.floor(Date.now() / 1000);
  const data = Buffer.from(JSON.stringify({ user, issued: now, expires: now + lifetime })).toString('base64url');
  res.cookie(name, data + '.' + signature(data).toString('base64url'), { httpOnly: true, secure: secure(req), sameSite: 'strict', path: '/', maxAge: lifetime * 1000 });
}
export function clearSession(req: Request, res: Response) {
  res.clearCookie(name, { httpOnly: true, secure: secure(req), sameSite: 'strict', path: '/' });
  // A late renewal response must not sign this device back in after logout.
  res.cookie(logoutName, '1', { httpOnly: true, secure: secure(req), sameSite: 'strict', path: '/', maxAge: lifetime * 1000 });
}
export function readSession(req: Request, res: Response): User | null {
  if (loggedOut(req)) return null;
  const value = cookie(req, name);
  if (!value) return null;
  try {
    const [data, signed, extra] = value.split('.');
    if (!data || !signed || extra) return null;
    const actual = Buffer.from(signed, 'base64url'), expected = signature(data);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const session = JSON.parse(Buffer.from(data, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(session.issued) || !Number.isSafeInteger(session.expires) || session.expires <= now || session.issued > now || session.expires - session.issued !== lifetime || !/^google-[0-9]+$/.test(session.user?.id) || typeof session.user?.name !== 'string') return null;
    // Renew active devices daily, rather than returning a new cookie for every request.
    if (now - session.issued >= 24 * 60 * 60) writeSession(req, res, session.user);
    return session.user;
  } catch (error) { if (error instanceof ApiError) throw error; return null; }
}
export function sameOrigin(req: Request) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, '請從本站操作');
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const host = req.headers.host;
    const url = new URL(origin);
    if (url.host !== host || url.protocol !== (secure(req) ? 'https:' : 'http:')) throw new Error();
  } catch { throw new ApiError(403, '請從本站操作'); }
}
