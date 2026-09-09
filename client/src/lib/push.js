// Notificaciones push de "tenés eventos". Todo lo que toca el navegador
// (Service Worker, permiso, PushManager) vive acá; los componentes sólo
// llaman a estas funciones y muestran el resultado.
import { api } from '../api';

const PREGUNTADO_KEY = 'sg-notif-preguntado-v1';

// Espejo de PREFERENCIAS_DEFECTO de server/src/lib/push.js: lo que se muestra
// mientras el server no contestó todavía. La fuente de verdad es la fila de
// PushSubscription — esto es sólo para no pintar los selects vacíos.
export const PREFERENCIAS_DEFECTO = { hora: 17, dia: 'siguiente', detalle: 'cantidad' };

// Feature-detection, no de sistema operativo: en iPhone con Safari esto da
// `false` salvo que la agenda ya esté agregada a la pantalla de inicio —eso
// es una limitación de Apple, no algo que se pueda evitar desde acá— y en
// navegadores de escritorio sin permiso persistente (algunos in-app browsers)
// también da `false`. No tiene sentido ofrecer el prompt donde no va a andar.
export function soportaPush() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

export function yaSePregunto() {
  try {
    return window.localStorage.getItem(PREGUNTADO_KEY) === '1';
  } catch (err) {
    return true; // sin storage no hay forma de no volver a preguntar: mejor no insistir
  }
}

export function marcarPreguntado() {
  try {
    window.localStorage.setItem(PREGUNTADO_KEY, '1');
  } catch (err) {
    /* sin storage, se va a volver a preguntar la próxima visita */
  }
}

// El navegador pide la clave del servidor en bytes, no en el string base64url
// que manda la API — es la conversión de siempre para VAPID.
function base64UrlABytes(base64Url) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registrarSW() {
  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registro;
}

// Estado actual, siempre en vivo (nunca de un flag guardado): el permiso se
// puede revocar desde la configuración del navegador sin que la app se
// entere, así que preguntarle al navegador es lo único confiable.
export async function estadoNotificaciones() {
  if (!soportaPush()) return { soportado: false, activo: false };
  if (Notification.permission !== 'granted') return { soportado: true, activo: false };

  try {
    const registro = await navigator.serviceWorker.getRegistration();
    const sub = registro && (await registro.pushManager.getSubscription());
    return { soportado: true, activo: Boolean(sub) };
  } catch (err) {
    return { soportado: true, activo: false };
  }
}

// La suscripción de ESTE navegador, o null si no hay ninguna. Es el dato con
// el que se leen y se guardan las preferencias: son de la suscripción, no de
// la cuenta (el celular y la compu pueden querer avisos distintos).
async function suscripcionActual() {
  if (!soportaPush()) return null;
  try {
    const registro = await navigator.serviceWorker.getRegistration();
    return (registro && (await registro.pushManager.getSubscription())) || null;
  } catch (err) {
    return null;
  }
}

// Pide permiso y, si lo dan, suscribe. `picks` sólo importa sin cuenta (ver
// el comentario de PushSubscription en schema.prisma) — con cuenta manda
// siempre lo que ya está guardado en el server. `preferencias` es opcional a
// propósito: cuando no va, el server deja las que ya tenía la suscripción.
export async function activarNotificaciones({ picks, token, preferencias }) {
  if (!soportaPush()) return { ok: false, motivo: 'no-soportado' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'denegado' };

  const registro = await registrarSW();

  let sub = await registro.pushManager.getSubscription();
  if (!sub) {
    const { clave } = await api.push.clavePublica();
    sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(clave),
    });
  }

  await api.push.suscribir(token, sub.toJSON(), picks || [], preferencias);
  return { ok: true };
}

// Las preferencias del aviso (hora, de qué día y con cuánto detalle) tal como
// están guardadas en el server para este navegador. Sin suscripción devuelve
// los defaults, que es lo que va a quedar cuando se active.
export async function leerPreferencias(token) {
  const sub = await suscripcionActual();
  if (!sub) return PREFERENCIAS_DEFECTO;
  const { preferencias } = await api.push.leerPreferencias(token, sub.endpoint);
  return preferencias;
}

export async function guardarPreferencias(token, preferencias) {
  const sub = await suscripcionActual();
  if (!sub) return { ok: false, motivo: 'no-activo' };
  const { preferencias: guardadas } = await api.push.guardarPreferencias(token, sub.endpoint, preferencias);
  return { ok: true, preferencias: guardadas };
}

// Sin cuenta, los picks de la suscripción quedan fijos al momento de
// activarla —no hay otro lugar donde guardarlos (ver el comentario de
// PushSubscription en schema.prisma)—, así que si cambian los filtros
// después hay que volver a mandarlos. No hace nada si las notificaciones no
// están activas, y si hay cuenta tampoco: ahí el server ya usa siempre
// User.picks, que está siempre al día.
export async function sincronizarPicksSiActivo(picks, token) {
  if (token) return;
  const { activo } = await estadoNotificaciones();
  if (!activo) return;
  await activarNotificaciones({ picks, token });
}

// Botón "Probar" de ConfiguracionDialog: manda un push ya mismo a la
// suscripción de ESTE navegador, token propio para no tener que esperar al
// aviso diario. `token` opcional, igual que el resto de este archivo.
export async function probarNotificaciones(token) {
  if (!soportaPush()) return { ok: false, motivo: 'no-soportado' };

  const sub = await suscripcionActual();
  if (!sub) return { ok: false, motivo: 'no-activo' };

  await api.push.probar(token, sub.endpoint);
  return { ok: true };
}

// Botón "Probar aviso del día": ejecuta el mismo trabajo que el scheduler
// pero ahora mismo y sólo para este navegador. A diferencia de
// probarNotificaciones, éste pasa por el matcher de picks y por las
// preferencias guardadas, así que la notificación que llega tiene el texto
// real del aviso. Si el día que elegiste no hay nada que te corresponda no
// llega ninguna notificación (igual que pasaría a la hora del aviso): eso es
// lo que dice `enviados: 0`.
export async function probarAviso(token) {
  if (!soportaPush()) return { ok: false, motivo: 'no-soportado' };

  const sub = await suscripcionActual();
  if (!sub) return { ok: false, motivo: 'no-activo' };

  const { enviados } = await api.push.probarAviso(token, sub.endpoint);
  return { ok: true, enviados };
}

export async function desactivarNotificaciones(token) {
  if (!soportaPush()) return;
  const sub = await suscripcionActual();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try {
    await api.push.desuscribir(token, endpoint);
  } catch (err) {
    /* si falla, la fila queda huérfana en el server y el próximo aviso le
       pega a un endpoint que ya no existe — se autolimpia sola ahí (ver
       server/src/lib/push.js, borra en 404/410) */
  }
}
