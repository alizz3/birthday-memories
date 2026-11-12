// Panel privado: aprobar/eliminar fotos y controlar la pantalla del TV en vivo.
import {
  aplicarEvento, crearDatos, limitarIntervalo, formatearTiempo, escaparHTML, enModoDemo, activarInterruptorTema,
} from './comun.js';
import { leerEnlaceMusica } from './musica-tv.js';

export async function iniciarAdmin(config) {
  aplicarEvento(config);
  activarInterruptorTema(document.querySelector('.tema-toggle'));
  const $ = (s) => document.querySelector(s);

  const datos = await crearDatos(config);
  let filtro = 'aprobada';
  let defectoAplicado = false;
  let ultimoAuto = null;
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
      aprobacionAutomatica: config.aprobacionAutomatica !== false,
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
  $('#automatica').addEventListener('change', (e) => {
    datos.actualizarEvento({ aprobacionAutomatica: e.target.checked })
      .then(() => avisar(e.target.checked ? 'Las fotos nuevas saldrán solas en el TV' : 'Las fotos nuevas quedarán pendientes'))
      .catch(errorGeneral);
  });
  $('#recibiendo').addEventListener('change', (e) => {
    datos.actualizarEvento({ recibiendoFotos: e.target.checked }).catch(errorGeneral);
  });

  // ---------- Música ----------
  const musicaActual = () => (evento && evento.musica) || null;
  const volumenMusica = $('#musica-volumen');
  const nonce = () => Math.random().toString(36).slice(2);

  // Cambia campos de evento.musica (lo crea si aún no existe)
  function cambiarMusica(cambios) {
    if (!musicaActual()) {
      return datos.actualizarEvento({
        musica: { lista: [], cola: [], reproduciendo: true, volumen: Number(volumenMusica.value), aleatorio: false, comando: null, ...cambios },
      });
    }
    const conPuntos = {};
    Object.keys(cambios).forEach((k) => { conPuntos[`musica.${k}`] = cambios[k]; });
    return datos.actualizarEvento(conPuntos);
  }

  async function pedirYouTube(params) {
    if (datos.modo === 'demo') {
      await new Promise((r) => setTimeout(r, 300));
      if (params.list) return { nombre: 'Playlist demo', items: [1, 2, 3, 4, 5].map((n) => ({ id: `demo${n}`, t: `Canción de playlist ${n}`, c: 'Artista' })) };
      return { resultados: [1, 2, 3].map((n) => ({ id: `busq${n}`, t: `${params.q || 'Canción'} (resultado ${n})`, c: 'Artista demo', mini: '' })) };
    }
    const token = await datos.tokenAdmin();
    const r = await fetch(`/api/youtube?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || 'No se pudo consultar YouTube');
    return json;
  }

  const htmlCancion = (c, acciones) => `<li class="cancion" data-id="${escaparHTML(c.id)}">
      ${c.mini ? `<img src="${escaparHTML(c.mini)}" alt="" loading="lazy">` : '<img alt="">'}
      <div class="cancion__texto"><p class="cancion__t">${escaparHTML(c.t || 'Canción')}</p><p class="cancion__c">${escaparHTML(c.c || '')}</p></div>
      <div class="cancion__acciones">${acciones}</div></li>`;

  let resultados = [];
  $('#musica-buscar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#musica-q').value.trim();
    if (!q) return;
    $('#musica-q').blur();
    $('#musica-resultados').innerHTML = '<p class="musica__vacia">Buscando…</p>';
    try {
      const enlace = leerEnlaceMusica(q);
      const json = enlace && enlace.videoId ? await pedirYouTube({ id: enlace.videoId }) : await pedirYouTube({ q });
      resultados = json.resultados || [];
      $('#musica-resultados').innerHTML = resultados.length
        ? resultados.map((c) => htmlCancion(c, `<button type="button" class="btn btn--oro" data-accion-musica="ya">▶ Ya</button>
            <button type="button" class="btn" data-accion-musica="cola">+ Cola</button>`)).join('')
        : '<p class="musica__vacia">Sin resultados.</p>';
    } catch (err) {
      $('#musica-resultados').innerHTML = `<p class="musica__vacia">${escaparHTML(err.message)}</p>`;
    }
  });

  $('#musica-resultados').addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion-musica]');
    if (!b) return;
    const c = resultados.find((x) => x.id === b.closest('.cancion').dataset.id);
    if (!c) return;
    const item = { id: c.id, t: c.t, c: c.c || '', mini: c.mini || '' };
    if (b.dataset.accionMusica === 'ya') {
      cambiarMusica({ reproduciendo: true, comando: { tipo: 'reproducir', id: item.id, t: item.t, nonce: nonce() } })
        .then(() => avisar('Sonando en el TV')).catch(errorGeneral);
    } else {
      const hasta = (evento && evento.enVivo && evento.enVivo.colaHasta) || 0;
      const cola = ((musicaActual() && musicaActual().cola) || []).filter((i) => i.en > hasta).slice(-49);
      cola.push({ ...item, en: Date.now() });
      cambiarMusica({ cola }).then(() => avisar('Agregada a la cola')).catch(errorGeneral);
    }
  });

  $('#musica-cola').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar-cola]');
    if (!b || !musicaActual()) return;
    const en = Number(b.dataset.quitarCola);
    cambiarMusica({ cola: (musicaActual().cola || []).filter((i) => i.en !== en) }).catch(errorGeneral);
  });
  $('#musica-vaciar').addEventListener('click', () => { if (musicaActual()) cambiarMusica({ cola: [] }).catch(errorGeneral); });

  $('#musica-poner').addEventListener('click', async () => {
    const enlace = leerEnlaceMusica($('#musica-enlace').value);
    if (!enlace || !enlace.playlistId) { avisar('Pega el enlace de una playlist (debe tener «list=»)'); return; }
    $('#musica-poner').disabled = true;
    try {
      const json = await pedirYouTube({ list: enlace.playlistId });
      if (!json.items || !json.items.length) throw new Error('La playlist está vacía o es privada');
      await cambiarMusica({ lista: json.items.map((i) => ({ id: i.id, t: i.t })), listaId: enlace.playlistId, listaNombre: json.nombre || '', reproduciendo: true });
      avisar(`Playlist cargada: ${json.items.length} canciones`);
    } catch (err) { avisar(err.message); } finally { $('#musica-poner').disabled = false; }
  });

  $('#musica-play').addEventListener('click', () => {
    const m = musicaActual();
    if (!m) { avisar('Busca una canción o carga una playlist'); return; }
    cambiarMusica({ reproduciendo: m.reproduciendo === false }).catch(errorGeneral);
  });
  document.querySelectorAll('[data-musica]').forEach((b) => b.addEventListener('click', () => {
    if (musicaActual()) cambiarMusica({ comando: { tipo: b.dataset.musica, nonce: nonce() } }).catch(errorGeneral);
  }));
  volumenMusica.addEventListener('input', () => { $('#musica-volumen-valor').textContent = volumenMusica.value; });
  volumenMusica.addEventListener('change', () => {
    if (musicaActual()) cambiarMusica({ volumen: Number(volumenMusica.value) }).catch(errorGeneral);
  });
  $('#musica-aleatorio').addEventListener('change', (e) => {
    if (musicaActual()) cambiarMusica({ aleatorio: e.target.checked }).catch(errorGeneral);
  });
  $('#musica-quitar').addEventListener('click', () => {
    if (!confirm('¿Apagar la música y vaciar la cola y la playlist?')) return;
    datos.actualizarEvento({ musica: null }).then(() => avisar('Música apagada')).catch(errorGeneral);
  });

  function pintarMusica() {
    const m = musicaActual();
    const vivo = (evento && evento.enVivo) || {};
    $('#musica-play').textContent = m && m.reproduciendo === false ? '▶ Reproducir' : '⏸ Pausar';
    $('#musica-ahora').textContent = !m ? 'Sin música'
      : m.reproduciendo === false ? 'En pausa'
        : vivo.cancion ? `♪ ${vivo.cancion}` : 'Esperando al TV…';
    if (m && document.activeElement !== volumenMusica && typeof m.volumen === 'number') {
      volumenMusica.value = m.volumen;
      $('#musica-volumen-valor').textContent = m.volumen;
    }
    $('#musica-aleatorio').checked = Boolean(m && m.aleatorio);
    $('#musica-lista-nombre').textContent = m && m.lista && m.lista.length
      ? `${m.listaNombre || 'Playlist'} · ${m.lista.length}` : 'Ninguna';
    const hasta = vivo.colaHasta || 0;
    const pendientes = ((m && m.cola) || []).filter((i) => i.en > hasta).sort((a, b) => a.en - b.en);
    $('#musica-cola').innerHTML = pendientes.map((c) => htmlCancion(c,
      `<button type="button" class="btn btn--fantasma" data-quitar-cola="${c.en}" aria-label="Quitar de la cola">✕</button>`)).join('');
    $('#musica-vaciar').hidden = !pendientes.length;
  }

  function pintarControl() {
    if (!evento) return;
    pintarMusica();
    $('#pausa').textContent = evento.pausado ? '▶ Reanudar' : '⏸ Pausar';
    if (document.activeElement !== rango) {
      rango.value = limitarIntervalo(evento.intervaloSegundos);
      $('#intervalo-valor').textContent = formatearTiempo(rango.value * 1000);
    }
    $('#recibiendo').checked = Boolean(evento.recibiendoFotos);
    // Eventos creados antes de esta opción: se les pone el valor de evento.config.js
    if (evento.aprobacionAutomatica === undefined && !defectoAplicado) {
      defectoAplicado = true;
      datos.actualizarEvento({ aprobacionAutomatica: config.aprobacionAutomatica !== false }).catch(errorGeneral);
    }
    const auto = Boolean(evento.aprobacionAutomatica);
    $('#automatica').checked = auto;
    $('.etiqueta-pendiente').textContent = auto ? 'Ocultas' : 'Pendientes';
    if (auto !== ultimoAuto) { ultimoAuto = auto; pintarFotos(); }
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
    if (!ids.length || !confirm(`¿Mostrar en el TV las ${ids.length} fotos de esta lista?`)) return;
    datos.aprobarVarias(ids).then(() => avisar('Listo: ya salen en el TV')).catch(errorGeneral);
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
      : filtro === 'aprobada' ? 'Aún no hay fotos en pantalla.'
        : evento && evento.aprobacionAutomatica ? 'No hay fotos ocultas.' : 'No hay fotos por revisar. Las nuevas aparecerán aquí solas.';

    $('#grilla').innerHTML = lista.map((f) => {
      const grupo = f.grupoTotal > 1 ? `<span class="insignia">Foto ${f.grupoIndice + 1} de ${f.grupoTotal}</span>` : '';
      const msg = f.mensaje ? escaparHTML(f.mensaje) : '<em>Sin mensaje (el título se verá en grande)</em>';
      const acciones = f.estado === 'pendiente'
        ? `<button class="btn btn--oro" data-accion="aprobar">${evento && evento.aprobacionAutomatica ? '↺ Mostrar' : '✓ Aprobar'}</button>
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
        const nuevo = prompt('Mensaje (déjalo vacío para que solo salga el título en grande):', foto.mensaje || '');
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
