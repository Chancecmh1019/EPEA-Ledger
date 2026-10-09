import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', hmr: process.env.DISABLE_HMR !== 'true', fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/client_secret_*.json', '**/*.csv', '**/.private-audit/**', '**/.recovery/**', '**/.vercel/**'] } },
});
