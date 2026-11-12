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

export async function prepararImagen(archivo, { ladoMax = 1600, limite = 750_000 } = {}) {
  const fuente = await decodificar(archivo);
  const imagen = ajustar(fuente, ladoMax, limite, 0.85);
  const miniatura = ajustar(fuente, 360, 60_000, 0.7);
  const datos = { imagen, miniatura, ancho: fuente.width, alto: fuente.height };
  fuente.close?.();
  return datos;
}
