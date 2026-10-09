#!/usr/bin/env node
// Hornea el contenido de las Google Sheets (Talleres/Eventos y Carta) directamente en
// eventos.html/en-eventos.html y carta.html/en-carta.html, en el mismo
// formato que genera script.js en el navegador. Así los buscadores y bots de
// IA que NO ejecutan JavaScript (p.ej. GPTBot, ClaudeBot, PerplexityBot) ven
// contenido real en el HTML crudo, en vez de "Cargando talleres…" o la carta
// desactualizada.
//
// El HTML sigue siendo dinámico para las personas: script.js vuelve a pintar
// Talleres y Carta en el navegador con los datos más recientes de la Sheet.
// Este script solo actualiza la "foto fija" que ven los rastreadores y los
// visitantes con JavaScript desactivado.
//
// Uso: node scripts/bake-content.mjs
// Pensado para ejecutarse a diario desde GitHub Actions
// (.github/workflows/bake-content.yml), pero funciona igual en local.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const TALLERES_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/131CPxEHaCQD9SlgxJxuSr0AhGdZZLcna359Uv4-XitY/export?format=csv&gid=1547456886';
const CARTA_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1PHh0xQYdxf3YcuI2_vE2Y6lAO_Az22scKLOVm3EwilY/export?format=csv&gid=1254248669';
const WHATSAPP_NUMBER_TALLERES = '34612422574';
const WHATSAPP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2c-5.4 0-9.8 4.4-9.8 9.8 0 1.7.5 3.4 1.3 4.9L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.4 0 9.8-4.4 9.8-9.8s-4.4-9.8-9.8-9.8zm0 17.9c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3c-.8-1.3-1.3-2.9-1.3-4.5 0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.4-8.2 8.4zm4.5-6.2c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.3-.4.1-.1.2-.2.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9 0 1.1.8 2.2.9 2.4.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3z"/></svg>';

const CARTA_PAGES = [
  { file: 'carta.html', isEN: false },
  { file: 'en-carta.html', isEN: true },
];
const TALLERES_PAGES = [
  { file: 'eventos.html', isEN: false },
  { file: 'en-eventos.html', isEN: true },
];

// ---------- helpers (réplica de la lógica de script.js, sin DOM) ----------

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignorado, lo maneja \n */ }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text.trim());
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
}

