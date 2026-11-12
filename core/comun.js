// Utilidades compartidas por todas las páginas de un evento.

export const enModoDemo = () => new URLSearchParams(location.search).has('demo');

/** Aplica textos y colores del evento (evento.config.js) a la página. */
export function aplicarEvento(config) {
  const raiz = document.documentElement;
  const tema = config.tema || {};
  const mapaVars = {
    fondo: '--fondo',
    oro: '--oro',
    oroClaro: '--oro-claro',
    oroOscuro: '--oro-oscuro',
    texto: '--texto',
  };
  for (const [clave, variable] of Object.entries(mapaVars)) {
    if (tema[clave]) raiz.style.setProperty(variable, tema[clave]);
  }
  const aRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  };
  if (aRgb(tema.oro)) raiz.style.setProperty('--oro-rgb', aRgb(tema.oro));
  if (aRgb(tema.texto)) {
    raiz.style.setProperty('--texto-rgb', aRgb(tema.texto));
    raiz.style.setProperty('--texto-suave', `rgba(${aRgb(tema.texto)}, .72)`);
  }
  document.querySelectorAll('[data-texto]').forEach((el) => {
    const valor = config[el.dataset.texto];
    if (typeof valor === 'string') el.textContent = valor;
  });
}

/** Carga la capa de datos: Firebase en producción, simulada con ?demo. */
export async function crearDatos(config) {
  const modulo = enModoDemo()
    ? await import('./datos-demo.js')
    : await import('./datos-firebase.js');
  return modulo.crearDatos(config.id, config);
}

export const limitarIntervalo = (seg) => Math.min(120, Math.max(60, Number(seg) || 90));

export function formatearTiempo(ms, dosDigitos = false) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = dosDigitos ? String(Math.floor(total / 60)).padStart(2, '0') : Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function escaparHTML(texto = '') {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function idAleatorio() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Botón sol/luna para páginas de invitados y admin (no se usa en el TV). */
export function activarInterruptorTema(boton) {
  if (!boton) return;
  const clave = 'bm-tema';
  const aplicar = (tema) => {
    document.body.dataset.tema = tema;
    boton.textContent = tema === 'claro' ? '☾' : '☀';
    boton.setAttribute('aria-label', tema === 'claro' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  };
  let actual = 'oscuro';
  try { actual = localStorage.getItem(clave) || 'oscuro'; } catch {}
  aplicar(actual);
  boton.addEventListener('click', () => {
    actual = actual === 'claro' ? 'oscuro' : 'claro';
    aplicar(actual);
    try { localStorage.setItem(clave, actual); } catch {}
  });
}
