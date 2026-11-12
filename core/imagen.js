// Comprime las fotos en el celular antes de subirlas (cada una queda < ~750 KB).
// Usa WebP cuando el navegador lo permite y JPEG si no.

async function decodificar(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    return new Promise((resolver, rechazar) => {
      const img = new Image();
      const url = URL.createObjectURL(archivo);
      img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('formato')); };
      img.src = url;
    });
  }
}

let soportaWebp = null;
function formatoSalida() {
  if (soportaWebp === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    soportaWebp = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return soportaWebp ? 'image/webp' : 'image/jpeg';
}

function dibujar(fuente, ladoMax, calidad) {
  const w = fuente.width;
  const h = fuente.height;
  const escala = Math.min(1, ladoMax / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * escala);
  c.height = Math.round(h * escala);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fuente, 0, 0, c.width, c.height);
  return c.toDataURL(formatoSalida(), calidad);
}

function ajustar(fuente, ladoInicial, limite, calidadInicial) {
  let lado = ladoInicial;
  let calidad = calidadInicial;
  let resultado = dibujar(fuente, lado, calidad);
  for (let i = 0; i < 10 && resultado.length > limite; i++) {
    if (calidad > 0.6) calidad -= 0.1;
    else lado = Math.round(lado * 0.8);
    resultado = dibujar(fuente, lado, calidad);
  }
  return resultado;
}

// ---------- Fotos de iPhone (HEIC/HEIF, incluidas las Live Photos) ----------
// Safari las abre solo; Chrome/Android/Windows no, así que las convertimos a JPEG
// con heic2any (se descarga solo si hace falta). De una Live Photo se toma la foto fija.

const HEIC_CDN = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
let promesaHeic = null;
function cargarHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!promesaHeic) {
    promesaHeic = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = HEIC_CDN;
      s.onload = () => (window.heic2any ? ok(window.heic2any) : mal(new Error('heic2any')));
      s.onerror = () => { promesaHeic = null; mal(new Error('heic2any')); };
      document.head.appendChild(s);
    });
  }
  return promesaHeic;
}

export function esVideo(archivo) {
  return /^video\//i.test(archivo.type) || /\.(mov|mp4|m4v|3gp|webm)$/i.test(archivo.name);
}

export async function esHeic(archivo) {
  if (/image\/hei[cf]/i.test(archivo.type) || /\.(heic|heif)$/i.test(archivo.name)) return true;
  try {
    const bytes = new Uint8Array(await archivo.slice(4, 12).arrayBuffer());
    const marca = String.fromCharCode.apply(null, bytes);
    return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(marca);
  } catch (e) { return false; }
}

async function navegadorLaAbre(archivo) {
  try {
    const bmp = await createImageBitmap(archivo);
    if (bmp.close) bmp.close();
    return true;
  } catch (e) {
    return new Promise((ok) => {
      const img = new Image();
      const url = URL.createObjectURL(archivo);
      img.onload = () => { URL.revokeObjectURL(url); ok(true); };
      img.onerror = () => { URL.revokeObjectURL(url); ok(false); };
      img.src = url;
    });
  }
}

/** Devuelve un archivo que el navegador puede mostrar (convierte HEIC si hace falta). */
export async function normalizarArchivo(archivo) {
  if (!(await esHeic(archivo))) return archivo;
  if (await navegadorLaAbre(archivo)) return archivo;
  const heic2any = await cargarHeic2any();
  let resultado = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.9 });
  if (Array.isArray(resultado)) resultado = resultado[0]; // Live Photo / ráfaga: primera imagen
  const nombre = archivo.name.replace(/\.(heic|heif)$/i, '') + '.jpg';
  try { return new File([resultado], nombre, { type: 'image/jpeg' }); } catch (e) { return resultado; }
}

export async function prepararImagen(archivo, { ladoMax = 1600, limite = 750_000 } = {}) {
  const fuente = await decodificar(archivo);
  const imagen = ajustar(fuente, ladoMax, limite, 0.85);
  const miniatura = ajustar(fuente, 360, 60_000, 0.7);
  const datos = { imagen, miniatura, ancho: fuente.width, alto: fuente.height };
  fuente.close?.();
  return datos;
}
