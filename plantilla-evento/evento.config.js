// Configuración de este evento. Es lo único que normalmente hay que editar.
export default {
  // Debe coincidir EXACTO con el nombre de la carpeta (también es el ID en Firestore).
  id: '__EVENTO_ID__',

  // Textos de la pantalla
  titulo: '¡Feliz cumpleaños!',
  nombres: '__NOMBRES__',
  textoSinFotos: 'Las fotos aparecerán aquí muy pronto',

  // Textos de la página de invitados
  introEnvio: 'Comparte tus fotos y un mensaje. Aparecerán en la pantalla de la fiesta.',
  graciasEnvio: '¡Gracias! Tus fotos aparecerán en la pantalla en unos minutos.',

  // Presentación
  intervaloSegundos: 90, // valor inicial (60 a 120); se cambia en vivo desde el panel

  // Envío
  maxFotosPorEnvio: 10,
  maxCaracteresMensaje: 280,

  // Enlace corto opcional para invitados (debe existir el redirect en vercel.json), ej. '/ana'
  rutaCorta: '__RUTA_CORTA__',

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
