// Notificaciones push de "tenés eventos": un aviso por día por dispositivo,
// a la hora que cada uno haya elegido y de los eventos del día que haya
// elegido (el siguiente, que es el default histórico, o el de hoy). No hay
// tabla de "eventos ya avisados" ni nada parecido — el contenido se recalcula
// de cero cada vez, así que un cambio de picks o un evento que se agrega a
// último momento ya sale bien en el aviso de ese mismo día sin tocar nada.
const webpush = require('web-push');
const prisma = require('./prisma');
const { matcher } = require('./matcherPicks');

// Mismo offset fijo que lib/telemetria.js: Argentina no tiene horario de
// verano desde 2009, así que no hace falta una librería de zonas horarias
// para esto. La hora del aviso es siempre LOCAL (Argentina), venga del
// default o de lo que eligió cada dispositivo.
const OFFSET_MIN = -180;

// Los valores de fábrica de PushSubscription.hora/dia/detalle: son los
// mismos que el @default del schema, y describen el comportamiento que tenía
// el aviso antes de que se pudiera configurar (17 hs, eventos de mañana,
// sólo el número). Si cambia uno, cambiarlo en los dos lados.
const PREFERENCIAS_DEFECTO = { hora: 17, dia: 'siguiente', detalle: 'cantidad' };

// De qué día son los eventos que se avisan, como offset en días sobre hoy.
const DIAS = { hoy: 0, siguiente: 1 };
const DETALLES = ['cantidad', 'titulos'];

// Cuántos títulos entran en el cuerpo del aviso detallado antes de cortar con
// "y N más". El payload de un push tiene un límite de tamaño (~4 KB) y una
// notificación con quince renglones no la lee nadie: cinco alcanzan para
// saber de qué se trata y abrir la agenda si hace falta.
const MAX_TITULOS = 5;

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

// La fecha de calendario argentina de hoy, o la de dentro de `dias` días.
// Sumar 86.400.000 ms alcanza porque acá no hay horario de verano: todos los
// días duran lo mismo.
function diaISO(dias = 0) {
  return new Date(ahoraArgentina().getTime() + dias * 86400000).toISOString().slice(0, 10);
}

function hoyISO() {
  return diaISO(0);
}

// Valida lo que viene del cliente contra `base` (las preferencias que ya
// tenía esa suscripción, o los defaults). Cualquier valor fuera de rango o
// desconocido se ignora en silencio y queda el anterior: son preferencias de
// visualización, no vale plantar un 400 por un select raro.
function normalizarPreferencias(entrada, base = PREFERENCIAS_DEFECTO) {
  const p = entrada || {};
  const hora = Number(p.hora);
  return {
    hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : base.hora,
    dia: Object.prototype.hasOwnProperty.call(DIAS, p.dia) ? p.dia : base.dia,
    detalle: DETALLES.includes(p.detalle) ? p.detalle : base.detalle,
  };
}

function preferenciasDe(sub) {
  return normalizarPreferencias(sub, PREFERENCIAS_DEFECTO);
}

async function registrarSuscripcion({ endpoint, keys, userId, picks, preferencias }) {
  const data = {
    p256dh: keys.p256dh,
    auth: keys.auth,
    userId: userId || null,
    // Sólo se usa cuando NO hay cuenta (ver el comentario en schema.prisma):
    // con cuenta manda siempre User.picks, que está siempre al día.
    picks: JSON.stringify(picks || []),
  };

  // Las preferencias NO se pisan cuando no vienen en el pedido: volver a
  // suscribirse pasa también al sincronizar los picks de alguien sin cuenta
  // (sincronizarPicksSiActivo en client/src/lib/push.js), y ahí resetear la
  // hora elegida al default sería una sorpresa fea.
  const prefs = preferencias ? normalizarPreferencias(preferencias) : null;

  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { ...data, ...(prefs || {}) },
    create: { endpoint, ...data, ...(prefs || PREFERENCIAS_DEFECTO) },
  });
}

async function eliminarSuscripcion(endpoint) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Las preferencias de UNA suscripción, para que ConfiguracionDialog.jsx
// muestre lo que está guardado en vez de asumir los defaults. Devuelve null
// si ese endpoint no está suscripto (el navegador puede tener una suscripción
// que el server ya borró por un 410).
async function leerPreferencias(endpoint) {
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  return sub ? preferenciasDe(sub) : null;
}

