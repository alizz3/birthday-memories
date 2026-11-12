// Función de Vercel: busca en YouTube y lee playlists para el panel de admin.
// La llave de la API vive SOLO aquí (variable de entorno YOUTUBE_API_KEY), nunca en el navegador.
// Solo responde a administradores: se verifica el token de Firebase del admin
// leyendo su documento en la colección "admins" (las reglas de Firestore hacen el resto).
//
// Variables de entorno en Vercel:
//   YOUTUBE_API_KEY      → llave de "YouTube Data API v3" (Google Cloud)
//   FIREBASE_PROJECT_ID  → ID del proyecto de Firebase (ej. birthdaymemories-f430f)
//
// Uso:  GET /api/youtube?q=texto   |   ?list=ID_PLAYLIST   |   ?id=ID_VIDEO
//       Encabezado: Authorization: Bearer <ID token de Firebase>

const YT = 'https://www.googleapis.com/youtube/v3';

const entidades = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };
const limpiar = (t = '') => String(t).replace(/&(amp|quot|#39|lt|gt);/g, (m) => entidades[m]).slice(0, 150);
const miniatura = (s) => (s && s.thumbnails && (s.thumbnails.default || s.thumbnails.medium || {}).url) || '';

function correoDelToken(token) {
  try {
    const carga = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return carga.email || null;
  } catch (e) { return null; }
}

async function esAdmin(token, proyecto) {
  const correo = correoDelToken(token);
  if (!correo) return false;
  // Firestore valida la firma del token; la regla de "admins" exige que el correo coincida.
  const url = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/admins/${encodeURIComponent(correo)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.ok;
}

async function yt(ruta, params, llave) {
  const qs = new URLSearchParams({ ...params, key: llave });
  const r = await fetch(`${YT}/${ruta}?${qs}`);
  const json = await r.json();
  if (!r.ok) throw new Error((json.error && json.error.message) || 'Error de YouTube');
  return json;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const llave = process.env.YOUTUBE_API_KEY;
  const proyecto = process.env.FIREBASE_PROJECT_ID;
  if (!llave || !proyecto) return res.status(500).json({ error: 'Faltan YOUTUBE_API_KEY o FIREBASE_PROJECT_ID en Vercel' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inicia sesión en el panel' });
  try {
    if (!(await esAdmin(token, proyecto))) return res.status(403).json({ error: 'Solo administradores' });
  } catch (e) {
    return res.status(403).json({ error: 'No se pudo verificar la sesión' });
  }

  const q = String(req.query.q || '').trim().slice(0, 100);
  const lista = String(req.query.list || '').trim().slice(0, 80);
  const id = String(req.query.id || '').trim().slice(0, 20);

  try {
    if (q) {
      const json = await yt('search', {
        part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '12', q,
      }, llave);
      return res.json({
        resultados: (json.items || []).map((it) => ({
          id: it.id.videoId, t: limpiar(it.snippet.title), c: limpiar(it.snippet.channelTitle), mini: miniatura(it.snippet),
        })),
      });
    }

    if (lista) {
      const items = [];
      let pagina = '';
      for (let i = 0; i < 4; i++) { // hasta 200 canciones
        const json = await yt('playlistItems', {
          part: 'snippet,status', playlistId: lista, maxResults: '50', ...(pagina ? { pageToken: pagina } : {}),
        }, llave);
        (json.items || []).forEach((it) => {
          const s = it.snippet;
          const estado = it.status && it.status.privacyStatus;
          if (!s || !s.resourceId || !s.resourceId.videoId || estado === 'private' || estado === 'privacyStatusUnspecified') return;
          items.push({ id: s.resourceId.videoId, t: limpiar(s.title), c: limpiar(s.videoOwnerChannelTitle || '') });
        });
        pagina = json.nextPageToken;
        if (!pagina) break;
      }
      let nombre = '';
      try {
        const info = await yt('playlists', { part: 'snippet', id: lista }, llave);
        nombre = info.items && info.items[0] ? limpiar(info.items[0].snippet.title) : '';
      } catch (e) { /* sin nombre */ }
      return res.json({ nombre, items });
    }

    if (id) {
      const json = await yt('videos', { part: 'snippet', id }, llave);
      const it = json.items && json.items[0];
      if (!it) return res.status(404).json({ error: 'Canción no encontrada' });
      return res.json({ resultados: [{ id, t: limpiar(it.snippet.title), c: limpiar(it.snippet.channelTitle), mini: miniatura(it.snippet) }] });
    }

    return res.status(400).json({ error: 'Falta q, list o id' });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Error de YouTube' });
  }
};
