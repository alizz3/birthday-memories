// Música de fondo en la pantalla del TV con el reproductor oficial de YouTube.
// El video no se ve: solo suena. Todo se controla desde el panel (evento.musica):
//   musica.lista   → canciones de una playlist (suenan de fondo, en orden o aleatorio)
//   musica.cola    → canciones que el admin agregó con «+ Cola» (pasan primero)
//   musica.comando → acciones puntuales: siguiente, anterior o reproducir una ya
// El TV recuerda hasta dónde reprodujo la cola en enVivo.colaHasta.
// Los navegadores no dejan sonar audio hasta que alguien toca la pantalla una vez,
// por eso aparece el botón «Activar música» (o sirve tocar pantalla completa).

let promesaAPI = null;
function cargarAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!promesaAPI) {
    promesaAPI = new Promise((ok, mal) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (anterior) anterior(); ok(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { promesaAPI = null; mal(new Error('No cargó YouTube')); };
      document.head.appendChild(s);
    });
  }
  return promesaAPI;
}

const yaTocaron = () => Boolean(navigator.userActivation && navigator.userActivation.hasBeenActive);

function barajar(n) {
  const orden = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = orden[i]; orden[i] = orden[j]; orden[j] = t;
  }
  return orden;
}

export function crearMusicaTV({ alCambiar }) {
  const boton = document.querySelector('.btn-musica');
  let player = null;
  let m = null; // evento.musica
  let actual = null; // { id, t }
  const historial = [];
  let orden = [];
  let pos = -1;
  let claveLista = '';
  let colaHasta = null;
  let ultimoNonce = null;
  let primerComando = true;
  let cola = Promise.resolve();

  const reproduciendo = () => Boolean(m && m.reproduciendo !== false);
  const volumen = () => (m && typeof m.volumen === 'number' ? m.volumen : 80);
  const avisar = () => alCambiar({ cancion: actual ? actual.t || '' : '', colaHasta: colaHasta || 0 });

  function sonido() {
    if (!player) return;
    player.setVolume(volumen());
    if (yaTocaron()) {
      player.unMute();
      if (boton) boton.hidden = true;
    } else if (actual && reproduciendo()) {
      player.mute(); // sin el toque inicial solo puede sonar en silencio
      if (boton) { boton.hidden = false; boton.focus(); }
    }
  }

  function activarConToque() {
    if (!player || !actual) return;
    player.unMute();
    player.setVolume(volumen());
    if (reproduciendo()) player.playVideo();
    if (boton) boton.hidden = true;
  }
  if (boton) boton.addEventListener('click', activarConToque);
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => {
    if (player && player.isMuted && player.isMuted()) activarConToque();
  }, { passive: true }));

  function reproducir(item, { guardar = true } = {}) {
    if (guardar && actual) {
      historial.push(actual);
      if (historial.length > 30) historial.shift();
    }
    actual = { id: item.id, t: item.t || '' };
    if (reproduciendo()) player.loadVideoById(item.id);
    else player.cueVideoById(item.id);
    sonido();
    avisar();
  }

  function pendientesCola() {
    return ((m && m.cola) || [])
      .filter((i) => i && i.id && (colaHasta === null || i.en > colaHasta))
      .sort((a, b) => a.en - b.en);
  }

  function siguiente() {
    const pend = pendientesCola();
    if (pend.length) {
      colaHasta = pend[0].en;
      reproducir(pend[0]);
      return;
    }
    const lista = (m && m.lista) || [];
    if (lista.length) {
      pos = (pos + 1) % orden.length;
      reproducir(lista[orden[pos]]);
      return;
    }
    // Nada más para sonar
    if (actual) historial.push(actual);
    actual = null;
    if (player && player.stopVideo) player.stopVideo();
    if (boton) boton.hidden = true;
    avisar();
  }

  function anterior() {
    const previa = historial.pop();
    if (previa) reproducir(previa, { guardar: false });
  }

  function crearPlayer() {
    return new Promise((ok) => {
      player = new window.YT.Player('reproductor', {
        width: 200,
        height: 200,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0 },
        events: {
          onReady: () => ok(),
          onStateChange: (e) => { if (e.data === window.YT.PlayerState.ENDED) siguiente(); },
          // Canción que no se deja reproducir fuera de YouTube: pasa a la siguiente
          onError: () => setTimeout(siguiente, 1200),
        },
      });
    });
  }

  async function aplicar(nueva, enVivo) {
    if (colaHasta === null) colaHasta = (enVivo && enVivo.colaHasta) || 0;
    if (primerComando) {
      // Al abrir la pantalla se ignora el último comando viejo que haya quedado guardado
      primerComando = false;
      ultimoNonce = nueva && nueva.comando ? nueva.comando.nonce : null;
    }
    m = nueva;
    const hayAlgo = m && ((m.lista && m.lista.length) || (m.cola && m.cola.length) || m.comando);
    if (!m) {
      if (player && player.stopVideo) player.stopVideo();
      actual = null; claveLista = '';
      if (boton) boton.hidden = true;
      avisar();
      return;
    }
    if (!hayAlgo && !actual) return;
    await cargarAPI();
    if (!player) await crearPlayer();

    // Playlist de fondo nueva o modo aleatorio cambiado → nuevo orden
    const lista = m.lista || [];
    const clave = `${m.listaId || ''}:${lista.length}:${m.aleatorio ? 1 : 0}`;
    if (clave !== claveLista) {
      claveLista = clave;
      orden = m.aleatorio ? barajar(lista.length) : lista.map((_, i) => i);
      pos = -1;
    }

    // Comandos del panel
    const c = m.comando;
    let atendido = false;
    if (c && c.nonce !== ultimoNonce) {
      ultimoNonce = c.nonce;
      atendido = true;
      if (c.tipo === 'siguiente') siguiente();
      else if (c.tipo === 'anterior') anterior();
      else if (c.tipo === 'reproducir' && c.id) reproducir({ id: c.id, t: c.t });
      else atendido = false;
    }

    // Si no está sonando nada y hay algo por sonar, arranca
    if (!atendido && !actual && (pendientesCola().length || lista.length)) siguiente();

    if (actual) {
      if (reproduciendo()) player.playVideo(); else player.pauseVideo();
    }
    sonido();
  }

  return {
    // Se llama con evento.musica y evento.enVivo cada vez que cambia el evento.
    actualizar(musica, enVivo) {
      cola = cola.then(() => aplicar(musica || null, enVivo)).catch((e) => console.warn('Música:', e));
    },
  };
}

/** Lee un enlace de YouTube / YouTube Music y devuelve { playlistId, videoId }. */
export function leerEnlaceMusica(texto) {
  try {
    const u = new URL(String(texto).trim());
    if (!/youtube\.com|youtu\.be/.test(u.hostname)) return null;
    const lista = u.searchParams.get('list');
    let video = u.searchParams.get('v');
    if (!video && u.hostname.includes('youtu.be')) video = u.pathname.slice(1) || null;
    if (!lista && !video) return null;
    return { playlistId: lista || null, videoId: video || null };
  } catch (e) { return null; }
}