async function guardarPreferencias(endpoint, preferencias) {
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  if (!sub) return null;
  const prefs = normalizarPreferencias(preferencias, preferenciasDe(sub));
  await prisma.pushSubscription.update({ where: { endpoint }, data: prefs });
  return prefs;
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

// Un evento cae en `dia` si `dia` está entre `date` y `endDate` (inclusive),
// o es exactamente `date` cuando no hay tramo. Comparan bien como string
// porque las dos son siempre 'YYYY-MM-DD'.
function caeEn(ev, dia) {
  return ev.date <= dia && dia <= (ev.endDate || ev.date);
}

// Para ordenar la lista del aviso detallado. `time` es texto libre (ver
// "Modelo de datos" en CLAUDE.md): alcanza con leer el número del principio,
// que sirve tanto para '8.15' como para '8 a 15'. Lo que no empieza con un
// número (o no tiene hora) va al final, como en el calendario.
function minutosDe(ev) {
  const m = /^\s*(\d{1,2})(?:[.:](\d{2}))?/.exec(ev.time || '');
  if (!m) return 24 * 60 + 1;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

function etiquetaDe(ev) {
  return ev.time ? `${ev.time} ${ev.title}` : ev.title;
}

// El texto del aviso, según lo que eligió el dispositivo. Con 'titulos' el
// resumen va en el título de la notificación y el detalle en el cuerpo: es
// lo que mejor se lee en la bandeja del celular, donde el cuerpo puede venir
// recortado a un renglón.
function armarPayload(eventos, prefs) {
  const cuando = prefs.dia === 'hoy' ? 'Hoy' : 'Mañana';
  const cantidad = eventos.length;
  const plural = cantidad === 1 ? '1 evento' : `${cantidad} eventos`;

  if (prefs.detalle === 'titulos') {
    const lista = [...eventos].sort((a, b) => minutosDe(a) - minutosDe(b)).map(etiquetaDe);
    const visibles = lista.slice(0, MAX_TITULOS);
    const resto = lista.length - visibles.length;
    if (resto > 0) visibles.push(resto === 1 ? 'y 1 más' : `y ${resto} más`);
    return {
      title: `${cuando} tenés ${plural}`,
      body: visibles.join(' · '),
      url: '/',
    };
  }

  return {
    title: 'Agenda escolar',
    body: `${cuando} tenés ${plural} en la agenda.`,
    url: '/',
  };
}

// El trabajo del aviso: recorre las suscripciones que corresponden (no son
// muchas para una agenda de un colegio, así que no vale la pena optimizar la
// consulta) y le manda el push a la que tenga algo el día que eligió.
//
// - `hora`: la corrida programada, que toma sólo las suscripciones de esa
//   hora a las que todavía no se les avisó hoy y las marca como avisadas.
// - `soloEndpoint`: la prueba manual desde ConfiguracionDialog.jsx, que corre
//   para ESE dispositivo sin mirar la hora y SIN marcar nada — probar a las
//   16 no puede dejar sin aviso al de las 17.
async function revisarYNotificar({ hora = null, soloEndpoint = null } = {}) {
  const hoy = hoyISO();

  const where = {};
  if (soloEndpoint) where.endpoint = soloEndpoint;
  if (hora !== null) {
    where.hora = hora;
    // `not` a secas dejaría afuera las filas con ultimoAviso NULL (las que
    // nunca recibieron un aviso), que son justamente las que hay que avisar.
    where.OR = [{ ultimoAviso: null }, { ultimoAviso: { not: hoy } }];
  }

  const suscripciones = await prisma.pushSubscription.findMany({
    where,
    include: { user: { select: { picks: true } } },
  });
  if (suscripciones.length === 0) return 0;

  // Se marcan TODAS las de esta corrida, tengan o no algo que avisar: lo que
  // evita el marcador es volver a mirarlas cada 5 minutos durante la hora del
  // aviso, no sólo repetir un push.
  if (hora !== null) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: suscripciones.map((s) => s.id) } },
      data: { ultimoAviso: hoy },
    });
  }

  // Cada suscripción puede estar mirando un día distinto ('hoy' o el
  // siguiente), así que se traen los eventos una sola vez y el filtro por día
  // se hace por suscripción.
  const oficiales = await prisma.event.findMany();

  // Los personales sólo existen para cuentas (ver el comentario de arriba):
  // se traen una sola vez por cuenta, no por suscripción — la misma persona
  // puede tener el celular y la compu suscriptos.
  const userIds = [...new Set(suscripciones.map((s) => s.userId).filter(Boolean))];
  const personalesPorUsuario = new Map();
  if (userIds.length > 0) {
    const personales = await prisma.personalEvent.findMany({ where: { userId: { in: userIds } } });
    personales.forEach((ev) => {
      if (!personalesPorUsuario.has(ev.userId)) personalesPorUsuario.set(ev.userId, []);
      personalesPorUsuario.get(ev.userId).push(ev);
    });
  }

  // Eventos compartidos: cada usuario puede estar suscripto a los eventos
  // personales de otra cuenta (EventSubscription). Se traen los PersonalEvent
  // de cada owner al que está suscripto para sumarlos a los suyos.
  const compartidosPorUsuario = new Map();
  if (userIds.length > 0) {
    const subs = await prisma.eventSubscription.findMany({
      where: { subscriberId: { in: userIds } },
      select: { subscriberId: true, ownerId: true },
    });
    if (subs.length > 0) {
      const ownerIds = [...new Set(subs.map((s) => s.ownerId))];
      const compartidos = await prisma.personalEvent.findMany({ where: { userId: { in: ownerIds } } });
      subs.forEach(({ subscriberId, ownerId }) => {
        const suyos = compartidos.filter((ev) => ev.userId === ownerId);
        if (suyos.length === 0) return;
        if (!compartidosPorUsuario.has(subscriberId)) compartidosPorUsuario.set(subscriberId, []);
        compartidosPorUsuario.get(subscriberId).push(...suyos);
      });
    }
  }

  const enviados = await Promise.all(
    suscripciones.map((sub) => enviarSiCorresponde(sub, oficiales, personalesPorUsuario, compartidosPorUsuario)),
  );
  return enviados.filter(Boolean).length;
}

