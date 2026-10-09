// Año dinámico
document.getElementById('year').textContent = new Date().getFullYear();

// Estado abierto / cerrado en tiempo real
// Horario: todos los días 9:00–16:00
const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 16 * 60;

const isEN = document.documentElement.lang === 'en';

function updateOpenStatus() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const isOpen = mins >= OPEN_MIN && mins < CLOSE_MIN;

  const state = isOpen ? 'is-open' : 'is-closed';
  const label = isOpen ? (isEN ? 'Open' : 'Abierto') : (isEN ? 'Closed' : 'Cerrado');
  const detail = isOpen
    ? (isEN ? 'Closes at 16:00' : 'Cierra a las 16:00')
    : (mins < OPEN_MIN
        ? (isEN ? 'Opens today at 9:00' : 'Abre hoy a las 9:00')
        : (isEN ? 'Opens tomorrow at 9:00' : 'Abre mañana a las 9:00'));

  // Botón flotante de horario
  const statusFloat = document.getElementById('statusFloat');
  if (statusFloat) {
    statusFloat.classList.remove('is-open', 'is-closed');
    statusFloat.classList.add(state);
    statusFloat.querySelector('.txt').innerHTML = `<b>${label}</b><span class="status-detail"> · ${detail}</span>`;
  }
}
updateOpenStatus();
setInterval(updateOpenStatus, 60 * 1000);

// Nav: sombra al hacer scroll
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Burger menu
const burger = document.querySelector('.nav__burger');
const links  = document.querySelector('.nav__links');
burger.addEventListener('click', () => {
  const open = links.classList.toggle('is-open');
  burger.setAttribute('aria-expanded', String(open));
});

// Scroll suave del hero hacia "El lugar" (dentro de la misma página)
const heroScroll = document.getElementById('heroScroll');
if (heroScroll) {
  heroScroll.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('about').scrollIntoView({ behavior: 'smooth' });
  });
}

// Reveal en scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.section, .card, .gallery__item').forEach(el => {
  el.classList.add('reveal');
  io.observe(el);
});

// Tabs de la carta
const tabs   = document.querySelectorAll('.menu__tab');
const panels = document.querySelectorAll('.menu__panel');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.toggle('is-active', t === tab));
    panels.forEach(p => p.classList.toggle('is-active', p.dataset.panel === target));
    tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
});

// Filtros de la carta: Vegetariano / Vegano / Keto / Sin gluten. Los botones
// viven fuera de los paneles (que renderCarta() destruye y reconstruye al
// llegar los datos de la Sheet), así que sobreviven al re-render — solo hace
// falta volver a aplicar el filtro activo después de cada reconstrucción
// (por eso aplicarFiltrosCarta() también se llama desde dentro de renderCarta).
const filtroCartaBtns = document.querySelectorAll('.menu__filter');
function aplicarFiltrosCarta() {
  const activos = Array.from(filtroCartaBtns)
    .filter((b) => b.classList.contains('is-active'))
    .map((b) => b.dataset.filter);

  document.querySelectorAll('.menu__panel').forEach((panel) => {
    let visiblesEnPanel = 0;
    panel.querySelectorAll('.menu__col').forEach((col) => {
      let visiblesEnCol = 0;
      col.querySelectorAll('.menu__item').forEach((item) => {
        const cumple = activos.every((f) => item.dataset[f] === '1' || (f === 'veg' && item.dataset.vegan === '1')); // vegano también cuenta como vegetariano
        item.hidden = !cumple;
        if (cumple) visiblesEnCol++;
      });
      col.hidden = activos.length > 0 && visiblesEnCol === 0;
      visiblesEnPanel += visiblesEnCol;
    });

    let vacio = panel.querySelector('.menu__empty');
    if (activos.length && visiblesEnPanel === 0) {
      if (!vacio) {
        vacio = document.createElement('p');
        vacio.className = 'menu__empty';
        vacio.textContent = isEN ? 'No dishes match these filters yet.' : 'De momento no hay platos con estos filtros.';
        panel.appendChild(vacio);
      }
      vacio.hidden = false;
    } else if (vacio) {
      vacio.hidden = true;
    }
  });
}
filtroCartaBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('is-active');
    aplicarFiltrosCarta();
  });
});

// Enlaces con filtro preactivado, p.ej. carta.html?filtro=vegan (chips de Inicio)
new URLSearchParams(location.search).getAll('filtro').forEach((f) => {
  document.querySelector(`.menu__filter[data-filter="${f}"]`)?.classList.add('is-active');
});
aplicarFiltrosCarta();

// Ficha de plato: al pulsar (o Enter/Espacio) sobre cualquier ítem de la carta
// se abre con su nombre, precio, descripción y foto (foto temporal hasta que
// Aura mande las fotos reales de cada plato). También se puede enlazar
// directamente con #plato-... en la URL — lo usa el CTA del açaí en Inicio.
const ficha = document.getElementById('fichaPlato');
const fichaNombre = ficha?.querySelector('.ficha__nombre');
const fichaPrecio = ficha?.querySelector('.ficha__precio');
const fichaDesc = ficha?.querySelector('.ficha__descripcion');
const fichaTags = ficha?.querySelector('.ficha__tags');
const fichaCerrar = ficha?.querySelector('.ficha__cerrar');
const fichaPrev = ficha?.querySelector('.ficha__nav--prev');
const fichaNext = ficha?.querySelector('.ficha__nav--next');
let fichaUltimoFoco = null;
let fichaActual = null;

