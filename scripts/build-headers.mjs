/**
 * Genera dist/_headers (header HTTP applicati da Cloudflare Workers Static Assets).
 *
 * La CSP usa `script-src 'self'` piu' gli hash SHA-256 degli script inline presenti
 * in index.html (il blocco JSON-LD dei dati strutturati): cosi' non serve
 * 'unsafe-inline' e i rich snippet continuano a funzionare anche se il contenuto
 * del blocco cambia, perche' l'hash viene ricalcolato a ogni build.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const indexPath = join(distDir, 'index.html');

if (!existsSync(indexPath)) {
  console.error('[build-headers] dist/index.html non trovato: eseguire prima `vite build`.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const inlineScriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

const hashes = new Set();
for (const match of html.matchAll(inlineScriptRe)) {
  const body = match[1];
  if (!body) continue;
  hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}

// 'wasm-unsafe-eval' serve a pdf.js, usato per leggere i PDF nel browser
// durante l'apertura di una pratica di sinistro. Non consente eval() di
// JavaScript: abilita solo la compilazione di WebAssembly.
const scriptSrc = ["'self'", ...hashes, "'wasm-unsafe-eval'", 'https://challenges.cloudflare.com'].join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  // Tailwind e i componenti React usano attributi style inline.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
  "connect-src 'self' https://challenges.cloudflare.com",
  // Il worker di pdf.js viene servito dal nostro dominio; blob: copre il
  // fallback usato da alcuni browser.
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com https://www.openstreetmap.org",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `# File generato da scripts/build-headers.mjs - non modificare a mano.

/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
`;

writeFileSync(join(distDir, '_headers'), headers, 'utf8');
console.log(`[build-headers] dist/_headers scritto (${hashes.size} hash script inline).`);
