// Capa de datos real con Firebase (Firestore + Auth con Google).
// Las fotos se guardan comprimidas dentro de Firestore, así no hace falta
// Firebase Storage (que exige el plan Blaze). Estructura:
//   eventos/{eventoId}                 → ajustes y control de la presentación
//   eventos/{eventoId}/fotos/{id}      → datos de la foto + miniatura
//   eventos/{eventoId}/imagenes/{id}   → imagen grande (solo se lee al mostrarla)
//   admins/{correo}                    → quién puede entrar al panel
import { firebaseConfig } from './firebase-config.js';

const V = '11.0.2';
const BASE = `https://www.gstatic.com/firebasejs/${V}`;

// Sin "await" de nivel superior: los navegadores de algunos televisores no lo soportan.
let fs;

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

export async function crearDatos(eventoId) {
  const [{ initializeApp }, firestore] = await Promise.all([
    import(`${BASE}/firebase-app.js`),
    import(`${BASE}/firebase-firestore.js`),
  ]);
  fs = firestore;
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const refEvento = fs.doc(db, 'eventos', eventoId);
  const colFotos = fs.collection(refEvento, 'fotos');
  const colImagenes = fs.collection(refEvento, 'imagenes');

  const aFoto = (d) => {
    const x = d.data();
    return { id: d.id, ...x, creadaEn: ms(x.creadaEn), aprobadaEn: ms(x.aprobadaEn) };
  };
  const aEvento = (x) => ({
    ...x,
    enVivo: x.enVivo ? { ...x.enVivo, en: ms(x.enVivo.en) } : null,
  });

  let authMod = null;
  let auth = null;
  async function obtenerAuth() {
    if (!authMod) {
      authMod = await import(`${BASE}/firebase-auth.js`);
      auth = authMod.getAuth(app);
    }
    return { a: authMod, auth };
  }

  return {
    modo: 'firebase',

    escucharEvento(cb) {
      return fs.onSnapshot(
        refEvento,
        (s) => cb(s.exists() ? aEvento(s.data()) : null),
        (e) => { console.error('evento', e); cb(null); },
      );
    },

    escucharAprobadas(cb) {
      const q = fs.query(colFotos, fs.where('estado', '==', 'aprobada'));
      return fs.onSnapshot(q, (s) => cb(s.docs.map(aFoto)), (e) => console.error('aprobadas', e));
    },

    escucharTodas(cb) {
      const q = fs.query(colFotos, fs.orderBy('creadaEn', 'desc'));
      return fs.onSnapshot(q, (s) => cb(s.docs.map(aFoto)), (e) => console.error('todas', e));
    },

    async obtenerImagen(fotoId) {
      const s = await fs.getDoc(fs.doc(colImagenes, fotoId));
      if (!s.exists()) throw new Error('Imagen no encontrada');
      return s.data().imagen;
    },

    reportarEnVivo(fotoId, total) {
      return fs.updateDoc(refEvento, { enVivo: { fotoId, total, en: fs.serverTimestamp() } });
    },

    async enviarFoto(f) {
      const ref = fs.doc(colFotos);
      const lote = fs.writeBatch(db);
      lote.set(fs.doc(colImagenes, ref.id), { imagen: f.imagen, creadaEn: fs.serverTimestamp() });
      lote.set(ref, {
        nombre: f.nombre,
        mensaje: f.mensaje,
        estado: f.aprobada ? 'aprobada' : 'pendiente',
        creadaEn: fs.serverTimestamp(),
        aprobadaEn: f.aprobada ? fs.serverTimestamp() : null,
        miniatura: f.miniatura,
        grupoId: f.grupoId,
        grupoIndice: f.grupoIndice,
        grupoTotal: f.grupoTotal,
        ancho: f.ancho,
        alto: f.alto,
      });
      await lote.commit();
    },

    // ---------- Solo administradores ----------
    async iniciarSesion() {
      const { a, auth } = await obtenerAuth();
      const proveedor = new a.GoogleAuthProvider();
      proveedor.setCustomParameters({ prompt: 'select_account' });
      try {
        await a.signInWithPopup(auth, proveedor);
      } catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-environment'].includes(e.code)) {
          await a.signInWithRedirect(auth, proveedor);
        } else throw e;
      }
    },

    async cerrarSesion() {
      const { a, auth } = await obtenerAuth();
      await a.signOut(auth);
    },

    async escucharSesion(cb) {
      const { a, auth } = await obtenerAuth();
      return a.onAuthStateChanged(auth, async (u) => {
        if (!u) return cb({ usuario: null, esAdmin: false });
        let esAdmin = false;
        try {
          esAdmin = (await fs.getDoc(fs.doc(db, 'admins', u.email))).exists();
        } catch { esAdmin = false; }
        cb({ usuario: { nombre: u.displayName, email: u.email, foto: u.photoURL }, esAdmin });
      });
    },

    async asegurarEvento(valores) {
      const s = await fs.getDoc(refEvento);
      if (!s.exists()) {
        await fs.setDoc(refEvento, { ...valores, comando: null, enVivo: null, creadoEn: fs.serverTimestamp() });
      }
    },

    actualizarEvento(cambios) {
      return fs.updateDoc(refEvento, cambios);
    },

    enviarComando(tipo, fotoId = null) {
      return fs.updateDoc(refEvento, {
        comando: { tipo, fotoId, nonce: Math.random().toString(36).slice(2), en: fs.serverTimestamp() },
      });
    },

    aprobar(id) {
      return fs.updateDoc(fs.doc(colFotos, id), { estado: 'aprobada', aprobadaEn: fs.serverTimestamp() });
    },

    async aprobarVarias(ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const lote = fs.writeBatch(db);
        ids.slice(i, i + 400).forEach((id) =>
          lote.update(fs.doc(colFotos, id), { estado: 'aprobada', aprobadaEn: fs.serverTimestamp() }));
        await lote.commit();
      }
    },

    desaprobar(id) {
      return fs.updateDoc(fs.doc(colFotos, id), { estado: 'pendiente', aprobadaEn: null });
    },

    editarMensaje(id, mensaje) {
      return fs.updateDoc(fs.doc(colFotos, id), { mensaje });
    },

    async eliminar(id) {
      const lote = fs.writeBatch(db);
      lote.delete(fs.doc(colFotos, id));
      lote.delete(fs.doc(colImagenes, id));
      await lote.commit();
    },
  };
}
