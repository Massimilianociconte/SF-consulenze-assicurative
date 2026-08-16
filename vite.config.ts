import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Percorsi assoluti su Cloudflare Workers: servono al routing SPA lato client
  // (/accedi, /area-riservata/...), dove un base relativo romperebbe il
  // caricamento degli asset sulle rotte annidate.
  // La build per GitHub Pages (DEPLOY_TARGET=pages) resta con base relativo,
  // esattamente come oggi, per non toccare il sito attualmente online.
  base: process.env.DEPLOY_TARGET === 'pages' ? './' : '/',
  server: {
    port: 3000,
    open: false,
    // In sviluppo il frontend gira su Vite e le API sul Worker (wrangler dev).
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false
      }
    }
  }
});