// Todos los platos visibles ahora mismo (respeta los filtros de dieta activos),
// en el mismo orden en que aparecen en la carta — de aquí sale el "anterior"/
// "siguiente" de la ficha, recorriendo toda la carta, no solo la pestaña actual.
function fichaListaNavegable() {
  return Array.from(document.querySelectorAll('.menu__panel'))
    .flatMap((panel) => Array.from(panel.querySelectorAll('.menu__item')))
    .filter((it) => !it.hidden);
}

function abrirFicha(item) {
  if (!ficha) return;
  fichaActual = item;
  const nombreEl = item.querySelector('.menu__name');
  fichaNombre.textContent = nombreEl ? nombreEl.firstChild.textContent.trim() : '';
  fichaPrecio.textContent = item.querySelector('.price')?.textContent.trim() || '';
  const descEl = item.querySelector('p');
  fichaDesc.textContent = descEl ? descEl.textContent.trim() : '';
  fichaDesc.hidden = !descEl;

  const etiquetas = [];
  const dietas = { veg: ['Vegetariano', 'Vegetarian'], vegan: ['Vegano', 'Vegan'], keto: ['Keto', 'Keto'], gf: ['Sin gluten', 'Gluten-free'], lac: ['Sin lactosa', 'Lactose-free'] };
  const esBebida = ['cafe', 'bebidas'].includes(item.closest('.menu__panel')?.dataset.panel);
  if (!esBebida) Object.entries(dietas).forEach(([k, l]) => { if (item.dataset[k] === '1') etiquetas.push([k, l[isEN ? 1 : 0]]); });
  fichaTags.innerHTML = etiquetas.map(([k, t]) => `<span class="ficha__tag"><span class="diet-ico diet-ico--${k}"></span>${t}</span>`).join('');
  fichaTags.hidden = !etiquetas.length;

  const hayVarios = fichaListaNavegable().length > 1;
  if (fichaPrev) fichaPrev.hidden = !hayVarios;
  if (fichaNext) fichaNext.hidden = !hayVarios;

  const foto = ficha.querySelector('.ficha__foto');
  const img = foto.querySelector('.ficha__img');
  foto.classList.remove('has-photo');
  img.removeAttribute('src');
  if (item.dataset.img) {
    img.onload = () => foto.classList.add('has-photo');
    img.onerror = () => {
      if (item.dataset.imgRemote && img.src !== item.dataset.imgRemote) img.src = item.dataset.imgRemote;
      else foto.classList.remove('has-photo');
    };
    img.alt = fichaNombre.textContent;
    img.src = item.dataset.img;
  }

  fichaUltimoFoco = document.activeElement;
  ficha.hidden = false;
  requestAnimationFrame(() => ficha.classList.add('is-open'));
  document.body.classList.add('ficha-open');
  fichaCerrar.focus();
  history.replaceState(null, '', '#' + item.id);
}

function irFicha(dir) {
  const lista = fichaListaNavegable();
  const idx = lista.indexOf(fichaActual);
  if (!lista.length || idx === -1) return;
  const item = lista[(idx + dir + lista.length) % lista.length];
  const panel = item.closest('.menu__panel');
  if (panel && !panel.classList.contains('is-active')) {
    const tab = document.querySelector(`.menu__tab[data-tab="${panel.dataset.panel}"]`);
    if (tab) tab.click();
  }
  abrirFicha(item);
}

function cerrarFicha() {
  if (!ficha || ficha.hidden) return;
  ficha.classList.remove('is-open');
  document.body.classList.remove('ficha-open');
  setTimeout(() => { ficha.hidden = true; }, 200);
  if (fichaUltimoFoco) fichaUltimoFoco.focus();
}

function abrirFichaDesdeHash() {
  if (!ficha) return;
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const item = document.getElementById(id);
  if (!item || !item.classList.contains('menu__item')) return;
  const panel = item.closest('.menu__panel');
  if (panel) {
    const tab = document.querySelector(`.menu__tab[data-tab="${panel.dataset.panel}"]`);
    if (tab && !tab.classList.contains('is-active')) tab.click();
  }
  document.getElementById('carta')?.scrollIntoView();
  abrirFicha(item);
}

if (ficha) {
  document.querySelectorAll('.menu').forEach((menuEl) => {
    menuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.menu__item');
      if (item) abrirFicha(item);
    });
    menuEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.menu__item');
      if (item) { e.preventDefault(); abrirFicha(item); }
    });
  });
  fichaCerrar.addEventListener('click', cerrarFicha);
  ficha.addEventListener('click', (e) => { if (e.target === ficha) cerrarFicha(); });
  fichaPrev?.addEventListener('click', () => irFicha(-1));
  fichaNext?.addEventListener('click', () => irFicha(1));
  document.addEventListener('keydown', (e) => {
    if (ficha.hidden) return;
    if (e.key === 'Escape') cerrarFicha();
    else if (e.key === 'ArrowLeft') irFicha(-1);
    else if (e.key === 'ArrowRight') irFicha(1);
  });
  abrirFichaDesdeHash();
}

