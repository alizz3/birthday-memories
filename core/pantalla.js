// Pantalla del TV: muestra las fotos aprobadas en bucle, con transiciones suaves.
// Prioriza las fotos nuevas (aún no vistas) y obedece los comandos del panel admin.
// Evita JavaScript muy moderno: los navegadores de algunos televisores son viejos.
import {
  aplicarEvento, crearDatos, limitarIntervalo, formatearTiempo, escaparHTML, enModoDemo,
} from './comun.js';

const SVG = {
  corazon: '<svg viewBox="0 0 48 44" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40C17 34 4 26 4 14.5 4 8 8.8 4 14 4c4.4 0 7.8 2.6 10 6.4C26.2 6.6 29.6 4 34 4c5.2 0 10 4 10 10.5C44 26 31 34 24 40z"/></svg>',
  trazos: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M30 6l-6 12M37 20l-12 2M33 32l-10-6"/></svg>',
  trazo: '<svg viewBox="0 0 400 24" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 20C120 6 260 2 396 10" stroke-width="3"/><path d="M60 18C160 9 260 7 340 10" stroke-width="1.2" opacity=".6"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2.5"/></svg>',
  camara: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="6" y="18" width="52" height="36" rx="6"/><path d="M22 18l4-7h12l4 7"/><circle cx="32" cy="36" r="10"/></svg>',
  ampliar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  reducir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};
const GIROS = ['-3deg', '-1.5deg', '2deg', '-2.5deg', '1.5deg'];

