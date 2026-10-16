#!/usr/bin/env node
// Genera sitemap.xml (con alternativas hreflang ES/EN) y deja la línea Sitemap en robots.txt.
// La URL pública sale de scripts/site-config.json: al cambiar de dominio, edítala y vuelve a ejecutar.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SITE = JSON.parse(readFileSync(join(ROOT, 'scripts', 'site-config.json'), 'utf8')).url.replace(/\/$/, '');

// [español, inglés, prioridad, frecuencia]
const PAGINAS = [
  ['index.html', 'en.html', '1.0', 'weekly'],
  ['carta.html', 'en-carta.html', '0.9', 'daily'],
  ['reservas.html', 'en-reservas.html', '0.8', 'monthly'],
  ['eventos.html', 'en-eventos.html', '0.8', 'daily'],
  ['visitanos.html', 'en-visitanos.html', '0.7', 'monthly'],
  ['galeria.html', 'en-galeria.html', '0.5', 'monthly'],
  ['legal.html', 'en-legal.html', '0.2', 'yearly'],
  ['privacidad.html', 'en-privacidad.html', '0.2', 'yearly'],
  ['cookies.html', 'en-cookies.html', '0.2', 'yearly'],
];

const url = (f) => `${SITE}/${f === 'index.html' ? '' : f}`;
const entrada = (f, es, en, prio, freq) => `  <url>
    <loc>${url(f)}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="${url(es)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${url(en)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${url(es)}" />
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
  </url>`;

const urls = PAGINAS.flatMap(([es, en, prio, freq]) => [entrada(es, es, en, prio, freq), entrada(en, es, en, prio, freq)]);
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`, 'utf8');

let robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8')
  .replace(/\n*# Sitemap: pendiente[^\n]*\n(# [^\n]*\n)*/g, '\n')
  .replace(/\n*Sitemap:[^\n]*\n*/g, '\n')
  .trimEnd();
writeFileSync(join(ROOT, 'robots.txt'), `${robots}\n\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');
console.log(`sitemap.xml generado (${urls.length} URLs) para ${SITE}`);
