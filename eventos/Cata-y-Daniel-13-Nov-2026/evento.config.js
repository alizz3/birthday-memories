// Configuración de este evento. Es lo único que normalmente hay que editar.
export default {
  // Debe coincidir EXACTO con el nombre de la carpeta (también es el ID en Firestore).
  id: 'Cata-y-Daniel-13-Nov-2026',

  // Textos de la pantalla
  titulo: '¡Feliz cumpleaños!',
  nombres: 'Daniel & Cata',
  // Si hay varios cumpleañeros, el invitado elige para quién es (o para todos).
  // En el TV se muestra solo el nombre elegido. Deja [] si es una sola persona.
  festejados: ['Daniel', 'Cata'],
  textoSinFotos: 'Las fotos aparecerán aquí muy pronto',

  // Textos de la página de invitados
  introEnvio: 'Comparte tus fotos y un mensaje. Aparecerán en la pantalla de la fiesta.',
  graciasEnvio: '¡Gracias! Tus fotos aparecerán en la pantalla en unos minutos.',

  // true: las fotos salen solas en el TV (el admin puede ocultarlas o borrarlas).
  // false: cada foto queda pendiente hasta que el admin la apruebe.
  aprobacionAutomatica: true,

  // Presentación
  intervaloSegundos: 90, // valor inicial (60 a 120); se cambia en vivo desde el panel

  // Envío
  maxFotosPorEnvio: 10,
  maxCaracteresMensaje: 280,

  // Enlace corto opcional para invitados (debe existir el redirect en vercel.json), ej. '/ana'
  rutaCorta: '/cata-y-daniel',

  // Imagen de fondo de la pantalla del TV (16:9). Puedes poner una propia en la carpeta del evento.
  fondoImagen: '/core/fondos/globos-dorados.jpg',

  // Colores (opcional). Cambia aquí para otro estilo de fiesta.
  tema: {
    fondo: '#070707',
    oro: '#d4af37',
    oroClaro: '#f6e27a',
    oroOscuro: '#9c7a1e',
    texto: '#f4efe2',
  },
};
