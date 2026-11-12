// Pantalla del TV: muestra las fotos aprobadas en bucle, con transiciones suaves.
// Prioriza las fotos nuevas (aún no vistas) y obedece los comandos del panel admin.
import {
  aplicarEvento, crearDatos, limitarIntervalo, formatearTiempo, escaparHTML, enModoDemo,
} from './comun.js';

const ESQUINA_SVG = `<svg viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <path d="M4 56V20C4 10 10 4 20 4h36"/><path d="M12 56V24c0-7 5-12 12-12h32" opacity=".55"/>
  <circle cx="20" cy="20" r="3.2" fill="currentColor" stroke="none"/></svg>`;

const CAMARA_SVG = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <rect x="6" y="18" width="52" height="36" rx="5"/><path d="M22 18l4-7h12l4 7"/><circle cx="32" cy="36" r="10"/></svg>`;

const ICONO_AMPLIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICONO_REDUCIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

export async function iniciarPantalla(config) {
  aplicarEvento(config);
  document.title = `${config.nombres} · Pantalla`;
  crearDestellos();
  activarPantallaCompleta();
  ocultarCursorInactivo();
  mantenerPantallaEncendida();

  const datos = await crearDatos(config);
  const params = new URLSearchParams(location.search);
  const segundosDemo = enModoDemo() && Number(params.get('seg'));

  const escenario = document.querySelector('.escenario');
  const capas = [crearCapa(escenario), crearCapa(escenario)];
  let capaActiva = 0;

  const indicador = document.querySelector('.indicador');
  const barra = indicador.querySelector('.indicador__barra span');
  const textoIndicador = indicador.querySelector('.indicador__texto');

  // ---- Estado ----
  let fotos = []; // aprobadas, en orden de aprobación
  const mapa = new Map();
  const vistas = new Set();
  const historial = [];
  const cache = new Map(); // fotoId -> dataURL (máx. 20)
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
  function htmlMensaje(foto) {
    const msg = (foto.mensaje || '').trim();
    const nombre = (foto.nombre || '').trim();
    if (msg) {
      return `<div class="mensaje">
        <span class="mensaje__comilla" aria-hidden="true">“</span>
        <p class="mensaje__texto">${escaparHTML(msg)}</p>
        ${nombre ? `<p class="mensaje__autor">— ${escaparHTML(nombre)}</p>` : ''}
        <div class="ornamento" aria-hidden="true"><span></span></div>
      </div>`;
    }
    return `<div class="mensaje mensaje--vacio">
      <p class="mensaje__grande texto-oro">${escaparHTML(config.mensajeVacio)}</p>
      ${nombre ? `<p class="mensaje__autor">Con cariño, ${escaparHTML(nombre)}</p>` : ''}
    </div>`;
  }

  function pintarCapa(capa, foto, src) {
    const nombre = foto?.nombre ? `Foto enviada por ${foto.nombre}` : 'Foto de la celebración';
    capa.marco.querySelector('.marco__interior').innerHTML = foto
      ? `<img class="marco__fondo" src="${src}" alt="" aria-hidden="true">
         <img class="marco__foto" src="${src}" alt="${escaparHTML(nombre)}">`
      : `<div class="marco__vacio">${CAMARA_SVG}<span>${escaparHTML(config.textoSinFotos)}</span></div>`;
    capa.lado.innerHTML = foto ? htmlMensaje(foto) : htmlMensaje({ mensaje: '', nombre: '' });
    capa.el.style.setProperty('--duracion', `${intervaloMs / 1000 + 4}s`);
  }

  function activar(capaNueva) {
    const vieja = capas[capaActiva];
    capaActiva = capas.indexOf(capaNueva);
    // Reinicia las animaciones de entrada
    capaNueva.el.classList.remove('activa');
    void capaNueva.el.offsetWidth;
    capaNueva.el.classList.add('activa');
    vieja.el.classList.remove('activa');
    ajustarTextos(capaNueva.el);
  }

  function mostrarVacio() {
    actualId = null;
    const capa = capas[1 - capaActiva];
    pintarCapa(capa, null);
    activar(capa);
  }

  async function mostrar(id, { desdeHistorial = false } = {}) {
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
      barra.style.width = `${(1 - restante / intervaloMs) * 100}%`;
      textoIndicador.textContent = 'En pausa';
      return;
    }
    const quedan = finEn - Date.now();
    if (quedan <= 0) { avanzar(); return; }
    barra.style.width = `${(1 - quedan / intervaloMs) * 100}%`;
    textoIndicador.textContent = `Siguiente foto en ${formatearTiempo(quedan)}`;
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
    fotos = lista.sort((a, b) =>
      (a.aprobadaEn ?? Infinity) - (b.aprobadaEn ?? Infinity)
      || (a.creadaEn ?? 0) - (b.creadaEn ?? 0)
      || (a.grupoIndice ?? 0) - (b.grupoIndice ?? 0));
    mapa.clear();
    fotos.forEach((f) => mapa.set(f.id, f));

    if (!fotos.length) { if (actualId || !capas[capaActiva].el.classList.contains('activa')) mostrarVacio(); return; }
    if (!actualId) { mostrar(siguienteId()); return; }
    if (!mapa.has(actualId)) { mostrar(siguienteId()); return; }
    // Si el admin editó el mensaje de la foto que está en pantalla, se actualiza en vivo.
    const actual = mapa.get(actualId);
    if ((actual.mensaje || '') !== mostradoMensaje) {
      mostradoMensaje = actual.mensaje || '';
      const capa = capas[capaActiva];
      capa.lado.innerHTML = htmlMensaje(actual);
      ajustarTextos(capa.el);
    }
  });

  // Atajos de teclado discretos (por si el TV es un portátil): ← → espacio
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') avanzar();
    else if (e.key === 'ArrowLeft') retroceder();
    else if (e.key === ' ') { e.preventDefault(); pausar(!pausado); }
    else if (e.key.toLowerCase() === 'f') alternarPantallaCompleta();
  });

  // Estado inicial mientras llegan los datos
  mostrarVacio();
  document.fonts?.ready.then(() => ajustarTextos(capas[capaActiva].el));
  window.addEventListener('resize', () => ajustarTextos(capas[capaActiva].el));
}

// ---------- Ayudantes de interfaz ----------

function crearCapa(escenario) {
  const el = document.createElement('section');
  el.className = 'diapositiva';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<figure class="marco" style="margin:0">
      <div class="marco__interior"></div>
      <span class="esquina esquina--si">${ESQUINA_SVG}</span><span class="esquina esquina--sd">${ESQUINA_SVG}</span>
      <span class="esquina esquina--ii">${ESQUINA_SVG}</span><span class="esquina esquina--id">${ESQUINA_SVG}</span>
    </figure><div class="lado"></div>`;
  escenario.appendChild(el);
  const lado = el.querySelector('.lado');
  lado.style.height = '100%';
  lado.style.minWidth = '0';
  return { el, marco: el.querySelector('.marco'), lado };
}

