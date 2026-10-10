import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
function offlineShell(): Plugin {
  return {
    name: 'epea-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => '/' + name);
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const cacheName = 'epea-shell-${version}';
const assets = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(['/index.html', ...assets])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('epea-shell-'));
    await Promise.all(names.slice(0, -2).filter(name => name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error('Unavailable');
        if (response.headers.get('content-type')?.includes('text/html')) {
          const cache = await caches.open(cacheName);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
  } else if (assets.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
` });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), offlineShell()],
  server: { host: '127.0.0.1', hmr: process.env.DISABLE_HMR !== 'true', fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/client_secret_*.json', '**/*.csv', '**/.private-audit/**', '**/.recovery/**', '**/.vercel/**'] } },
});