// ---------- Cookies + iframe de terceros con consentimiento (Google Maps) ----------
(function () {
  const KEY = 'aura_cookies';
  const banner = document.getElementById('cookieBanner');
  const mapWrap = document.getElementById('mapWrap');
  const mapFrame = document.getElementById('mapFrame');

  function loadThirdPartyFrames() {
    if (mapFrame && !mapFrame.src) mapFrame.src = mapFrame.dataset.src;
    if (mapWrap) mapWrap.classList.add('ok');
  }
  function setChoice(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    if (banner) banner.classList.remove('show');
    if (v === 'accept') loadThirdPartyFrames();
  }
  let choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'accept') loadThirdPartyFrames();
  else if (!choice && banner) banner.classList.add('show');

  document.getElementById('ckAccept')?.addEventListener('click', () => setChoice('accept'));
  document.getElementById('ckReject')?.addEventListener('click', () => setChoice('reject'));
  document.getElementById('mapAccept')?.addEventListener('click', () => setChoice('accept'));
  document.getElementById('ckReset')?.addEventListener('click', () => { if (banner) banner.classList.add('show'); });
})();

// ---------- Reservas: mesa automática (Sheet de Mesas + Google Calendar), ----------
// ---------- con WhatsApp como respaldo para grupos grandes o sin hueco. ----------
// Pega aquí la "Web app URL" del Apps Script una vez desplegado (ver
// scripts/apps-script-reservas.gs para el código y las instrucciones).
// Mientras esté vacía, toda reserva se gestiona por WhatsApp, como antes.
const RESERVAS_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxe2GVO4FRoST2JDftHDUpydYFCYrNs4OZUVBWaDNvDcooR8mmjbBwBcqezqPNNAwCf/exec';
const RESERVAS_MAX_PERSONAS_AUTOMATICO = 12; // el servidor decide según mesas/grupos de cada zona

// Teléfono con prefijo de país: formato automático y validación nativa (pattern + title).
function initTelefono(prefijoSelect, telefonoInput) {
  const PATRON_TELEFONO_ES = '[6-9][0-9]{2} [0-9]{2} [0-9]{2} [0-9]{2}';
  function actualizarPatronTelefono() {
    if (!telefonoInput) return;
    if (prefijoSelect.value === '+34') {
      telefonoInput.pattern = PATRON_TELEFONO_ES;
      telefonoInput.title = isEN ? '9 digits, starting with 6, 7, 8 or 9' : '9 dígitos, empezando por 6, 7, 8 o 9';
    } else {
      telefonoInput.removeAttribute('pattern');
      telefonoInput.title = '';
    }
  }
  if (telefonoInput) {
    actualizarPatronTelefono();
    telefonoInput.addEventListener('input', () => {
      let digitos = telefonoInput.value.replace(/\D/g, '');
      if (prefijoSelect.value === '+34') {
        digitos = digitos.slice(0, 9);
        telefonoInput.value = [digitos.slice(0, 3), digitos.slice(3, 5), digitos.slice(5, 7), digitos.slice(7, 9)]
          .filter(Boolean).join(' ');
      } else {
        telefonoInput.value = digitos;
      }
    });
    prefijoSelect?.addEventListener('change', () => {
      telefonoInput.value = '';
      actualizarPatronTelefono();
    });
  }
}

// Calendario propio (mismo estilo que la web) para un campo de texto + un campo oculto ISO.
function initDatePicker(fechaTexto, fechaReal) {
  if (!fechaTexto || !fechaReal) return;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const dp = document.createElement('div');
  dp.className = 'reservas__datepicker';
  dp.hidden = true;
  dp.innerHTML = `
    <div class="reservas__dp-head">
      <button type="button" class="reservas__dp-nav" data-dir="-1" aria-label="${isEN ? 'Previous month' : 'Mes anterior'}">‹</button>
      <span class="reservas__dp-label"></span>
      <button type="button" class="reservas__dp-nav" data-dir="1" aria-label="${isEN ? 'Next month' : 'Mes siguiente'}">›</button>
    </div>
    <div class="reservas__dp-weekdays"></div>
    <div class="reservas__dp-grid"></div>
  `;
  fechaTexto.parentElement.appendChild(dp);

  const dpLabel = dp.querySelector('.reservas__dp-label');
  const dpWeekdays = dp.querySelector('.reservas__dp-weekdays');
  const dpGrid = dp.querySelector('.reservas__dp-grid');

  const nombresMes = isEN
    ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombresDia = isEN ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  let vista = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  let seleccionada = null;

  function pintarCalendario() {
    dpLabel.textContent = `${nombresMes[vista.getMonth()]} ${vista.getFullYear()}`;
    dpWeekdays.innerHTML = nombresDia.map((d) => `<span>${d}</span>`).join('');

    const primerDiaSemana = (vista.getDay() + 6) % 7; // semana empieza en lunes
    const diasEnMes = new Date(vista.getFullYear(), vista.getMonth() + 1, 0).getDate();

    let celdas = '';
    for (let i = 0; i < primerDiaSemana; i++) {
      celdas += '<span class="reservas__dp-day reservas__dp-day--vacio"></span>';
    }
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = new Date(vista.getFullYear(), vista.getMonth(), d);
      const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const pasado = fecha < hoy;
      const clases = ['reservas__dp-day'];
      if (pasado) clases.push('reservas__dp-day--disabled');
      if (seleccionada === iso) clases.push('reservas__dp-day--selected');
      if (fecha.getTime() === hoy.getTime()) clases.push('reservas__dp-day--today');
      celdas += `<button type="button" class="${clases.join(' ')}" ${pasado ? 'disabled' : ''} data-fecha="${iso}">${d}</button>`;
    }
    dpGrid.innerHTML = celdas;
  }

  function abrirCalendario() {
    pintarCalendario();
    dp.hidden = false;
  }
  function cerrarCalendario() {
    dp.hidden = true;
  }

  fechaTexto.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dp.hidden) abrirCalendario(); else cerrarCalendario();
  });

  dp.addEventListener('click', (e) => {
    e.stopPropagation();
    const navBtn = e.target.closest('.reservas__dp-nav');
    if (navBtn) {
      vista = new Date(vista.getFullYear(), vista.getMonth() + Number(navBtn.dataset.dir), 1);
      pintarCalendario();
      return;
    }
    const dayBtn = e.target.closest('.reservas__dp-day[data-fecha]');
    if (dayBtn && !dayBtn.disabled) {
      const iso = dayBtn.dataset.fecha;
      const [y, m, d] = iso.split('-');
      seleccionada = iso;
      fechaReal.value = iso;
      fechaTexto.value = `${d}/${m}/${y}`;
      cerrarCalendario();
    }
  });

  document.addEventListener('click', (e) => {
    if (!dp.hidden && !dp.contains(e.target) && e.target !== fechaTexto) cerrarCalendario();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dp.hidden) cerrarCalendario();
  });
}