export async function iniciarPantalla(config) {
  aplicarEvento(config);
  document.title = `${config.nombres} · Pantalla`;
  if (config.fondoImagen) {
    document.body.style.setProperty('--fondo-imagen', `url("${config.fondoImagen}")`);
  }
  document.querySelectorAll('[data-svg]').forEach((el) => { el.innerHTML = SVG[el.dataset.svg] || ''; });
  crearDestellos();
  activarPantallaCompleta();
  ocultarCursorInactivo();
  mantenerPantallaEncendida();

  const params = new URLSearchParams(location.search);
  const segundosDemo = enModoDemo() && Number(params.get('seg'));

  const zonaFoto = document.querySelector('.zona-foto');
  const zonaMensajes = document.querySelector('.mensajes');
  const capas = [crearCapa(zonaFoto, zonaMensajes), crearCapa(zonaFoto, zonaMensajes)];
  let capaActiva = 0;
  let giroIndice = 0;

  const indicador = document.querySelector('.indicador');
  const etiqueta = indicador.querySelector('.indicador__etiqueta');
  const tiempo = indicador.querySelector('.indicador__tiempo');

  // ---- Estado ----
  let fotos = []; // aprobadas, en orden de aprobación
  const mapa = new Map();
  const vistas = new Set();
  const historial = [];
  const cache = new Map(); // fotoId -> dataURL (máx. 20)
  let datos = null;
  let actualId = null;
  let mostradoMensaje = null;
  let intervaloMs = (segundosDemo || limitarIntervalo(config.intervaloSegundos)) * 1000;
  let inicioEn = Date.now();
  let finEn = Date.now() + intervaloMs;
  let pausado = false;
  let restante = 0;
  let ocupado = false;
  let pendiente = null;
  let primerEvento = true;
  let ultimoNonce = null;

  // ---- Imágenes ----
  async function cargarImagen(id) {
    if (cache.has(id)) {
      const v = cache.get(id);
      cache.delete(id); cache.set(id, v);
      return v;
    }
    const src = await datos.obtenerImagen(id);
    cache.set(id, src);
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    return src;
  }
  function precargar(src) {
    return new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => (img.decode ? img.decode().catch(() => {}).then(ok) : ok());
      img.onerror = mal;
      img.src = src;
    });
  }

  function siguienteId() {
    if (!fotos.length) return null;
    const nueva = fotos.find((f) => !vistas.has(f.id));
    if (nueva) return nueva.id;
    const i = fotos.findIndex((f) => f.id === actualId);
    return fotos[(i + 1) % fotos.length].id;
  }

  // ---- Render ----
  const textoDe = (foto, campo) => ((foto && foto[campo]) || '').trim();

  // Con mensaje: el texto va debajo del título, firmado con el nombre.
  // Sin mensaje: no hay texto y el título se agranda.
  function htmlMensaje(foto) {
    const msg = textoDe(foto, 'mensaje');
    if (!msg) return '';
    const nombre = textoDe(foto, 'nombre');
    return `<div class="mensaje"><p class="mensaje__texto">${escaparHTML(msg)}</p>
      ${nombre ? `<p class="mensaje__autor">${escaparHTML(nombre)}</p>` : ''}</div>`;
  }

  function pintarTextos(capa, foto) {
    capa.msg.innerHTML = htmlMensaje(foto);
    capa.conMensaje = Boolean(textoDe(foto, 'mensaje'));
    capa.para = textoDe(foto, 'para');
  }

  // El espacio del mensaje mide lo que mide el mensaje: así título + mensaje
  // quedan centrados a la altura de la foto, sin hueco abajo.
  function aplicarModo(capa) {
    // Foto dedicada a uno solo de los festejados: el título muestra solo ese nombre
    const nombres = document.querySelector('.titulo__nombres');
    const texto = capa.para || config.nombres;
    if (nombres.textContent !== texto) nombres.textContent = texto;
    ajustarTitulo(); // se repite en cada foto por si la letra cursiva cargó tarde (pasa en TVs)
    document.body.classList.toggle('sin-mensaje', !capa.conMensaje);
    let alto = 0;
    if (capa.conMensaje) {
      ajustarTextos(capa.msg);
      const bloque = capa.msg.querySelector('.mensaje');
      alto = Math.min(bloque ? bloque.offsetHeight : 0, window.innerHeight * 0.34);
    }
    // Mensaje corto (una o dos líneas): el título también crece para no dejar espacio vacío
    document.body.classList.toggle('titulo-grande', !capa.conMensaje || alto < window.innerHeight * 0.2);
    zonaMensajes.style.height = `${Math.ceil(alto)}px`;
  }

  function pintarCapa(capa, foto, src) {
    capa.foto.style.setProperty('--giro', GIROS[giroIndice++ % GIROS.length]);
    const alt = foto && foto.nombre ? `Foto enviada por ${foto.nombre}` : 'Foto de la celebración';
    capa.foto.innerHTML = foto
      ? `<figure class="marco"><div class="marco__recorte"><img class="marco__foto" src="${src}" alt="${escaparHTML(alt)}"></div></figure>`
      : `<figure class="marco"><div class="marco__recorte"><div class="marco__vacio">${SVG.camara}<span>${escaparHTML(config.textoSinFotos)}</span></div></div></figure>`;
    pintarTextos(capa, foto);
    capa.foto.style.setProperty('--duracion', `${intervaloMs / 1000 + 4}s`);
  }

  function activar(capaNueva) {
    const vieja = capas[capaActiva];
    capaActiva = capas.indexOf(capaNueva);
    [capaNueva.foto, capaNueva.msg].forEach((el) => {
      el.classList.remove('activa');
      void el.offsetWidth; // reinicia las animaciones de entrada
      el.classList.add('activa');
    });
    vieja.foto.classList.remove('activa');
    vieja.msg.classList.remove('activa');
    ajustarAnchoFoto(capaNueva);
    aplicarModo(capaNueva);
  }

  // La columna de la foto toma el ancho de la foto (vertical u horizontal) para que
  // foto + título queden centrados juntos en la pantalla.
  function ajustarAnchoFoto(capa) {
    const marco = capa.foto.querySelector('.marco');
    const ancho = marco ? marco.offsetWidth : 0;
    if (ancho) zonaFoto.style.width = `${Math.ceil(ancho + window.innerWidth * 0.02)}px`;
  }

  function mostrarVacio() {
    actualId = null;
    const capa = capas[1 - capaActiva];
    pintarCapa(capa, null);
    activar(capa);
  }

  async function mostrar(id, opciones) {
    const desdeHistorial = Boolean(opciones && opciones.desdeHistorial);
    if (ocupado) { pendiente = { id, desdeHistorial }; return; }
    const foto = mapa.get(id);
    if (!foto) return;
    ocupado = true;
    try {
      const src = await cargarImagen(id);
      await precargar(src);
      const capa = capas[1 - capaActiva];
      pintarCapa(capa, foto, src);
      activar(capa);
      if (actualId && !desdeHistorial && actualId !== id) {
        historial.push(actualId);
        if (historial.length > 50) historial.shift();
      }
      actualId = id;
      mostradoMensaje = foto.mensaje || '';
      vistas.add(id);
      reiniciarTemporizador();
      datos.reportarEnVivo(id, fotos.length).catch(() => {});
      const sig = siguienteId();
      if (sig && sig !== id) cargarImagen(sig).catch(() => {});
    } catch (e) {
      console.warn('No se pudo mostrar la foto', id, e);
      vistas.add(id);
      if (!actualId) setTimeout(() => { const s = siguienteId(); if (s && s !== id) mostrar(s); }, 3000);
    } finally {
      ocupado = false;
      if (pendiente) { const p = pendiente; pendiente = null; mostrar(p.id, p); }
    }
  }

  function avanzar() {
    if (!fotos.length) return;
    if (fotos.length === 1 && actualId === fotos[0].id) { reiniciarTemporizador(); return; }
    mostrar(siguienteId());
  }

  function retroceder() {
    while (historial.length) {
      const id = historial.pop();
      if (mapa.has(id) && id !== actualId) { mostrar(id, { desdeHistorial: true }); return; }
    }
  }

  // ---- Temporizador ----
  function reiniciarTemporizador() {
    inicioEn = Date.now();
    finEn = inicioEn + intervaloMs;
    restante = intervaloMs;
  }

  setInterval(() => {
    const hayFotos = actualId && fotos.length > 0;
    indicador.classList.toggle('oculto', !hayFotos);
    if (!hayFotos) return;
    if (pausado) {
      etiqueta.textContent = 'En pausa';
      tiempo.textContent = '';
      return;
    }
    const quedan = finEn - Date.now();
    if (quedan <= 0) { avanzar(); return; }
    etiqueta.textContent = 'Siguiente foto en:';
    tiempo.textContent = formatearTiempo(quedan, true);
  }, 250);

  function pausar(valor) {
    if (valor === pausado) return;
    if (valor) restante = Math.max(0, finEn - Date.now());
    else finEn = Date.now() + restante;
    pausado = valor;
    document.body.classList.toggle('pausado', valor);
  }

  function ejecutar(c) {
    if (c.tipo === 'siguiente') { if (fotos.length > 1) mostrar(siguienteId()); }
    else if (c.tipo === 'anterior') retroceder();
    else if (c.tipo === 'mostrar' && c.fotoId && mapa.has(c.fotoId)) mostrar(c.fotoId);
    else if (c.tipo === 'recargar') location.reload();
  }

  // Estado inicial mientras llegan los datos
  mostrarVacio();
  const reajustar = () => { ajustarAnchoFoto(capas[capaActiva]); ajustarTitulo(); aplicarModo(capas[capaActiva]); };
  reajustar();
  if (document.fonts) document.fonts.ready.then(reajustar);
  [1500, 4000, 10000].forEach((ms) => setTimeout(reajustar, ms));
  window.addEventListener('resize', reajustar);

  // ---- Conexión (si falla, reintenta recargando la página) ----
  try {
    datos = await crearDatos(config);
  } catch (e) {
    console.error('No se pudo conectar', e);
    setTimeout(() => location.reload(), 20000);
    return;
  }

  // ---- Suscripciones ----
  datos.escucharEvento((ev) => {
    if (!ev) return;
    if (!segundosDemo) {
      const nuevo = limitarIntervalo(ev.intervaloSegundos) * 1000;
      if (nuevo !== intervaloMs) {
        intervaloMs = nuevo;
        if (!pausado) finEn = inicioEn + intervaloMs;
        else restante = Math.min(restante, intervaloMs);
      }
    }
    pausar(Boolean(ev.pausado));
    const c = ev.comando;
    if (c && c.nonce !== ultimoNonce) {
      ultimoNonce = c.nonce;
      if (!primerEvento) ejecutar(c);
    }
    primerEvento = false;
  });

  datos.escucharAprobadas((lista) => {
    const orden = (v, porDefecto) => (v === null || v === undefined ? porDefecto : v);
    fotos = lista.sort((a, b) =>
      orden(a.aprobadaEn, Infinity) - orden(b.aprobadaEn, Infinity)
      || orden(a.creadaEn, 0) - orden(b.creadaEn, 0)
      || orden(a.grupoIndice, 0) - orden(b.grupoIndice, 0));
    mapa.clear();
    fotos.forEach((f) => mapa.set(f.id, f));

    if (!fotos.length) { if (actualId) mostrarVacio(); return; }
    if (!actualId || !mapa.has(actualId)) { mostrar(siguienteId()); return; }
    // Si el admin editó el mensaje o el «para quién» de la foto en pantalla, se actualiza en vivo.
    const actual = mapa.get(actualId);
    if ((actual.mensaje || '') !== mostradoMensaje || (actual.para || '') !== (capas[capaActiva].para || '')) {
      mostradoMensaje = actual.mensaje || '';
      const capa = capas[capaActiva];
      pintarTextos(capa, actual);
      aplicarModo(capa);
    }
  });

  // Atajos de teclado discretos (por si el TV es un portátil): ← → espacio F
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') avanzar();
    else if (e.key === 'ArrowLeft') retroceder();
    else if (e.key === ' ') { e.preventDefault(); pausar(!pausado); }
    else if (e.key && e.key.toLowerCase() === 'f') alternarPantallaCompleta();
  });
}

