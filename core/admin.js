// Panel privado: aprobar/eliminar fotos y controlar la pantalla del TV en vivo.
import {
  aplicarEvento, crearDatos, limitarIntervalo, formatearTiempo, escaparHTML, enModoDemo, activarInterruptorTema,
} from './comun.js';

export async function iniciarAdmin(config) {
  aplicarEvento(config);
  activarInterruptorTema(document.querySelector('.tema-toggle'));
  const $ = (s) => document.querySelector(s);

  const datos = await crearDatos(config);
  let filtro = 'pendiente';
  let fotos = [];
  let evento = null;
  let desuscribir = [];

  // ---------- Sesión ----------
  $('#entrar').addEventListener('click', async () => {
    $('#acceso-error').textContent = '';
    try { await datos.iniciarSesion(); } catch (e) {
      console.error(e);
      $('#acceso-error').textContent = 'No se pudo iniciar sesión. Intenta de nuevo.';
    }
  });
  $('#salir').addEventListener('click', () => datos.cerrarSesion());

  await datos.escucharSesion(async ({ usuario, esAdmin }) => {
    desuscribir.forEach((f) => f());
    desuscribir = [];
    $('#usuario').hidden = !usuario;
    $('#usuario-nombre').textContent = usuario?.nombre || usuario?.email || '';
    if (!usuario || !esAdmin) {
      $('#panel').hidden = true;
      $('#acceso').hidden = false;
      if (usuario) $('#acceso-error').textContent = `La cuenta ${usuario.email} no tiene permiso para este panel.`;
      return;
    }
    $('#acceso').hidden = true;
    $('#panel').hidden = false;
    await datos.asegurarEvento({
      titulo: config.titulo,
      nombres: config.nombres,
      intervaloSegundos: limitarIntervalo(config.intervaloSegundos),
      pausado: false,
      recibiendoFotos: true,
    });
    desuscribir.push(datos.escucharEvento((ev) => { evento = ev; pintarControl(); }));
    desuscribir.push(datos.escucharTodas((lista) => { fotos = lista; pintarFotos(); pintarControl(); }));
  });

  // ---------- Enlaces ----------
  const sufijo = enModoDemo() ? '?demo' : '';
  const carpeta = location.pathname.replace(/admin(\.html)?\/?$/, '');
  const rutaInvitados = config.rutaCorta && !config.rutaCorta.startsWith('__') ? config.rutaCorta : carpeta;
  const enlaceInvitados = `${location.origin}${rutaInvitados}${sufijo}`;
  const enlacePantalla = `${location.origin}${carpeta}pantalla${sufijo}`;
  $('#enlace-invitados').value = enlaceInvitados;
  $('#enlace-pantalla').value = enlacePantalla;
  $('#abrir-pantalla').href = enlacePantalla;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(enlaceInvitados)}`;
  $('#qr').src = qr.replace('600x600', '360x360');
  $('#qr-descargar').href = qr;

  document.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    const input = document.getElementById(b.dataset.copiar);
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    avisar('Enlace copiado');
  }));

  // ---------- Control de la presentación ----------
  document.querySelectorAll('[data-comando]').forEach((b) => b.addEventListener('click', () => {
    datos.enviarComando(b.dataset.comando).then(() => avisar('Enviado a la pantalla')).catch(errorGeneral);
  }));
  $('#pausa').addEventListener('click', () => {
    datos.actualizarEvento({ pausado: !evento?.pausado }).catch(errorGeneral);
  });
  const rango = $('#intervalo');
  rango.addEventListener('input', () => { $('#intervalo-valor').textContent = formatearTiempo(rango.value * 1000); });
  rango.addEventListener('change', () => {
    datos.actualizarEvento({ intervaloSegundos: limitarIntervalo(rango.value) })
      .then(() => avisar(`Cada foto durará ${formatearTiempo(rango.value * 1000)}`)).catch(errorGeneral);
  });
  $('#recibiendo').addEventListener('change', (e) => {
    datos.actualizarEvento({ recibiendoFotos: e.target.checked }).catch(errorGeneral);
  });

  function pintarControl() {
    if (!evento) return;
    $('#pausa').textContent = evento.pausado ? '▶ Reanudar' : '⏸ Pausar';
    if (document.activeElement !== rango) {
      rango.value = limitarIntervalo(evento.intervaloSegundos);
      $('#intervalo-valor').textContent = formatearTiempo(rango.value * 1000);
    }
    $('#recibiendo').checked = Boolean(evento.recibiendoFotos);
    pintarEnVivo();
    marcarEnPantalla();
  }

  function pintarEnVivo() {
    const vivo = evento?.enVivo;
    const limite = (limitarIntervalo(evento?.intervaloSegundos) + 60) * 1000;
    const conectada = vivo?.en && (Date.now() - vivo.en < limite || evento.pausado);
    $('#vivo-punto').classList.toggle('vivo', Boolean(conectada));
    $('#vivo-estado').textContent = !vivo ? 'Pantalla sin conectar'
      : conectada ? (evento.pausado ? 'Pantalla en pausa' : 'Pantalla en vivo') : 'Sin señal reciente';
    const foto = fotos.find((f) => f.id === vivo?.fotoId);
    $('#vivo-mini').style.backgroundImage = foto ? `url("${foto.miniatura}")` : 'none';
    $('#vivo-detalle').textContent = foto
      ? `Mostrando foto de ${foto.nombre || 'alguien'} · ${vivo.total} en rotación`
      : 'Abre el enlace de la pantalla en el TV.';
  }
  setInterval(pintarEnVivo, 10_000);

  // ---------- Fotos ----------
  document.querySelectorAll('.pestana').forEach((p) => p.addEventListener('click', () => {
    filtro = p.dataset.filtro;
    document.querySelectorAll('.pestana').forEach((x) => x.setAttribute('aria-selected', String(x === p)));
    pintarFotos();
  }));

  $('#aprobar-todas').addEventListener('click', async () => {
    const ids = fotos.filter((f) => f.estado === 'pendiente').map((f) => f.id);
    if (!ids.length || !confirm(`¿Aprobar las ${ids.length} fotos pendientes?`)) return;
    datos.aprobarVarias(ids).then(() => avisar('Fotos aprobadas')).catch(errorGeneral);
  });

  const hora = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '');

  function pintarFotos() {
    const pendientes = fotos.filter((f) => f.estado === 'pendiente');
    const aprobadas = fotos.filter((f) => f.estado === 'aprobada');
    $('#n-pendiente').textContent = pendientes.length;
    $('#n-aprobada').textContent = aprobadas.length;
    $('#aprobar-todas').hidden = filtro !== 'pendiente' || pendientes.length < 2;
    document.title = `${pendientes.length ? `(${pendientes.length}) ` : ''}Panel · ${config.nombres}`;

    const lista = filtro === 'pendiente' ? pendientes : aprobadas;
    $('#vacio').textContent = lista.length ? ''
      : filtro === 'pendiente' ? 'No hay fotos por revisar. Las nuevas aparecerán aquí solas.' : 'Aún no hay fotos aprobadas.';

    $('#grilla').innerHTML = lista.map((f) => {
      const grupo = f.grupoTotal > 1 ? `<span class="insignia">Foto ${f.grupoIndice + 1} de ${f.grupoTotal}</span>` : '';
      const msg = f.mensaje ? escaparHTML(f.mensaje) : '<em>Sin mensaje (se verá «¡FELIZ CUMPLEAÑOS!»)</em>';
      const acciones = f.estado === 'pendiente'
        ? `<button class="btn btn--oro" data-accion="aprobar">✓ Aprobar</button>
           <button class="btn" data-accion="editar">Editar</button>
           <button class="btn btn--peligro" data-accion="eliminar">Eliminar</button>`
        : `<button class="btn btn--oro" data-accion="mostrar">Mostrar ahora</button>
           <button class="btn" data-accion="editar">Editar</button>
           <button class="btn" data-accion="ocultar">Ocultar</button>
           <button class="btn btn--peligro" data-accion="eliminar">Eliminar</button>`;
      return `<article class="foto-card" data-id="${f.id}">
        <button class="foto-card__mini" data-accion="ver" aria-label="Ver foto de ${escaparHTML(f.nombre)} en grande">
          <img src="${f.miniatura}" alt="" loading="lazy">${grupo}<span class="insignia insignia--vivo" hidden>En pantalla</span>
        </button>
        <div class="foto-card__info">
          <p class="foto-card__nombre">${escaparHTML(f.nombre || 'Sin nombre')}<span class="foto-card__hora">${hora(f.creadaEn)}</span></p>
          <p class="foto-card__mensaje">${msg}</p>
        </div>
        <div class="foto-card__acciones">${acciones}</div>
      </article>`;
    }).join('');
    marcarEnPantalla();
  }

  function marcarEnPantalla() {
    const id = evento?.enVivo?.fotoId;
    document.querySelectorAll('.foto-card').forEach((c) => {
      const si = c.dataset.id === id;
      c.classList.toggle('en-pantalla', si);
      c.querySelector('.insignia--vivo').hidden = !si;
    });
  }

  $('#grilla').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const id = boton.closest('.foto-card').dataset.id;
    const foto = fotos.find((f) => f.id === id);
    if (!foto) return;
    const accion = boton.dataset.accion;
    try {
      if (accion === 'aprobar') { await datos.aprobar(id); avisar('Aprobada: entrará en la próxima rotación'); }
      else if (accion === 'ocultar') { await datos.desaprobar(id); avisar('Oculta de la pantalla'); }
      else if (accion === 'mostrar') { await datos.enviarComando('mostrar', id); avisar('Mostrando en el TV'); }
      else if (accion === 'eliminar') {
        if (!confirm(`¿Eliminar definitivamente la foto de ${foto.nombre || 'este invitado'}?`)) return;
        await datos.eliminar(id); avisar('Foto eliminada');
      } else if (accion === 'editar') {
        const nuevo = prompt('Mensaje (déjalo vacío para mostrar «¡FELIZ CUMPLEAÑOS!»):', foto.mensaje || '');
        if (nuevo === null) return;
        await datos.editarMensaje(id, nuevo.trim().slice(0, config.maxCaracteresMensaje || 280));
        avisar('Mensaje actualizado');
      } else if (accion === 'ver') abrirVisor(foto);
    } catch (err) { errorGeneral(err); }
  });

  // ---------- Visor ----------
  const visor = $('#visor');
  visor.querySelector('.visor__cerrar').addEventListener('click', () => visor.close());
  visor.addEventListener('click', (e) => { if (e.target === visor) visor.close(); });
  async function abrirVisor(foto) {
    $('#visor-img').src = foto.miniatura;
    $('#visor-img').alt = `Foto enviada por ${foto.nombre}`;
    $('#visor-texto').textContent = `${foto.nombre}${foto.mensaje ? ` — “${foto.mensaje}”` : ''}`;
    visor.showModal();
    try { $('#visor-img').src = await datos.obtenerImagen(foto.id); } catch {}
  }

  // ---------- Avisos ----------
  let temporizador;
  function avisar(texto) {
    let el = document.querySelector('.aviso-flotante');
    if (!el) {
      el = document.createElement('div');
      el.className = 'aviso-flotante';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function errorGeneral(e) {
    console.error(e);
    avisar('Algo falló. Revisa la conexión e intenta otra vez.');
  }
}
