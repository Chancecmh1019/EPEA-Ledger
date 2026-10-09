import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createApi } from './backend/app';
const app = createApi();
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    app.use((await createServer({ server: { middlewareMode: true }, appType: 'spa' })).middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  }
  app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('EPEA Ledger ready'));
}
start().catch(error => { console.error(error); process.exitCode = 1; });