/** Reduce la letra hasta que el texto quepa en su caja. */
function ajustarTextos(raiz) {
  const ajustar = (el, maxVh, minVh) => {
    if (!el) return;
    const vh = window.innerHeight / 100;
    let tam = maxVh;
    el.style.fontSize = `${tam * vh}px`;
    const contenedor = el.parentElement;
    const cabe = () => el.scrollHeight <= el.clientHeight + 1
      && el.scrollWidth <= el.clientWidth + 1
      && contenedor.scrollHeight <= contenedor.clientHeight + 1;
    while (!cabe() && tam > minVh) {
      tam -= 0.25;
      el.style.fontSize = `${tam * vh}px`;
    }
  };
  ajustar(raiz.querySelector('.mensaje__texto'), 5.6, 2.2);
  ajustar(raiz.querySelector('.mensaje__grande'), 10, 3);
}

function crearDestellos() {
  const cont = document.querySelector('.destellos');
  if (!cont) return;
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.setProperty('--d', `${5 + Math.random() * 7}s`);
    p.style.setProperty('--r', `${-Math.random() * 10}s`);
    cont.appendChild(p);
  }
}

function alternarPantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function activarPantallaCompleta() {
  const btn = document.querySelector('.btn-pantalla-completa');
  if (!btn) return;
  const pintar = () => {
    const activa = Boolean(document.fullscreenElement);
    btn.innerHTML = activa ? ICONO_REDUCIR : ICONO_AMPLIAR;
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
    }, 2500);
  };
  ['mousemove', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, mover, { passive: true }));
  document.body.classList.add('cursor-oculto');
}

async function mantenerPantallaEncendida() {
  if (!('wakeLock' in navigator)) return;
  const pedir = async () => { try { await navigator.wakeLock.request('screen'); } catch {} };
  await pedir();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedir(); });
}
