#!/usr/bin/env node
// Cambia la URL pública del sitio en todas las páginas (canonical, og:url, imágenes, hreflang)
// y regenera el sitemap. Uso: node scripts/set-site-url.mjs https://auravalencia.es
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const cfgPath = join(ROOT, 'scripts', 'site-config.json');
const viejo = JSON.parse(readFileSync(cfgPath, 'utf8')).url.replace(/\/$/, '');
const nuevo = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(nuevo)) { console.error('Uso: node scripts/set-site-url.mjs https://dominio'); process.exit(1); }

const PREFIJO = '<!--SITEURL-->'; // marca los valores que dependen del dominio
for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
  let h = readFileSync(join(ROOT, f), 'utf8');
  const original = h;
  const pagina = f === 'index.html' ? '' : f;
  // 1) primera vez: sustituir los marcadores pendientes
  h = h.replace(/  <!-- rel="canonical" (pendiente|pending)[^>]*-->\n/, `  <link rel="canonical" href="${nuevo}/${pagina}" />\n`)
       .replace(/  <!-- og:url (pendiente|pending)[^>]*-->\n/, `  <meta property="og:url" content="${nuevo}/${pagina}" />\n`)
       .replace(/content="\/assets\/hero-poster\.jpg"/g, `content="${nuevo}/assets/hero-poster.jpg"`)
       .replace(/"image": "\/assets\/hero-poster\.jpg"/g, `"image": "${nuevo}/assets/hero-poster.jpg"`);
  // 2) cambios posteriores: viejo -> nuevo
  if (viejo !== nuevo) h = h.split(viejo).join(nuevo);
  if (h !== original) writeFileSync(join(ROOT, f), h, 'utf8');
}
writeFileSync(cfgPath, JSON.stringify({ url: nuevo }, null, 2) + '\n');
execSync('node scripts/generate-sitemap.mjs', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/bake-content.mjs', { cwd: ROOT, stdio: 'inherit' });
console.log(`URL del sitio: ${nuevo}`);