(function () {
  const form = document.getElementById('reservasForm');
  if (!form) return;
  const WHATSAPP_NUMBER = '34612422574';
  const status = document.getElementById('reservasStatus');
  const whatsappManual = document.getElementById('reservasWhatsappManual');
  const submitBtn = form.querySelector('.reservas__submit');
  const submitTxt = form.querySelector('.reservas__submit-txt');
  const personasInput = form.querySelector('[name="personas"]');

  function setStatus(kind, texto) {
    if (!status) return;
    status.className = 'reservas__status' + (kind ? ` reservas__status--${kind}` : '');
    status.textContent = texto;
    status.hidden = !texto;
  }

  // El botón de WhatsApp manual solo aparece cuando de verdad puede aportar
  // algo (mesas sin gestionar que quizá estén libres, o un fallo de red del
  // que no sabemos nada): es la persona quien decide si lo pulsa, nunca se
  // abre WhatsApp por su cuenta.
  function mostrarWhatsappManual(url) {
    if (!whatsappManual) return;
    whatsappManual.href = url;
    whatsappManual.hidden = false;
  }
  function ocultarWhatsappManual() {
    if (!whatsappManual) return;
    whatsappManual.hidden = true;
  }

  // El botón solo se viste de WhatsApp cuando de verdad va a abrir WhatsApp
  // (grupos de más de 12): para 12 o menos, la reserva puede confirmarse
  // sola sin pasar por WhatsApp, así que el botón no debe insinuar que sí.
  function actualizarModoBoton() {
    const personas = parseInt(personasInput.value, 10) || 0;
    const esWhatsapp = personas > RESERVAS_MAX_PERSONAS_AUTOMATICO;
    submitBtn.classList.toggle('reservas__submit--whatsapp', esWhatsapp);
    if (submitTxt) {
      submitTxt.textContent = esWhatsapp
        ? (isEN ? 'Book via WhatsApp' : 'Reservar por WhatsApp')
        : (isEN ? 'Book table' : 'Reservar mesa');
    }
  }
  personasInput?.addEventListener('input', actualizarModoBoton);
  actualizarModoBoton();

  // ---- Fecha: campo de texto (DD/MM/AAAA, sin día preseleccionado) que ----
  // ---- abre un calendario propio, dibujado con el estilo de la web — ----
  // ---- el selector nativo del navegador no se puede maquetar y además ----
  // ---- tenía un bug conocido al abrir/cerrar, así que aquí no se usa. ----
  initDatePicker(form.querySelector('#fechaTexto'), form.querySelector('#fechaReal'));

  // ---- Teléfono: prefijo de país + número, con formato automático. La ----
  // ---- validación es del propio formulario (pattern + title HTML) — al ----
  // ---- pulsar "Reservar mesa", el navegador dice si el campo es válido. ----
  const prefijoSelect = form.querySelector('#reservasPrefijo');
  const telefonoInput = form.querySelector('#reservasTelefono');
  initTelefono(prefijoSelect, telefonoInput);

  // ---- Mensajes de validación: el aviso nativo del navegador sale en el ----
  // ---- idioma del propio navegador (no en el de la página), así que lo ----
  // ---- sustituimos por texto en el idioma correcto con setCustomValidity. ----
  function mensajeValidez(input) {
    const v = input.validity;
    if (v.valid) return '';
    if (input === telefonoInput && v.patternMismatch) {
      return isEN ? 'Enter 9 digits, starting with 6, 7, 8 or 9.' : 'Escribe 9 dígitos, empezando por 6, 7, 8 o 9.';
    }
    if (input.type === 'email' && v.typeMismatch) {
      return isEN ? 'Enter a valid email address.' : 'Escribe un email válido.';
    }
    if (v.rangeUnderflow || v.rangeOverflow) {
      return isEN ? `Enter a number between ${input.min} and ${input.max}.` : `Escribe un número entre ${input.min} y ${input.max}.`;
    }
    if (v.valueMissing) {
      return isEN ? 'Please fill in this field.' : 'Rellena este campo.';
    }
    return isEN ? 'Check this field.' : 'Revisa este campo.';
  }
  form.querySelectorAll('input, select').forEach((input) => {
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('change', () => input.setCustomValidity(''));
    input.addEventListener('invalid', () => input.setCustomValidity(mensajeValidez(input)));
  });

  // ---- Zona / tipo de mesa: "Tipo" solo tiene sentido si la zona es "Dentro". ----
  const zonaSelect = form.querySelector('#reservasZona');
  const tipoRow = form.querySelector('#reservasTipoRow');
  function actualizarZona() {
    const esDentro = zonaSelect.value === 'Dentro';
    tipoRow.hidden = !esDentro;
  }
  zonaSelect?.addEventListener('change', actualizarZona);
  actualizarZona();

  function zonaTipoTexto(zona, tipo) {
    if (zona === 'Dentro') return isEN ? `Inside, ${tipo === 'Baja' ? 'low' : 'high'} table` : `Dentro, mesa ${tipo === 'Baja' ? 'baja' : 'alta'}`;
    return isEN ? 'Outside (terrace)' : 'Fuera (terraza)';
  }

  function construirUrlWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo) {
    const fechaFmt = fecha
      ? new Date(fecha + 'T00:00:00').toLocaleDateString(isEN ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long' })
      : '';
    let msg = isEN
      ? `Hi AURA! I'd like to book a table for ${personas} on ${fechaFmt} at ${hora}. Name: ${nombre}. Preference: ${zonaTipoTexto(zona, tipo)}.`
      : `¡Hola AURA! Querría reservar mesa para ${personas} personas el ${fechaFmt} a las ${hora}. Nombre: ${nombre}. Preferencia: ${zonaTipoTexto(zona, tipo)}.`;
    if (comentario) msg += isEN ? ` Note: ${comentario}` : ` Comentario: ${comentario}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  function irPorWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo) {
    window.open(construirUrlWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo), '_blank', 'noopener');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return; // el propio formulario avisa si algo no es válido (email, teléfono...)

    const data = new FormData(form);
    const nombre = (data.get('nombre') || '').trim();
    const telefono = telefonoInput ? `${prefijoSelect.value} ${telefonoInput.value}`.trim() : '';
    const email = (data.get('email') || '').trim();
    const personas = parseInt(data.get('personas'), 10);
    const fecha = data.get('fecha');
    const hora = data.get('hora');
    const zona = data.get('zona') || 'Fuera';
    const tipo = zona === 'Dentro' ? (data.get('tipo') || 'Alta') : '';
    const comentario = (data.get('comentario') || '').trim();

    // Grupos grandes: se gestionan a mano, para poder juntar mesas.
    if (personas > RESERVAS_MAX_PERSONAS_AUTOMATICO) {
      setStatus('info', isEN
        ? 'Groups over 12 people go through WhatsApp so we can arrange the tables — opening WhatsApp…'
        : 'Los grupos de más de 12 personas los gestionamos por WhatsApp para poder juntar mesas — abriendo WhatsApp…');
      irPorWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo);
      return;
    }
    // Sin Apps Script configurado todavía: mismo comportamiento que antes.
    if (!RESERVAS_APPS_SCRIPT_URL) {
      irPorWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo);
      return;
    }

    submitBtn.disabled = true;
    if (submitTxt) submitTxt.textContent = isEN ? 'Checking availability…' : 'Comprobando disponibilidad…';
    setStatus('info', isEN ? 'Checking availability…' : 'Comprobando disponibilidad…');
    ocultarWhatsappManual(); // por si quedó visible de un intento anterior

    // Si Apps Script tarda demasiado (arranque en frío, red lenta…): a los 5 s
    // avisamos de que seguimos intentándolo, y a los 10 s se cancela la espera.
    // Ojo: cancelar aquí no cancela la reserva en el servidor, que puede acabar
    // registrándose igualmente — por eso el mensaje de timeout no manda directo a WhatsApp.
    const timeoutMs = 10000;
    const controller = new AbortController();
    let agotado = false;
    const timeoutId = setTimeout(() => { agotado = true; controller.abort(); }, timeoutMs);
    const avisoId = setTimeout(() => {
      setStatus('info', isEN ? "We're still trying to confirm your booking…" : 'Estamos tratando de confirmar tu reserva…');
    }, 5000);

    fetch(RESERVAS_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita el preflight CORS de Apps Script
      body: JSON.stringify({ fecha, hora, personas, nombre, telefono, email, comentario, zona, tipo, idioma: isEN ? 'en' : 'es' }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setStatus('ok', isEN
            ? `Table confirmed for ${personas} on ${fecha} at ${hora}. See you soon!`
            : `¡Mesa confirmada para ${personas} personas el ${fecha} a las ${hora}! Te esperamos.`);
          form.reset();
          actualizarModoBoton();
          actualizarZona();
          return;
        }
        // Sin mesa automática: no abrimos WhatsApp solos. Distinguimos entre
        // "no queda nada que comprobar" (sin botón) y "puede que sí haya
        // mesas sin gestionar, o ha fallado el sistema y no lo sabemos"
        // (mostramos el contacto, pero lo pulsa la persona si quiere).
        const faltaInfoParaDecidir = res.reason !== 'sin_disponibilidad' && res.reason !== 'sin_mesas_esa_zona';
        if (res.hayMesasSinReserva || faltaInfoParaDecidir) {
          setStatus('info', faltaInfoParaDecidir
            ? (isEN
              ? "We couldn't process the reservation automatically. Contact us on WhatsApp if you'd like."
              : 'No hemos podido procesar la reserva automáticamente. Contáctanos por WhatsApp si quieres.')
            : (isEN
              ? "We couldn't confirm a table automatically for that time, but there may still be tables free that we don't manage online — contact us and we'll check."
              : 'No hemos podido confirmar mesa automática para esa hora, pero puede que aún queden mesas libres que no gestionamos online — contáctanos y lo comprobamos.'));
          mostrarWhatsappManual(construirUrlWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo));
        } else {
          setStatus('error', isEN
            ? 'There is no availability for that time. Try a different time or date.'
            : 'No hay disponibilidad para esa hora. Prueba con otra hora o fecha.');
        }
      })
      .catch(() => {
        setStatus('info', agotado
          ? (isEN
            ? "We couldn't confirm your booking in time, but it may have gone through. If you don't get a confirmation email in a few minutes, contact us on WhatsApp."
            : 'No hemos podido confirmar la reserva a tiempo, pero puede que se haya registrado. Si en unos minutos no te llega el correo de confirmación, contáctanos por WhatsApp.')
          : (isEN
            ? "We couldn't reach the booking system. Contact us on WhatsApp if you'd like."
            : 'No hemos podido conectar con el sistema de reservas. Contáctanos por WhatsApp si quieres.'));
        mostrarWhatsappManual(construirUrlWhatsapp(nombre, personas, fecha, hora, comentario, zona, tipo));
      })
      .finally(() => {
        clearTimeout(timeoutId);
        clearTimeout(avisoId);
        submitBtn.disabled = false;
        actualizarModoBoton();
      });
  });
})();

// ---------- Talleres (data-driven desde talleres.json) ----------
// Pega aquí la URL de "Publicar en la web" (formato CSV) de la Google Sheet
// de Talleres: en la Sheet, Archivo > Compartir > Publicar en la web >
// selecciona la pestaña > formato "Valores separados por comas (.csv)" > Publicar.
// Mientras esté vacía, se usa talleres.json como fuente local.
const TALLERES_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/131CPxEHaCQD9SlgxJxuSr0AhGdZZLcna359Uv4-XitY/export?format=csv&gid=1547456886';

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
  // Cabeceras en minúsculas: así da igual si en la Sheet se escriben
  // "Plazas", "PLAZAS" o "plazas" — el código siempre las lee igual.
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
}

// Normaliza enlaces de Google Drive (cualquier formato que dé "Copiar enlace")
// a una URL de imagen directa, usable en <img>/background-image.
function normalizeImageUrl(url) {
  if (!url) return '';
  url = url.trim();
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w1200` : url;
}

// Mismo ID que usa el horneado (scripts/bake-content.mjs) para cachear la
// foto en images/talleres/. Si ya está horneada, se usa esa copia propia en
// vez de pedirle la imagen a Google directamente desde el navegador —
// algunos bloqueadores de anuncios/extensiones de privacidad impiden
// incrustar imágenes de googleusercontent.com como <img>, aunque el enlace
// funcione perfectamente si se abre directamente.
function driveFileId(url) {
  if (!url) return null;
  const m = url.trim().match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  return m ? m[1] : null;
}

// Formatea una fecha "dd/mm/aaaa" (la que da Google Sheets) a algo legible.
function formatFecha(raw) {
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

// De todos los talleres publicados, se queda con los que aún no han
// pasado (ordenados por fecha) + el último que ya se hizo (si lo hay).
// Los que no tienen fecha (compatibilidad con talleres.json) se muestran
// siempre, al final.
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

// Construye el subtítulo a partir de columnas sueltas (fecha, hora, plazas)
// si existen; si no, usa la columna de texto libre subtitulo/subtitulo_en.
function buildSubtitulo(t) {
  const partes = [];
  if (t.fecha) partes.push(formatFecha(t.fecha));
  if (t.hora) partes.push(t.hora);
  if (t.plazas) partes.push(isEN ? `${t.plazas} spots` : `${t.plazas} plazas`);
  if (partes.length) return partes.join(' · ');
  return isEN ? (t.subtitulo_en || t.subtitulo || '') : (t.subtitulo || '');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const WHATSAPP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2c-5.4 0-9.8 4.4-9.8 9.8 0 1.7.5 3.4 1.3 4.9L2 22l5.2-1.4c1.4.8 3.1 1.2 4.8 1.2 5.4 0 9.8-4.4 9.8-9.8s-4.4-9.8-9.8-9.8zm0 17.9c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3c-.8-1.3-1.3-2.9-1.3-4.5 0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.4-8.2 8.4zm4.5-6.2c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.3-.4.1-.1.2-.2.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9 0 1.1.8 2.2.9 2.4.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3z"/></svg>';
const WHATSAPP_NUMBER_TALLERES = '34612422574';

(function () {
  const grid = document.getElementById('talleresGrid');
  if (!grid) return;

  let imageMap = {};

  function paint(items) {
    const visibles = items.filter((t) => String(t.publicar || 'si').toLowerCase() !== 'no');
    if (!visibles.length) throw new Error('sin talleres publicados');
    const seleccion = seleccionarTalleres(visibles);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    grid.innerHTML = seleccion.map((t) => {
      const titulo = isEN ? (t.titulo_en || t.titulo) : t.titulo;
      const subtitulo = buildSubtitulo(t);
      const texto = isEN ? (t.texto_en || t.texto) : t.texto;
      const fileId = driveFileId(t.imagen);
      const imagen = (fileId && imageMap[fileId]) || normalizeImageUrl(t.imagen);
      const fecha = parseFechaDate(t.fecha);
      const pasado = fecha && fecha < hoy;
      const cuando = fecha ? `${formatFecha(t.fecha)}${t.hora ? ' · ' + t.hora : ''}` : '';
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
      const imgTag = imagen
        ? `<img src="${imagen}" alt="${escapeHtml(titulo)}" loading="lazy" onerror="if(!this.dataset.retried){this.dataset.retried='1';this.src=this.src+'?r='+Date.now();}else{this.remove();this.parentElement.classList.remove('has-image');}" />`
        : '';
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

    grid.querySelectorAll('.taller__stepper').forEach((stepper) => {
      const input = stepper.querySelector('input');
      stepper.querySelectorAll('.taller__step').forEach((btn) => {
        btn.addEventListener('click', () => {
          const min = +input.min || 1;
          const max = +input.max || 99;
          const next = (+input.value || min) + (+btn.dataset.dir);
          input.value = Math.min(max, Math.max(min, next));
        });
      });
    });

    grid.querySelectorAll('.taller__open').forEach((openBtn) => {
      openBtn.addEventListener('click', () => {
        const form = openBtn.nextElementSibling;
        openBtn.hidden = true;
        form.hidden = false;
        form.querySelector('input')?.focus();
      });
    });

    grid.querySelectorAll('.taller__apuntarse').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const personas = new FormData(form).get('personas');
        const titulo = form.dataset.titulo;
        const cuando = form.dataset.cuando;
        const lineas = isEN
          ? ['Hi AURA,', '', `I'd like to join the event *${titulo}*.`, cuando ? `Date: ${cuando}` : null, `People: ${personas}`, '', 'Could you confirm my spot?']
          : ['Hola AURA,', '', `Quiero apuntarme al evento *${titulo}*.`, cuando ? `Fecha: ${cuando}` : null, `Personas: ${personas}`, '', '¿Podéis confirmarme la plaza?'];
        const msg = lineas.filter((l) => l !== null).join('\n');
        window.open(`https://wa.me/${WHATSAPP_NUMBER_TALLERES}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      });
    });
  }

  function fromSheet() {
    const sep = TALLERES_SHEET_CSV_URL.includes('?') ? '&' : '?';
    return fetch(`${TALLERES_SHEET_CSV_URL}${sep}v=${Date.now()}`)
      .then((r) => { if (!r.ok) throw new Error('sheet no disponible'); return r.text(); })
      .then(csvToObjects);
  }
  function fromLocalJson() {
    return fetch('talleres.json').then((r) => r.json());
  }
  function showEmpty() {
    grid.innerHTML = `<p class="talleres__empty">${isEN ? 'Workshops coming soon.' : 'Muy pronto, nuevos talleres.'}</p>`;
  }

  function fetchImageMap() {
    return fetch('talleres-images.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }

  fetchImageMap().then((map) => {
    imageMap = map;
    const load = TALLERES_SHEET_CSV_URL ? fromSheet : fromLocalJson;
    load()
      .then(paint)
      .catch(() => {
        if (TALLERES_SHEET_CSV_URL) fromLocalJson().then(paint).catch(showEmpty);
        else showEmpty();
      });
  });
})();

// ---------- Carta (opcional, data-driven desde Google Sheets) ----------
// Pega aquí la URL de exportación CSV de la Sheet de la carta (mismo
// procedimiento que TALLERES_SHEET_CSV_URL: Compartir > Cualquiera con el
// enlace > Lector, y usar .../export?format=csv&gid=...).
// Mientras esté vacía, la carta se queda tal cual está escrita en el HTML
// (no se toca nada) — esto es 100% opcional y no puede romper la carta actual.
const CARTA_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1PHh0xQYdxf3YcuI2_vE2Y6lAO_Az22scKLOVm3EwilY/export?format=csv&gid=1254248669';

(function () {
  if (!CARTA_SHEET_CSV_URL) return;

  const menuEl = document.querySelector('.menu');
  const tabsWrap = document.querySelector('.menu__tabs');
  if (!menuEl || !tabsWrap) return;

  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'cat';
  }

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

  function cartaImgAttr(it) {
    const m = (it.imagen || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
    return m ? ` data-img="images/carta/${m[1]}.jpg" data-img-remote="https://lh3.googleusercontent.com/d/${m[1]}=w1200"` : '';
  }

  function menuItemId(usedIds, categoriaId, nombreOriginal) {
    const base = `plato-${categoriaId}-${slugify(nombreOriginal)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) { id = `${base}-${n}`; n++; }
    usedIds.add(id);
    return id;
  }

  function renderCarta(rows) {
    const visibles = rows.filter((r) => String(r.publicar || 'si').toLowerCase() !== 'no');
    if (!visibles.length) throw new Error('carta vacía');

    // Agrupar por categoría > subcategoría, preservando orden_categoria / orden.
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

    tabsWrap.innerHTML = categorias.map((cat, i) => `
      <button class="menu__tab${i === 0 ? ' is-active' : ''}" data-tab="${cat.id}" role="tab">${escapeHtml(cat.nombre)}</button>`
    ).join('');

    menuEl.querySelectorAll('.menu__panel').forEach((p) => p.remove());
    const legal = menuEl.querySelector('.menu__legal');
    const usedIds = new Set();
    categorias.forEach((cat, i) => {
      const panel = document.createElement('div');
      panel.className = 'menu__panel' + (i === 0 ? ' is-active' : '');
      panel.dataset.panel = cat.id;
      let html = '';
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
      html += '</div>';
      panel.innerHTML = html;
      menuEl.insertBefore(panel, legal || null);
    });

    bindMenuTabs();
    aplicarFiltrosCarta();
    abrirFichaDesdeHash();
  }

  function bindMenuTabs() {
    const tabs = menuEl.querySelectorAll('.menu__tab');
    const panels = menuEl.querySelectorAll('.menu__panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab));
      });
    });
  }

  const sep = CARTA_SHEET_CSV_URL.includes('?') ? '&' : '?';
  fetch(`${CARTA_SHEET_CSV_URL}${sep}v=${Date.now()}`)
    .then((r) => { if (!r.ok) throw new Error('carta sheet no disponible'); return r.text(); })
    .then(csvToObjects)
    .then(renderCarta)
    .catch(() => { /* si algo falla, se queda la carta estática del HTML tal cual */ });
})();


// ---------- Eventos: pestañas Talleres / Proponer + formulario por WhatsApp ----------
(function () {
  const tabs = document.querySelectorAll('.eventos__tab');
  const panels = document.querySelectorAll('.eventos__panel');
  if (!tabs.length) return;
  function mostrar(nombre) {
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.panel === nombre));
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === nombre));
  }
  tabs.forEach((t) => t.addEventListener('click', () => mostrar(t.dataset.panel)));
  if (location.hash === '#proponer') mostrar('proponer');

  const form = document.getElementById('proponerForm');
  const status = document.getElementById('proponerStatus');
  if (!form) return;

  initDatePicker(document.getElementById('proponerFechaTxt'), document.getElementById('proponerFecha'));
  const propPrefijo = document.getElementById('proponerPrefijo');
  const propTelefono = document.getElementById('proponerTelefono');
  initTelefono(propPrefijo, propTelefono);

  // Horas cada 30 min, de 16:00 a 20:00 (los eventos son a partir de las 16:00).
  const horaSel = document.getElementById('proponerHora');
  for (let h = 16; h <= 20; h += 0.5) {
    const txt = `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
    horaSel.add(new Option(txt, txt));
  }

  // Personas: de 6 a 50 y "50+" (grupos de menos se reservan como mesa).
  const persSel = document.getElementById('proponerPersonas');
  for (let n = 6; n <= 50; n++) persSel.add(new Option(String(n), String(n)));
  persSel.add(new Option('50+', '50+'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = new FormData(form);
    const v = (k) => (d.get(k) || '').toString().trim();
    if (!v('fecha')) {
      status.className = 'reservas__status reservas__status--error';
      status.textContent = isEN ? 'Please pick a date.' : 'Elige una fecha.';
      status.hidden = false;
      return;
    }
    const privado = v('tipo') === 'privado';
    const L = isEN
      ? { hi: "Hi AURA! I'd like to get in touch about an event.", t: 'Request', tv: privado ? 'Book the venue privately (from 4pm)' : 'Suggest an activity open to the public', n: 'Name', c: 'Phone', a: 'Activity', f: 'Date and time', p: 'People', d: 'Idea' }
      : { hi: '¡Hola AURA! Me gustaría hablar con vosotros sobre un evento.', t: 'Solicitud', tv: privado ? 'Reservar el espacio en privado (a partir de las 16:00)' : 'Proponer una actividad abierta al público', n: 'Nombre', c: 'Teléfono', a: 'Actividad', f: 'Fecha y hora', p: 'Personas', d: 'Propuesta' };
    const lineas = [L.hi, `${L.t}: ${L.tv}`, `${L.n}: ${v('nombre')}`, `${L.c}: ${propPrefijo.value} ${propTelefono.value}`, `${L.a}: ${v('actividad')}`];
    const [y, m, dd] = v('fecha').split('-');
    lineas.push(`${L.f}: ${dd}/${m}/${y} ${v('hora')}`);
    lineas.push(`${L.p}: ${v('personas')}`);
    lineas.push(`${L.d}: ${v('descripcion')}`);
    const url = `https://wa.me/34612422574?text=${encodeURIComponent(lineas.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
    status.className = 'reservas__status reservas__status--ok';
    status.innerHTML = isEN
      ? `Opening WhatsApp with your proposal… if it doesn't open, <a href="${url}" target="_blank" rel="noopener">tap here</a>.`
      : `Abriendo WhatsApp con tu propuesta… si no se abre, <a href="${url}" target="_blank" rel="noopener">pulsa aquí</a>.`;
    status.hidden = false;
  });
})();