async function enviarSiCorresponde(sub, oficiales, personalesPorUsuario, compartidosPorUsuario) {
  let picks = [];
  try {
    picks = JSON.parse((sub.user ? sub.user.picks : sub.picks) || '[]');
  } catch (err) {
    picks = [];
  }

  const prefs = preferenciasDe(sub);
  const dia = diaISO(DIAS[prefs.dia]);
  const visible = matcher(picks);

  const eventos = [
    ...oficiales.filter((ev) => caeEn(ev, dia) && visible(ev)),
    ...(personalesPorUsuario.get(sub.userId) || []).filter((ev) => caeEn(ev, dia)),
    ...(compartidosPorUsuario.get(sub.userId) || []).filter((ev) => caeEn(ev, dia)),
  ];
  if (eventos.length === 0) return false;

  const payload = JSON.stringify(armarPayload(eventos, prefs));

  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return true;
  } catch (err) {
    // 404/410: el navegador dio de baja la suscripción del lado del servicio
    // de push (desinstaló la app, borró datos del sitio, etc.) — insistirle
    // no tiene sentido, se saca de la base.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await eliminarSuscripcion(sub.endpoint);
    } else {
      console.error('No se pudo enviar el push a', sub.endpoint, err.message);
    }
    return false;
  }
}

// Nada de node-cron: alcanza con fijarse cada 5 minutos qué hora argentina es
// y avisarles a las suscripciones que eligieron ESA hora y todavía no
// recibieron el aviso de hoy (mismo espíritu que el corte de día de
// lib/telemetria.js). Antes el "ya se mandó hoy" era un flag en memoria del
// proceso porque la hora era una sola para todos; ahora vive en la base
// (PushSubscription.ultimoAviso), así que un reinicio en la ventana del aviso
// tampoco lo repite.
function iniciarScheduler() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas: no se van a mandar notificaciones push.');
    return;
  }
  setInterval(() => {
    const hora = ahoraArgentina().getUTCHours();
    revisarYNotificar({ hora }).catch((err) => console.error('Falló el aviso diario de push', err));
  }, 5 * 60 * 1000);
}

module.exports = {
  PREFERENCIAS_DEFECTO,
  registrarSuscripcion,
  eliminarSuscripcion,
  leerPreferencias,
  guardarPreferencias,
  enviarPrueba,
  revisarYNotificar,
  iniciarScheduler,
};
