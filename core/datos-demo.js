// Capa de datos SIMULADA para probar sin Firebase: agrega ?demo a cualquier URL.
// Las pestañas abiertas en el mismo navegador se sincronizan (BroadcastChannel),
// así puedes tener pantalla, envío y admin abiertos a la vez y ver el flujo completo.
// Nada se guarda: al cerrar todas las pestañas se pierde.

const paletas = [
  ['#3b1d5e', '#d4af37', '#f6e27a'],
  ['#0f3b3a', '#e9b44c', '#f8e9c0'],
  ['#5e1d2b', '#f2c14e', '#fde7b0'],
  ['#1d2b5e', '#c9a227', '#f3e3a8'],
];

function svgMuestra(i, ancho, alto, texto) {
  const [a, b, c] = paletas[i % paletas.length];
  const globos = Array.from({ length: 7 }, (_, k) => {
    const x = ((k * 173 + i * 61) % 90) + 5;
    const y = ((k * 97 + i * 37) % 60) + 10;
    const r = 4 + ((k * 13) % 5);
    return `<circle cx="${x}%" cy="${y}%" r="${r}%" fill="${k % 2 ? b : c}" opacity=".85"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>${globos}
  <text x="50%" y="88%" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(ancho / 18)}" fill="${c}">${texto}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function muestras() {
  const base = Date.now() - 3600_000;
  const datos = [
    { nombre: 'Tía Marta', mensaje: '¡Que este nuevo año les traiga tantas alegrías como las que ustedes nos regalan a todos! Los queremos muchísimo.', ancho: 1600, alto: 1000 },
    { nombre: 'Andrés', mensaje: '', ancho: 900, alto: 1300 },
    { nombre: 'Laura y Juan', mensaje: '¡Por muchos años más de risas juntos! 🥂', ancho: 1600, alto: 1066 },
    { nombre: 'Abuela Rosa', mensaje: 'Mis niños hermosos, Dios los bendiga hoy y siempre.', ancho: 1000, alto: 1000 },
  ];
  const fotos = {};
  const imagenes = {};
  datos.forEach((d, i) => {
    const id = `muestra-${i + 1}`;
    imagenes[id] = svgMuestra(i, d.ancho, d.alto, `Foto de ejemplo ${i + 1}`);
    fotos[id] = {
      id, ...d,
      estado: i < 3 ? 'aprobada' : 'pendiente',
      creadaEn: base + i * 60_000,
      aprobadaEn: i < 3 ? base + i * 60_000 + 1000 : null,
      miniatura: imagenes[id],
      grupoId: id, grupoIndice: 0, grupoTotal: 1,
    };
  });
  return { fotos, imagenes };
}

export function crearDatos(eventoId, config) {
  const canal = 'BroadcastChannel' in window ? new BroadcastChannel(`bm-demo-${eventoId}`) : null;
  const inicial = muestras();
  let estado = {
    version: 0,
    evento: {
      titulo: config.titulo,
      nombres: config.nombres,
      intervaloSegundos: config.intervaloSegundos,
      pausado: false,
      recibiendoFotos: true,
      aprobacionAutomatica: config.aprobacionAutomatica !== false,
      comando: null,
      enVivo: null,
    },
    fotos: inicial.fotos,
  };
  const imagenes = inicial.imagenes;
  const oyentes = { evento: new Set(), fotos: new Set() };

  const emitir = () => {
    const ev = JSON.parse(JSON.stringify(estado.evento));
    oyentes.evento.forEach((cb) => cb(ev));
    const lista = Object.values(estado.fotos);
    oyentes.fotos.forEach(({ cb, filtro }) => cb(lista.filter(filtro).map((f) => ({ ...f }))));
  };
  const mutar = (fn, nuevasImagenes) => {
    fn(estado);
    estado.version += 1;
    if (nuevasImagenes) Object.assign(imagenes, nuevasImagenes);
    canal?.postMessage({ tipo: 'estado', estado, imagenes: nuevasImagenes || null });
    setTimeout(emitir, 0);
  };

  if (canal) {
    canal.onmessage = ({ data }) => {
      if (data.tipo === 'hola' && estado.version > 0) {
        canal.postMessage({ tipo: 'estado', estado, imagenes });
      } else if (data.tipo === 'estado' && data.estado.version >= estado.version) {
        estado = data.estado;
        if (data.imagenes) Object.assign(imagenes, data.imagenes);
        emitir();
      }
    };
    canal.postMessage({ tipo: 'hola' });
  }

  const escuchar = (tipo, valor) => {
    oyentes[tipo].add(valor);
    setTimeout(emitir, 0);
    return () => oyentes[tipo].delete(valor);
  };

  return {
    modo: 'demo',
    escucharEvento: (cb) => escuchar('evento', cb),
    escucharAprobadas: (cb) => escuchar('fotos', { cb, filtro: (f) => f.estado === 'aprobada' }),
    escucharTodas: (cb) => escuchar('fotos', {
      cb: (l) => cb(l.sort((a, b) => b.creadaEn - a.creadaEn)), filtro: () => true,
    }),
    async obtenerImagen(id) {
      await new Promise((r) => setTimeout(r, 150));
      if (!imagenes[id]) throw new Error('Imagen no encontrada');
      return imagenes[id];
    },
    async reportarEnVivo(fotoId, total) {
      mutar((e) => { e.evento.enVivo = { fotoId, total, en: Date.now() }; });
    },
    async enviarFoto(f) {
      await new Promise((r) => setTimeout(r, 400));
      if (!estado.evento.recibiendoFotos) throw new Error('Cerrado');
      const id = `demo-${Math.random().toString(36).slice(2, 9)}`;
      const { imagen, aprobada, ...resto } = f;
      mutar((e) => {
        e.fotos[id] = { id, ...resto, estado: aprobada ? 'aprobada' : 'pendiente', creadaEn: Date.now(), aprobadaEn: aprobada ? Date.now() : null };
      }, { [id]: imagen });
    },
    // Admin simulado: siempre entra.
    async iniciarSesion() {},
    async cerrarSesion() { location.reload(); },
    async escucharSesion(cb) {
      setTimeout(() => cb({ usuario: { nombre: 'Admin demo', email: 'demo@ejemplo.com' }, esAdmin: true }), 0);
      return () => {};
    },
    async asegurarEvento() {},
    async actualizarEvento(cambios) { mutar((e) => Object.assign(e.evento, cambios)); },
    async enviarComando(tipo, fotoId = null) {
      mutar((e) => { e.evento.comando = { tipo, fotoId, nonce: Math.random().toString(36).slice(2), en: Date.now() }; });
    },
    async aprobar(id) { mutar((e) => Object.assign(e.fotos[id], { estado: 'aprobada', aprobadaEn: Date.now() })); },
    async aprobarVarias(ids) {
      mutar((e) => ids.forEach((id) => Object.assign(e.fotos[id], { estado: 'aprobada', aprobadaEn: Date.now() })));
    },
    async desaprobar(id) { mutar((e) => Object.assign(e.fotos[id], { estado: 'pendiente', aprobadaEn: null })); },
    async editarMensaje(id, mensaje) { mutar((e) => { e.fotos[id].mensaje = mensaje; }); },
    async eliminar(id) { mutar((e) => { delete e.fotos[id]; }); },
  };
}