function normalizeImageUrl(url) {
  if (!url) return '';
  url = url.trim();
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1200` : url;
}

// El ID del archivo de Drive es la clave estable para descargar y cachear
// la foto localmente (evita depender del hotlink de Google en el navegador,
// que algunos bloqueadores de anuncios/extensiones de privacidad bloquean
// al incrustarlo como <img>, aunque la URL funcione abierta directamente).
function driveFileId(url) {
  if (!url) return null;
  const m = url.trim().match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  return m ? m[1] : null;
}

// Descarga (server-side, sin las restricciones de un <img> en el navegador)
// cada foto de Talleres a images/talleres/{id}.jpg y devuelve un mapa
// id -> ruta local, para que tanto el HTML horneado como script.js sirvan
// la copia propia en vez de volver a pedir la imagen a Google en el navegador.
async function downloadTalleresImages(rows) {
  const dir = join(ROOT, 'images', 'talleres');
  mkdirSync(dir, { recursive: true });
  const map = {};
  for (const row of rows) {
    const id = driveFileId(row.imagen);
    if (!id) continue;
    const localRel = `images/talleres/${id}.jpg`;
    try {
      const res = await fetch(normalizeImageUrl(row.imagen));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(ROOT, localRel), buf);
      map[id] = localRel;
      console.log(`  Foto descargada: ${localRel}`);
    } catch (err) {
      console.log(`  Aviso: no se pudo descargar la foto de "${row.titulo || id}" (${err.message}); se usará el enlace de Google como respaldo.`);
    }
  }
  return map;
}

// Fotos de la Carta (columna "Imagen"): igual que en Talleres, se descargan a
// images/carta/{id}.jpg para no depender del hotlink de Google en el navegador.
async function downloadCartaImages(rows) {
  const dir = join(ROOT, 'images', 'carta');
  mkdirSync(dir, { recursive: true });
  for (const row of rows) {
    const id = driveFileId(row.imagen);
    if (!id) continue;
    try {
      const res = await fetch(normalizeImageUrl(row.imagen));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(join(dir, `${id}.jpg`), Buffer.from(await res.arrayBuffer()));
      console.log(`  Foto de carta descargada: images/carta/${id}.jpg (${row.nombre})`);
    } catch (err) {
      console.log(`  Aviso: no se pudo descargar la foto de "${row.nombre}" (${err.message}).`);
    }
  }
}

function cartaImgAttr(it) {
  const id = driveFileId(it.imagen);
  return id ? ` data-img="images/carta/${id}.jpg" data-img-remote="${escapeHtml(normalizeImageUrl(it.imagen))}"` : '';
}

function formatFecha(raw, isEN) {
  const m = (raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return raw || '';
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.toLocaleDateString(isEN ? 'en-GB' : 'es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function parseFechaDate(raw) {
  const m = (raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function seleccionarTalleres(items) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const conFecha = items
    .map((t) => ({ t, fecha: parseFechaDate(t.fecha) }))
    .filter((x) => x.fecha);
  const sinFecha = items.filter((t) => !parseFechaDate(t.fecha));

  const proximos = conFecha.filter((x) => x.fecha >= hoy).sort((a, b) => b.fecha - a.fecha);
  const pasados = conFecha.filter((x) => x.fecha < hoy).sort((a, b) => b.fecha - a.fecha);

  const resultado = proximos.map((x) => x.t);
  if (pasados.length) resultado.push(pasados[0].t);
  resultado.push(...sinFecha);
  return resultado;
}

function buildSubtitulo(t, isEN) {
  const partes = [];
  if (t.fecha) partes.push(formatFecha(t.fecha, isEN));
  if (t.hora) partes.push(t.hora);
  if (t.plazas) partes.push(isEN ? `${t.plazas} spots` : `${t.plazas} plazas`);
  if (partes.length) return partes.join(' · ');
  return isEN ? (t.subtitulo_en || t.subtitulo || '') : (t.subtitulo || '');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'cat';
}

// ---------- Talleres: genera el mismo HTML que pinta paint() en el cliente ----------

function buildTalleresHtml(items, isEN, imageMap) {
  const visibles = items.filter((t) => String(t.publicar || 'si').toLowerCase() !== 'no');
  if (!visibles.length) {
    return `<p class="talleres__empty">${isEN ? 'Workshops coming soon.' : 'Muy pronto, nuevos talleres.'}</p>`;
  }
  const seleccion = seleccionarTalleres(visibles);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  return seleccion.map((t) => {
    const titulo = isEN ? (t.titulo_en || t.titulo) : t.titulo;
    const subtitulo = buildSubtitulo(t, isEN);
    const texto = isEN ? (t.texto_en || t.texto) : t.texto;
    const fileId = driveFileId(t.imagen);
    const imagen = (fileId && imageMap[fileId]) || normalizeImageUrl(t.imagen);
    const fecha = parseFechaDate(t.fecha);
    const pasado = fecha && fecha < hoy;
    const cuando = fecha ? `${formatFecha(t.fecha, isEN)}${t.hora ? ' · ' + t.hora : ''}` : '';
    const imgTag = imagen
      ? `<img src="${imagen}" alt="${escapeHtml(titulo)}" loading="lazy" onerror="if(!this.dataset.retried){this.dataset.retried='1';this.src=this.src+'?r='+Date.now();}else{this.remove();this.parentElement.classList.remove('has-image');}" />`
      : '';
    const apuntarse = pasado ? '' : `
            <div class="taller__signup">
              <button type="button" class="btn btn--primary taller__open">${isEN ? 'Sign me up' : 'Apúntame'}</button>
              <form class="taller__apuntarse" data-titulo="${escapeHtml(titulo)}" data-cuando="${escapeHtml(cuando)}" hidden>
                <div class="taller__stepper">
                  <button type="button" class="taller__step" data-dir="-1" aria-label="${isEN ? 'Fewer people' : 'Menos personas'}">−</button>
                  <input type="number" name="personas" min="1" max="20" value="2" inputmode="numeric" aria-label="${isEN ? 'Number of people' : 'Número de personas'}" required />
                  <button type="button" class="taller__step" data-dir="1" aria-label="${isEN ? 'More people' : 'Más personas'}">+</button>
                </div>
                <button type="submit" class="btn btn--primary taller__cta">${WHATSAPP_ICON_SVG}<span>${isEN ? 'Send request' : 'Enviar solicitud'}</span></button>
              </form>
            </div>`;
    return `
        <article class="taller__card${pasado ? ' taller__card--pasado' : ''}">
          <div class="taller__img${imagen ? ' has-image' : ''}" data-placeholder="${escapeHtml(titulo)}">${imgTag}</div>
          <div class="taller__body">
            <h3>${titulo}</h3>
            <p class="taller__sub">${subtitulo || ''}${pasado ? ` · <span class="taller__tag">${isEN ? 'Past' : 'Ya realizado'}</span>` : ''}</p>
            <p class="taller__text">${texto || ''}</p>
            ${apuntarse}
          </div>
        </article>`;
  }).join('');
}

// Columnas de la Sheet -> atributos data-* que usa el filtro de la carta
// (Vegetariano/Vegano/Keto/Sin gluten). Todo lo que no sea exactamente "1"
// cuenta como 0, así que una celda vacía no rompe el filtro.
const DIET_COLUMNS = [
  ['veg', 'vegetariano'],
  ['vegan', 'vegano'],
  ['keto', 'keto'],
  ['gf', 'sin gluten'],
  ['lac', 'sin lactosa'],
];
function dietDataAttrs(it) {
  return DIET_COLUMNS.map(([attr, col]) => ` data-${attr}="${it[col] && it[col].trim() === '1' ? '1' : '0'}"`).join('');
}

const DIET_LABELS = { veg: ['Vegetariano', 'Vegetarian'], vegan: ['Vegano', 'Vegan'], keto: ['Keto', 'Keto'], gf: ['Sin gluten', 'Gluten-free'], lac: ['Sin lactosa', 'Lactose-free'] };
function dietIconsHtml(it, isEN) {
  const icons = DIET_COLUMNS.filter(([, col]) => it[col] && it[col].trim() === '1')
    .map(([attr]) => { const l = DIET_LABELS[attr][isEN ? 1 : 0]; return `<span class="diet-ico diet-ico--${attr}" role="img" aria-label="${l}" title="${l}"></span>`; }).join('');
  return icons ? `<span class="menu__diets">${icons}</span>` : '';
}

// ID estable de cada plato (para el enlace directo a su ficha, p.ej. desde el
// bloque destacado del açaí en Inicio). Se basa siempre en el nombre en
// español para que sea el mismo en carta.html y en-carta.html.
function menuItemId(usedIds, categoriaId, nombreOriginal) {
  const base = `plato-${categoriaId}-${slugify(nombreOriginal)}`;
  let id = base, n = 2;
  while (usedIds.has(id)) { id = `${base}-${n}`; n++; }
  usedIds.add(id);
  return id;
}

// ---------- Carta: genera el mismo HTML que pinta renderCarta() en el cliente ----------

function buildCarta(rows, isEN) {
  const visibles = rows.filter((r) => String(r.publicar || 'si').toLowerCase() !== 'no');
  if (!visibles.length) return null; // deja la carta estática del HTML tal cual

  const categorias = [];
  const porId = new Map();
  visibles.forEach((r) => {
    const nombreCat = isEN ? (r.categoria_en || r.categoria) : r.categoria;
    const id = slugify(r.categoria || nombreCat);
    if (!porId.has(id)) {
      porId.set(id, {
        id,
        nombre: nombreCat,
        nota: isEN ? (r.categoria_nota_en || r.categoria_nota) : r.categoria_nota,
        orden: +r.orden_categoria || 999,
        subcats: new Map(),
      });
      categorias.push(porId.get(id));
    }
    const cat = porId.get(id);
    const subNombre = isEN ? (r.subcategoria_en || r.subcategoria) : (r.subcategoria || '');
    if (!cat.subcats.has(subNombre)) cat.subcats.set(subNombre, []);
    cat.subcats.get(subNombre).push(r);
  });
  categorias.sort((a, b) => a.orden - b.orden);
  categorias.forEach((cat) => {
    cat.subcats.forEach((items) => items.sort((a, b) => (+a.orden || 0) - (+b.orden || 0)));
  });

  const tabsHtml = categorias.map((cat, i) => `
            <button class="menu__tab${i === 0 ? ' is-active' : ''}" data-tab="${cat.id}" role="tab">${escapeHtml(cat.nombre)}</button>`
  ).join('');

  const usedIds = new Set();
  const panelsHtml = categorias.map((cat, i) => {
    let html = `<div class="menu__panel${i === 0 ? ' is-active' : ''}" data-panel="${cat.id}">`;
    if (cat.nota) {
      html += `<div class="menu__intro"><strong>${escapeHtml(cat.nombre)}</strong><span>${escapeHtml(cat.nota)}</span></div>`;
    }
    html += '<div class="menu__cols">';
    const renderItem = (it) => {
      const nombre = isEN ? (it.nombre_en || it.nombre) : it.nombre;
      const desc = isEN ? (it.descripcion_en || it.descripcion) : it.descripcion;
      const aler = it.alergenos ? ` (${escapeHtml(it.alergenos)})` : '';
      const descHtml = desc || aler ? `<p>${escapeHtml(desc)}${aler}</p>` : '';
      const dietAttrs = dietDataAttrs(it);
      const id = menuItemId(usedIds, cat.id, it.nombre);
      return `<div class="menu__item" id="${id}" tabindex="0" role="button"${dietAttrs}${cartaImgAttr(it)}><div class="menu__name"><span class="menu__title">${escapeHtml(nombre)}${dietIconsHtml(it, isEN)}</span> <span class="price">${escapeHtml(it.precio || '')}</span></div>${descHtml}</div>`;
    };
    // Si la categoría no tiene subcategorías (una sola columna de origen),
    // se reparte en 2 columnas visuales a mano para no dejar media carta en blanco.
    if (cat.subcats.size === 1) {
      const [[subNombre, items]] = cat.subcats;
      const mitad = Math.ceil(items.length / 2);
      const columnas = items.length > 1 ? [items.slice(0, mitad), items.slice(mitad)] : [items];
      columnas.forEach((colItems, idx) => {
        html += '<div class="menu__col">';
        if (subNombre && idx === 0) html += `<p class="menu__cat">${escapeHtml(subNombre)}</p>`;
        html += colItems.map(renderItem).join('');
        html += '</div>';
      });
    } else {
      cat.subcats.forEach((items, subNombre) => {
        html += '<div class="menu__col">';
        if (subNombre) html += `<p class="menu__cat">${escapeHtml(subNombre)}</p>`;
        html += items.map(renderItem).join('');
        html += '</div>';
      });
    }
    html += '</div></div>';
    return html;
  }).join('\n          ');

  return { tabsHtml, panelsHtml };
}

// ---------- reemplazo entre marcadores ----------

function replaceBetween(html, marker, replacement) {
  const re = new RegExp(`(<!-- BAKED:${marker}:START -->)[\\s\\S]*?(<!-- BAKED:${marker}:END -->)`);
  if (!re.test(html)) throw new Error(`Marcador BAKED:${marker} no encontrado`);
  const clean = replacement.trim();
  return html.replace(re, () => `<!-- BAKED:${marker}:START -->\n          ${clean}\n          <!-- BAKED:${marker}:END -->`);
}

async function fetchCsv(url) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}v=${Date.now()}`);
  if (!res.ok) throw new Error(`No se pudo descargar la Sheet (${res.status}): ${url}`);
  return csvToObjects(await res.text());
}