// ---------- Ayudantes de interfaz ----------

function crearCapa(zonaFoto, zonaMensajes) {
  const foto = document.createElement('div');
  foto.className = 'foto-capa';
  zonaFoto.appendChild(foto);
  const msg = document.createElement('div');
  msg.className = 'msg-capa';
  zonaMensajes.appendChild(msg);
  return { foto, msg };
}

/** Reduce la letra del mensaje hasta que quepa (con el nombre) en su espacio. */
function ajustarTextos(capaMsg) {
  const el = capaMsg.querySelector('.mensaje__texto');
  if (!el) return;
  const bloque = capaMsg.querySelector('.mensaje');
  const vh = window.innerHeight / 100;
  const alto = 34 * vh;
  let tam = 4.6;
  el.style.fontSize = `${tam * vh}px`;
  while ((bloque.offsetHeight > alto + 1 || el.scrollWidth > el.clientWidth + 1) && tam > 2.4) {
    tam -= 0.2;
    el.style.fontSize = `${tam * vh}px`;
  }
}

/** Achica el título y los nombres si no caben en su columna (nombres largos). */
function ajustarTitulo() {
  const zona = document.querySelector('.zona-texto');
  if (!zona) return;
  const ancho = zona.clientWidth;
  const vh = window.innerHeight / 100;
  // Un solo nombre corto (ej. «Cata») puede ir más grande
  const nombreCorto = (document.querySelector('.titulo__nombres').textContent || '').length <= 10;
  [['.titulo__nombres', nombreCorto ? 15 : 11.5, 6, 0], ['.titulo__feliz', 7.5, 4, 12 * vh]].forEach(([sel, max, min, extra]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    let tam = max;
    el.style.fontSize = `${tam * vh}px`;
    while (el.scrollWidth + extra > ancho && tam > min) {
      tam -= 0.25;
      el.style.fontSize = `${tam * vh}px`;
    }
  });
  // Cuánto puede crecer el título cuando la foto no trae mensaje (sin salirse de la columna)
  const titulo = document.querySelector('.titulo');
  // Ancho real del texto (sin contar el escalado que pueda tener en ese momento)
  const escalaActual = titulo.getBoundingClientRect().width / (titulo.offsetWidth || 1) || 1;
  const rango = document.createRange();
  rango.selectNodeContents(document.querySelector('.titulo__nombres'));
  const anchoNombres = rango.getBoundingClientRect().width / escalaActual;
  const anchoFila = Array.prototype.reduce.call(
    document.querySelector('.titulo__fila').children,
    (suma, hijo) => suma + hijo.offsetWidth + 2 * parseFloat(getComputedStyle(hijo).marginLeft || 0),
    0,
  );
  const anchoTitulo = Math.max(anchoNombres, anchoFila);
  const escala = Math.max(1, Math.min(1.4, (ancho * 0.95) / (anchoTitulo || ancho)));
  titulo.style.setProperty('--escala-grande', escala.toFixed(3));
}

