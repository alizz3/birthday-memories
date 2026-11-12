# birthday-memories 📸✨

Muro de fotos en vivo para cumpleaños y celebraciones familiares. Los invitados envían fotos y mensajes desde el celular, tú las apruebas en un panel privado y se proyectan en el TV con transiciones suaves.

Es una **plantilla reutilizable**: el núcleo (`core/`) es el mismo para todas las fiestas y cada evento es solo una carpeta con su configuración.

## Las 3 páginas de cada evento

| Página | URL | Para quién |
|---|---|---|
| Envío | `/eventos/<Evento>/` (o el enlace corto, ej. `/cata-y-daniel`) | Invitados, desde el celular |
| Pantalla | `/eventos/<Evento>/pantalla` | El TV. Solo la foto, el mensaje y el indicador de la siguiente foto |
| Panel | `/eventos/<Evento>/admin` | Tú (login con Google) |

**Pantalla del TV:** foto inclinada con borde dorado a la izquierda; a la derecha el título y, debajo, el mensaje firmado. Si la foto no trae mensaje, el título se agranda. Las fotos nuevas aprobadas pasan primero y luego todas rotan en bucle. El botón de pantalla completa aparece solo al mover el mouse (o pulsa `F`). Atajos invisibles: `←` `→` y espacio para pausar.

**Panel:** aprobar, aprobar todas, editar el mensaje, ocultar, eliminar, «Mostrar ahora», anterior/siguiente, pausar, tiempo por foto (1:00 a 2:00), abrir o cerrar la recepción de fotos, recargar el TV, enlace y QR para invitados, y ver qué foto está en pantalla.

## Estructura

```
birthday-memories/
├── core/                    ← código compartido (no se toca por evento)
│   ├── pantalla.js/.css     TV
│   ├── enviar.js/.css       invitados
│   ├── admin.js/.css        panel
│   ├── datos-firebase.js    datos reales
│   ├── datos-demo.js        datos simulados (?demo)
│   ├── imagen.js            compresión de fotos en el celular
│   └── firebase-config.js   ← pegar aquí la config web de Firebase (una sola vez)
├── plantilla-evento/        ← molde para eventos nuevos
├── eventos/
│   └── Cata-y-Daniel-13-Nov-2026/
│       ├── evento.config.js ← textos, colores, tiempo inicial
│       ├── index.html  pantalla.html  admin.html  og.png
├── scripts/nuevo-evento.mjs
├── firestore.rules          ← seguridad
└── vercel.json              ← enlaces cortos y cabeceras
```

## Probar sin Firebase (modo demo)

Desde la raíz del repo:

```bash
npx serve .
```

Abre en el mismo navegador, cada una en una pestaña:

- `http://localhost:3000/eventos/Cata-y-Daniel-13-Nov-2026/pantalla?demo&seg=8` (`seg` acelera el cambio solo en demo)
- `http://localhost:3000/eventos/Cata-y-Daniel-13-Nov-2026/?demo`
- `http://localhost:3000/eventos/Cata-y-Daniel-13-Nov-2026/admin?demo`

Las pestañas se sincronizan entre sí. Nada se guarda.

## Puesta en marcha (una sola vez)

1. **Firebase** → crea un proyecto (plan gratis Spark sirve; no se usa Storage).
   - *Firestore Database* → Crear base de datos (modo producción, región `southamerica-east1` o la más cercana).
   - *Authentication* → Sign-in method → habilita **Google**. En *Settings → Authorized domains* agrega tu dominio de Vercel.
   - *Configuración del proyecto → Tus apps → Web* → registra la app y copia el objeto `firebaseConfig` en `core/firebase-config.js` (no es secreto).
2. **Administradores:** en Firestore crea la colección `admins` y un documento cuyo **ID sea tu correo de Google** (puede estar vacío). Repite por cada persona que vaya a manejar el panel. Los correos no quedan en el código.
3. **Reglas:** copia `cp .firebaserc.example .firebaserc`, pon el ID del proyecto y despliega:
   ```bash
   firebase deploy --only firestore
   ```
   (o pega `firestore.rules` en Consola → Firestore → Reglas → Publicar).
4. **Vercel:** importa el repo de GitHub, sin framework ni build. Dominio actual: `birthday-memories-blond.vercel.app` (si cambia, corrige `og:image` en el `index.html` de cada evento y el dominio por defecto en `scripts/nuevo-evento.mjs`).
5. **Abre el panel del evento una vez** y entra con Google: eso crea el evento en Firestore y abre la recepción de fotos. Hasta entonces los invitados ven «Por ahora no se reciben fotos».

## El día de la fiesta

1. TV: abre el enlace de la pantalla y pulsa el botón de pantalla completa. La pantalla se mantiene encendida sola (Wake Lock) en navegadores compatibles.
2. Comparte el enlace corto o imprime el QR del panel (el QR **no** aparece en el TV).
3. Desde el celular, en el panel: aprueba fotos y ajusta el tiempo. Lo aprobado entra solo a la rotación.
4. Al terminar, apaga «Recibir fotos».

## Música (opcional)

El panel tiene un buscador de YouTube: **▶ Ya** suena de una en el TV, **+ Cola** la deja para después, y una playlist de fondo suena cuando la cola se acaba. El buscador usa la función `api/youtube.js` de Vercel, que necesita dos variables de entorno en Vercel (Settings → Environment Variables):

- `YOUTUBE_API_KEY`: llave de **YouTube Data API v3** (Google Cloud → APIs y servicios → Credenciales). Restríngela a esa API.
- `FIREBASE_PROJECT_ID`: el ID del proyecto de Firebase.

La llave nunca va al navegador y la función solo responde a administradores con sesión iniciada.

## Crear un evento nuevo

```bash
node scripts/nuevo-evento.mjs Ana-15-Dic-2026 "Ana" /ana https://tu-dominio.vercel.app
```

Esto copia `plantilla-evento/` a `eventos/Ana-15-Dic-2026/`, llena nombres e ID y agrega el enlace corto `/ana` a `vercel.json`. Después ajusta `evento.config.js` (título, mensaje en grande, colores en `tema`) y, si quieres, pon un `og.png` propio (1200×630) para la vista previa de WhatsApp.

## Cómo funciona por dentro

- Las fotos se comprimen en el celular (WebP o JPEG, máx. 1600 px, menos de ~750 KB) y se guardan en Firestore: la imagen grande en `eventos/{id}/imagenes` y la miniatura y los datos en `eventos/{id}/fotos`. El TV solo descarga la imagen grande cuando va a mostrarla.
- Los invitados solo pueden **crear** fotos pendientes; no pueden ver las pendientes de otros ni aprobar nada. El TV solo lee lo aprobado.
- Formulario con trampa anti-bots (honeypot) y límites validados también en las reglas (nombre ≤ 40, mensaje ≤ 300, máx. 10 fotos por envío, imagen < 1 MB).
- Plan gratis de Firestore: 1 GiB y 50 000 lecturas/día; alcanza de sobra para varias fiestas. Borra eventos viejos desde la consola si quieres liberar espacio.