async function main() {
  console.log('Descargando Sheets...');
  const [talleresRows, cartaRows] = await Promise.all([
    fetchCsv(TALLERES_SHEET_CSV_URL),
    fetchCsv(CARTA_SHEET_CSV_URL),
  ]);
  console.log(`  Talleres: ${talleresRows.length} filas`);
  console.log(`  Carta: ${cartaRows.length} filas`);

  console.log('Descargando fotos de Talleres (para no depender del hotlink de Google en el navegador)...');
  const imageMap = await downloadTalleresImages(talleresRows);
  writeFileSync(join(ROOT, 'talleres-images.json'), JSON.stringify(imageMap, null, 2) + '\n', 'utf8');

  console.log('Descargando fotos de la Carta...');
  await downloadCartaImages(cartaRows);

  let cambios = 0;

  for (const { file, isEN } of TALLERES_PAGES) {
    const path = join(ROOT, file);
    let html = readFileSync(path, 'utf8');
    const original = html;

    const talleresHtml = buildTalleresHtml(talleresRows, isEN, imageMap);
    html = replaceBetween(html, 'TALLERES', talleresHtml);

    if (html !== original) {
      writeFileSync(path, html, 'utf8');
      cambios++;
      console.log(`  ${file}: actualizado`);
    } else {
      console.log(`  ${file}: sin cambios`);
    }
  }

  for (const { file, isEN } of CARTA_PAGES) {
    const path = join(ROOT, file);
    let html = readFileSync(path, 'utf8');
    const original = html;

    const carta = buildCarta(cartaRows, isEN);
    if (carta) {
      html = replaceBetween(html, 'CARTA_TABS', carta.tabsHtml);
      html = replaceBetween(html, 'CARTA_PANELS', carta.panelsHtml);
    }

    if (html !== original) {
      writeFileSync(path, html, 'utf8');
      cambios++;
      console.log(`  ${file}: actualizado`);
    } else {
      console.log(`  ${file}: sin cambios`);
    }
  }

  console.log(cambios ? `Hecho: ${cambios} archivo(s) actualizados.` : 'Hecho: no había cambios que hornear.');
}

main().catch((err) => {
  console.error('Error al hornear contenido:', err.message);
  process.exit(1);
});
