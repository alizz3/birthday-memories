// Página de invitados: nombre + una o varias fotos + mensaje compartido o uno por foto.
import { aplicarEvento, crearDatos, idAleatorio, activarInterruptorTema } from './comun.js';
import { prepararImagen, normalizarArchivo, esVideo } from './imagen.js';

export async function iniciarEnvio(config) {
  aplicarEvento(config);
  activarInterruptorTema(document.querySelector('.tema-toggle'));

  const $ = (s) => document.querySelector(s);
  const form = $('#formulario');
  const nombre = $('#nombre');
  const archivos = $('#archivos');
  const vistas = $('#vistas');
  const selector = $('#selector');
  const modo = $('#modo');
  const cajaMensaje = $('#caja-mensaje');
  const mensaje = $('#mensaje');
  const contador = $('#contador');
  const estado = $('#estado');
  const botonEnviar = $('#enviar');
  const max = config.maxFotosPorEnvio || 10;
  const maxCar = config.maxCaracteresMensaje || 280;

  mensaje.maxLength = maxCar;
  $('#gracias-texto').textContent = config.graciasEnvio;
  try { nombre.value = localStorage.getItem('bm-nombre') || ''; } catch {}

  /** @type {{id:string, archivo:File, url:string, mensaje:string}[]} */
  let seleccion = [];
  let enviando = false;

  const modoActual = () => form.querySelector('input[name="modo"]:checked').value;

  function pintar() {
    vistas.innerHTML = '';
    const porFoto = seleccion.length > 1 && modoActual() === 'cada';
    vistas.classList.toggle('por-foto', porFoto);
    seleccion.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'vista';
      el.dataset.id = s.id;
      const vista = s.error
        ? '<span class="vista__estado vista__estado--error">No se pudo leer esta foto</span>'
        : s.url ? `<img src="${s.url}" alt="Foto ${i + 1} seleccionada">`
          : '<span class="vista__estado">Preparando…</span>';
      el.innerHTML = `${vista}
        <button type="button" class="vista__quitar" aria-label="Quitar foto ${i + 1}">✕</button>
        <textarea maxlength="${maxCar}" placeholder="Mensaje para esta foto (opcional)" aria-label="Mensaje para la foto ${i + 1}"></textarea>`;
      const ta = el.querySelector('textarea');
      ta.value = s.mensaje;
      ta.addEventListener('input', () => { s.mensaje = ta.value; });
      el.querySelector('.vista__quitar').addEventListener('click', () => quitar(s.id));
      vistas.appendChild(el);
    });
    modo.hidden = seleccion.length < 2;
    cajaMensaje.hidden = porFoto;
    selector.setAttribute('aria-disabled', String(seleccion.length >= max));
    selector.querySelector('.selector__texto').textContent = seleccion.length ? 'Agregar más fotos' : 'Elegir fotos';
    selector.querySelector('.selector__ayuda').textContent = seleccion.length
      ? `${seleccion.length} de ${max} fotos`
      : 'Puedes elegir varias';
    botonEnviar.textContent = seleccion.length > 1 ? `Enviar ${seleccion.length} fotos` : 'Enviar';
  }

  function quitar(id) {
    const s = seleccion.find((x) => x.id === id);
    if (s) URL.revokeObjectURL(s.url);
    seleccion = seleccion.filter((x) => x.id !== id);
    pintar();
  }

  archivos.addEventListener('change', () => {
    const todos = [...archivos.files];
    const videos = todos.filter(esVideo);
    // Algunas fotos de iPhone llegan sin tipo: se aceptan y se revisan al prepararlas.
    const nuevos = todos.filter((f) => !esVideo(f) && (f.type.startsWith('image/') || !f.type || /\.(heic|heif)$/i.test(f.name)));
    const espacio = max - seleccion.length;
    if (videos.length) avisar('Los videos no se pueden enviar. Si es una Live Photo, se envía la foto.', true);
    else if (nuevos.length > espacio) avisar(`Puedes enviar hasta ${max} fotos a la vez.`, true);
    else avisar('');
    nuevos.slice(0, espacio).forEach((original) => {
      const s = { id: idAleatorio(), archivo: original, url: '', mensaje: '', error: false };
      s.listo = normalizarArchivo(original)
        .then((f) => { s.archivo = f; s.url = URL.createObjectURL(f); })
        .catch((err) => { console.error(err); s.error = true; })
        .then(() => { if (seleccion.includes(s)) pintar(); });
      seleccion.push(s);
    });
    archivos.value = '';
    pintar();
  });

  form.addEventListener('change', (e) => { if (e.target.name === 'modo') pintar(); });

  const actualizarContador = () => { contador.textContent = `${mensaje.value.length}/${maxCar}`; };
  mensaje.addEventListener('input', actualizarContador);
  actualizarContador();

  function avisar(texto, error = false) {
    estado.textContent = texto;
    estado.classList.toggle('error', error);
  }

  function mostrarSeccion(id) {
    $('#cargando').hidden = true;
    form.hidden = id !== 'formulario';
    $('#gracias').hidden = id !== 'gracias';
    $('#cerrado').hidden = id !== 'cerrado';
  }

  // ---- Datos ----
  let datos;
  try {
    datos = await crearDatos(config);
  } catch (e) {
    console.error(e);
    $('#cargando').textContent = 'No pudimos conectar. Revisa tu internet y recarga la página.';
    return;
  }

  let recibiendo = null;
  datos.escucharEvento((ev) => {
    const abierto = Boolean(ev?.recibiendoFotos);
    if (abierto === recibiendo) return;
    recibiendo = abierto;
    if (enviando) return;
    if (!abierto) mostrarSeccion('cerrado');
    else if ($('#gracias').hidden) mostrarSeccion('formulario');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    const nom = nombre.value.trim();
    if (!nom) { avisar('Escribe tu nombre para firmar las fotos.', true); nombre.focus(); return; }
    if (!seleccion.length) { avisar('Elige al menos una foto.', true); return; }
    if (seleccion.some((s) => !s.url && !s.error)) {
      avisar('Preparando tus fotos…');
      botonEnviar.disabled = true;
      await Promise.all(seleccion.map((s) => s.listo));
      botonEnviar.disabled = false;
    }
    if (seleccion.some((s) => s.error)) {
      avisar('Quita las fotos marcadas con error (✕) para poder enviar.', true);
      return;
    }
    try { localStorage.setItem('bm-nombre', nom); } catch {}

    // Bot detectado: fingimos éxito y no enviamos nada.
    if ($('#sitio').value) { mostrarSeccion('gracias'); return; }

    enviando = true;
    botonEnviar.disabled = true;
    const porFoto = seleccion.length > 1 && modoActual() === 'cada';
    const comun = mensaje.value.trim().slice(0, maxCar);
    const grupoId = idAleatorio();
    const total = seleccion.length;
    const fallidas = [];

    for (let i = 0; i < total; i++) {
      const s = seleccion[i];
      avisar(total > 1 ? `Enviando foto ${i + 1} de ${total}…` : 'Enviando tu foto…');
      try {
        const img = await prepararImagen(s.archivo);
        await datos.enviarFoto({
          nombre: nom.slice(0, 40),
          mensaje: (porFoto ? s.mensaje.trim() : comun).slice(0, maxCar),
          imagen: img.imagen,
          miniatura: img.miniatura,
          ancho: img.ancho,
          alto: img.alto,
          grupoId,
          grupoIndice: i,
          grupoTotal: total,
        });
      } catch (err) {
        console.error(err);
        fallidas.push(s);
      }
    }

    enviando = false;
    botonEnviar.disabled = false;

    if (fallidas.length) {
      seleccion.filter((s) => !fallidas.includes(s)).forEach((s) => URL.revokeObjectURL(s.url));
      seleccion = fallidas;
      pintar();
      vistas.querySelectorAll('.vista').forEach((v) => v.classList.add('error'));
      const enviadas = total - fallidas.length;
      avisar(
        `${enviadas ? `Se enviaron ${enviadas}. ` : ''}No pudimos enviar ${fallidas.length === 1 ? 'esta foto' : `estas ${fallidas.length} fotos`}. `
        + 'Revisa tu conexión e intenta de nuevo (o prueba con otra foto).',
        true,
      );
      return;
    }

    seleccion.forEach((s) => URL.revokeObjectURL(s.url));
    seleccion = [];
    mensaje.value = '';
    actualizarContador();
    pintar();
    avisar('');
    if (recibiendo === false) mostrarSeccion('cerrado');
    else mostrarSeccion('gracias');
  });

  $('#otra-vez').addEventListener('click', () => {
    mostrarSeccion(recibiendo === false ? 'cerrado' : 'formulario');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  pintar();
}
