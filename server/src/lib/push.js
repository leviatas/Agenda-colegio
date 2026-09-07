// Notificaciones push de "hoy tenés eventos": un aviso por día, sólo si hay
// algo. No hay tabla de "eventos ya avisados" ni nada parecido — se recalcula
// de cero cada vez, así que un cambio de picks o un evento que se agrega a
// último momento ya sale bien en el aviso del día siguiente sin tocar nada.
const webpush = require('web-push');
const prisma = require('./prisma');
const { matcher } = require('./matcherPicks');

// Mismo offset fijo que lib/telemetria.js: Argentina no tiene horario de
// verano desde 2009, así que no hace falta una librería de zonas horarias
// para esto. HORA_AVISO es la hora LOCAL (Argentina) a la que sale el aviso.
const OFFSET_MIN = -180;
const HORA_AVISO = 8;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

function ahoraArgentina() {
  return new Date(Date.now() + OFFSET_MIN * 60000);
}

function hoyISO() {
  return ahoraArgentina().toISOString().slice(0, 10);
}

async function registrarSuscripcion({ endpoint, keys, userId, picks }) {
  const data = {
    p256dh: keys.p256dh,
    auth: keys.auth,
    userId: userId || null,
    // Sólo se usa cuando NO hay cuenta (ver el comentario en schema.prisma):
    // con cuenta manda siempre User.picks, que está siempre al día.
    picks: JSON.stringify(picks || []),
  };
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: data,
    create: { endpoint, ...data },
  });
}

async function eliminarSuscripcion(endpoint) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Push de prueba, para el botón "Probar" de ConfiguracionDialog.jsx: manda
// uno ya mismo a ESA suscripción puntual (no a todos los dispositivos de la
// cuenta), sin pasar por el matcher de picks — si tocaste el botón es porque
// ya sabés que la querés recibir. Devuelve el mismo motivo de error que usa
// el resto del módulo para que la ruta lo pueda traducir a un mensaje.
async function enviarPrueba(endpoint) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { ok: false, motivo: 'no-configurado' };
  }
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (!sub) return { ok: false, motivo: 'sin-suscripcion' };

  const payload = JSON.stringify({
    title: 'Agenda escolar',
    body: 'Esto es una prueba: si te llegó, las notificaciones están andando.',
    url: '/',
  });

  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await eliminarSuscripcion(sub.endpoint);
      return { ok: false, motivo: 'vencida' };
    }
    console.error('No se pudo mandar el push de prueba a', sub.endpoint, err.message);
    return { ok: false, motivo: 'error' };
  }
}

// Un evento cae hoy si `hoy` está entre `date` y `endDate` (inclusive), o es
// exactamente `date` cuando no hay tramo. Comparan bien como string porque
// las dos son siempre 'YYYY-MM-DD'.
function caeHoy(ev, hoy) {
  return ev.date <= hoy && hoy <= (ev.endDate || ev.date);
}

// El trabajo del día: recorre TODAS las suscripciones (no son muchas para una
// agenda de un colegio, así que no vale la pena optimizar la consulta) y le
// manda el push a la que tenga algo hoy.
async function revisarYNotificarHoy() {
  const hoy = hoyISO();

  const suscripciones = await prisma.pushSubscription.findMany({
    include: { user: { select: { picks: true } } },
  });
  if (suscripciones.length === 0) return;

  const oficiales = await prisma.event.findMany();
  const oficialesHoy = oficiales.filter((ev) => caeHoy(ev, hoy));

  // Los personales sólo existen para cuentas (ver el comentario de arriba):
  // se traen una sola vez por cuenta, no por suscripción — la misma persona
  // puede tener el celular y la compu suscriptos.
  const userIds = [...new Set(suscripciones.map((s) => s.userId).filter(Boolean))];
  const personalesPorUsuario = new Map();
  if (userIds.length > 0) {
    const personales = await prisma.personalEvent.findMany({ where: { userId: { in: userIds } } });
    personales.filter((ev) => caeHoy(ev, hoy)).forEach((ev) => {
      if (!personalesPorUsuario.has(ev.userId)) personalesPorUsuario.set(ev.userId, 0);
      personalesPorUsuario.set(ev.userId, personalesPorUsuario.get(ev.userId) + 1);
    });
  }

  await Promise.all(
    suscripciones.map((sub) => enviarSiCorresponde(sub, oficialesHoy, personalesPorUsuario)),
  );
}

async function enviarSiCorresponde(sub, oficialesHoy, personalesPorUsuario) {
  let picks = [];
  try {
    picks = JSON.parse((sub.user ? sub.user.picks : sub.picks) || '[]');
  } catch (err) {
    picks = [];
  }

  const visible = matcher(picks);
  const cantidad = oficialesHoy.filter(visible).length + (personalesPorUsuario.get(sub.userId) || 0);
  if (cantidad === 0) return;

  const payload = JSON.stringify({
    title: 'Agenda escolar',
    body: cantidad === 1 ? 'Hoy tenés 1 evento en la agenda.' : `Hoy tenés ${cantidad} eventos en la agenda.`,
    url: '/',
  });

  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
  } catch (err) {
    // 404/410: el navegador dio de baja la suscripción del lado del servicio
    // de push (desinstaló la app, borró datos del sitio, etc.) — insistirle
    // no tiene sentido, se saca de la base.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await eliminarSuscripcion(sub.endpoint);
    } else {
      console.error('No se pudo enviar el push a', sub.endpoint, err.message);
    }
  }
}

// Nada de node-cron: alcanza con fijarse cada 5 minutos si ya es la hora del
// aviso y todavía no se mandó hoy (mismo espíritu que el corte de día de
// lib/telemetria.js). `ultimoEnviado` vive en memoria del proceso, así que un
// reinicio justo en la ventana de HORA_AVISO puede repetir el aviso una vez
// — aceptable para esto, al revés de perderlo silenciosamente.
let ultimoEnviado = null;

function iniciarScheduler() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas: no se van a mandar notificaciones push.');
    return;
  }
  setInterval(() => {
    const ahora = ahoraArgentina();
    const hoy = hoyISO();
    if (ahora.getUTCHours() === HORA_AVISO && ultimoEnviado !== hoy) {
      ultimoEnviado = hoy;
      revisarYNotificarHoy().catch((err) => console.error('Falló el aviso diario de push', err));
    }
  }, 5 * 60 * 1000);
}

module.exports = { registrarSuscripcion, eliminarSuscripcion, enviarPrueba, revisarYNotificarHoy, iniciarScheduler };
