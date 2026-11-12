// Música de fondo en la pantalla del TV con el reproductor oficial de YouTube.
// El video no se ve: solo suena. Se controla desde el panel (evento.musica).
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

export function crearMusicaTV({ alCambiarCancion }) {
  const boton = document.querySelector('.btn-musica');
  let player = null;
  let estado = null;
  let claveCargada = null;
  let ultimoNonce = null;
  let primerComando = true;
  let cola = Promise.resolve();

  function sonidoPermitido() {
    if (!player || !estado) return;
    if (yaTocaron()) {
      player.unMute();
      if (boton) boton.hidden = true;
    } else {
      player.mute(); // sin el toque inicial solo puede sonar en silencio
      if (boton) { boton.hidden = false; boton.focus(); }
    }
  }

  function activarConToque() {
    if (!player || !estado || !hayMusica(estado)) return;
    player.unMute();
    player.setVolume(volumen());
    if (estado.reproduciendo !== false) player.playVideo();
    if (boton) boton.hidden = true;
  }
  if (boton) boton.addEventListener('click', activarConToque);
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => {
    if (player && player.isMuted && player.isMuted() && estado && estado.reproduciendo !== false) activarConToque();
  }, { passive: true }));

  const hayMusica = (m) => Boolean(m && (m.playlistId || m.videoId));
  const volumen = () => (estado && typeof estado.volumen === 'number' ? estado.volumen : 80);

  function crearPlayer() {
    return new Promise((ok) => {
      player = new window.YT.Player('reproductor', {
        width: 200,
        height: 200,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0 },
        events: {
          onReady: () => ok(),
          onStateChange: (e) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.PLAYING) {
              const d = player.getVideoData ? player.getVideoData() : null;
              alCambiarCancion((d && d.title) || '');
            } else if (e.data === YT.PlayerState.ENDED && estado && !estado.playlistId) {
              player.seekTo(0); player.playVideo(); // una sola canción: se repite
            }
          },
          // Canción que no se deja reproducir fuera de YouTube: pasa a la siguiente
          onError: () => setTimeout(() => { if (player && estado && estado.playlistId) player.nextVideo(); }, 1500),
        },
      });
    });
  }

  async function aplicar(m) {
    estado = m;
    if (!hayMusica(m)) {
      if (player && player.stopVideo) player.stopVideo();
      claveCargada = null;
      if (boton) boton.hidden = true;
      alCambiarCancion('');
      return;
    }
    await cargarAPI();
    if (!player) await crearPlayer();

    const clave = `${m.playlistId || ''}|${m.videoId || ''}`;
    if (clave !== claveCargada) {
      claveCargada = clave;
      if (m.playlistId) {
        player.loadPlaylist({ list: m.playlistId, listType: 'playlist', index: 0 });
        setTimeout(() => { player.setLoop(true); player.setShuffle(Boolean(m.aleatorio)); }, 2000);
      } else {
        player.loadVideoById(m.videoId);
      }
    } else if (m.playlistId) {
      player.setShuffle(Boolean(m.aleatorio));
    }

    player.setVolume(volumen());
    sonidoPermitido();
    if (m.reproduciendo === false) player.pauseVideo();
    else player.playVideo();

    const c = m.comando;
    if (c && c.nonce !== ultimoNonce) {
      ultimoNonce = c.nonce;
      if (!primerComando) {
        if (c.tipo === 'siguiente') player.nextVideo();
        else if (c.tipo === 'anterior') player.previousVideo();
      }
    }
    primerComando = false;
  }

  return {
    // Se llama con evento.musica cada vez que cambia el evento.
    actualizar(m) {
      cola = cola.then(() => aplicar(m || null)).catch((e) => console.warn('Música:', e));
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
