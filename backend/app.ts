import express, { type Request, type Response, type NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { validateRecord } from '../src/domain/ledger';
import { ApiError, configuredRepository, type Repository } from './repository';
import type { User } from '../src/types';
export type Verify = (token: string) => Promise<User>;
const oauth = new OAuth2Client();
export async function verifyGoogle(token: string): Promise<User> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new ApiError(503, '伺服器登入設定未完成');
  try {
    const payload = (await oauth.verifyIdToken({ idToken: token, audience })).getPayload();
    if (!payload?.sub || !payload.email_verified) throw new Error('Invalid identity');
    return { id: 'google-' + payload.sub, name: payload.name ?? '時光旅人', email: payload.email, picture: payload.picture };
  } catch { throw new ApiError(401, '登入已過期，請重新登入'); }
}
export function createApi(options: { repository?: Repository | null; verify?: Verify } = {}) {
  const app = express();
  const repo = options.repository === undefined ? configuredRepository() : options.repository;
  const verify = options.verify ?? verifyGoogle;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }); next(); });
  app.get('/api/health', (_req, res) => res.status(repo ? 200 : 503).json({ configured: !!repo, persistence: 'supabase', schemaVerified: false }));
  const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new ApiError(401, '請登入');
      res.locals.user = await verify(token);
      next();
    } catch (error) { next(error); }
  };
  app.get('/api/auth/me', auth, (_req, res) => res.json(res.locals.user));
  app.use('/api', auth, (_req, _res, next) => repo ? next() : next(new ApiError(503, 'Supabase 尚未設定，不會回報雲端儲存成功')));
  app.get('/api/records', async (_req, res) => res.json(await repo!.snapshot(res.locals.user.id)));
  app.get('/api/records/:id/history', async (req, res) => res.json(await repo!.history(res.locals.user.id, String(req.params.id))));
  function version(req: Request) { const v = Number(req.headers['if-match']); if (!Number.isSafeInteger(v) || v < 1) throw new ApiError(428, '需提供原始版本 If-Match'); return v; }
  function record(req: Request, res: Response) {
    if (req.body?.user_id && req.body.user_id !== res.locals.user.id) throw new ApiError(403, '不能操作其他帳戶');
    try { return validateRecord({ ...req.body, user_id: res.locals.user.id, id: req.params.id ?? req.body?.id }); }
    catch (error) { throw new ApiError(400, (error as Error).message); }
  }
  app.post('/api/records', async (req, res) => res.status(201).json(await repo!.create(res.locals.user.id, record(req, res))));
  app.put('/api/records/:id', async (req, res) => res.json(await repo!.update(res.locals.user.id, record(req, res), version(req))));
  app.delete('/api/records/:id', async (req, res) => { await repo!.remove(res.locals.user.id, String(req.params.id), version(req)); res.status(204).end(); });
  app.post('/api/auth/init-history', (_req, res) => res.status(409).json({ error: '舊資料匯入需先備份與人工對帳，不會自動匯入' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: '端點不存在' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: error instanceof ApiError ? error.message : status === 400 ? 'JSON 無效' : '伺服器處理失敗' });
  });
  return app;
}