function crearDestellos() {
  const cont = document.querySelector('.destellos');
  if (!cont) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.setProperty('--d', `${5 + Math.random() * 7}s`);
    p.style.setProperty('--r', `${-Math.random() * 10}s`);
    cont.appendChild(p);
  }
}

function alternarPantallaCompleta() {
  if (document.fullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function activarPantallaCompleta() {
  const btn = document.querySelector('.btn-pantalla-completa');
  if (!btn) return;
  const pintar = () => {
    const activa = Boolean(document.fullscreenElement);
    btn.innerHTML = activa ? SVG.reducir : SVG.ampliar;
    btn.setAttribute('aria-label', activa ? 'Salir de pantalla completa' : 'Pantalla completa');
    btn.title = btn.getAttribute('aria-label');
  };
  btn.addEventListener('click', alternarPantallaCompleta);
  document.addEventListener('fullscreenchange', pintar);
  pintar();
}

function ocultarCursorInactivo() {
  let t;
  const mover = () => {
    document.body.classList.remove('cursor-oculto');
    document.body.classList.add('mostrar-controles');
    clearTimeout(t);
    t = setTimeout(() => {
      document.body.classList.add('cursor-oculto');
      document.body.classList.remove('mostrar-controles');
    }, 3000);
  };
  ['mousemove', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, mover, { passive: true }));
  document.body.classList.add('cursor-oculto');
}

async function mantenerPantallaEncendida() {
  if (!('wakeLock' in navigator)) return;
  const pedir = async () => { try { await navigator.wakeLock.request('screen'); } catch (e) { /* sin soporte */ } };
  await pedir();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedir(); });
}
