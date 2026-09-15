// El calendario "San Gabriel" en el Google Calendar de cada cuenta que dio el
// permiso: una COPIA que mantiene el server con lo que esa cuenta ve en la
// agenda — los oficiales que le tocan según sus picks, sus eventos propios y
// los que le comparten por código. Cambiar los filtros, cargar un evento o que
// el admin edite el oficial vuelve a sincronizar solo.
//
// Es OPT-IN: el login sigue pidiendo sólo la identidad, y este permiso se pide
// únicamente cuando la persona toca "Dar permiso" en Configuración. Una cuenta
// sin fila en CalendarioGoogle no tiene nada que sincronizar y todo lo de acá
// es un no-op para ella.
//
// A diferencia del botón de "agregar a Google Calendar" (que es un link y no
// toca nada), acá SÍ se usa la API de Calendar, con el scope
// `calendar.app.created`: deja crear calendarios y tocar sólo los que creó la
// propia app. El resto del Google Calendar de la persona queda fuera de
// alcance, que es lo que se le promete en la ventana de permiso.
//
// No hay tabla de "qué evento de Google es cuál": cada evento que se crea
// lleva en sus extendedProperties privadas la clave del evento de la agenda
// (`o12` oficial, `p34` personal) y una huella del contenido. Cada pasada lista
// lo que hay allá, lo compara con lo que tendría que haber y crea, actualiza o
// borra sólo la diferencia — mismo espíritu que el aviso de push: se recalcula
// de cero, así que no hay nada que se pueda desincronizar entre dos tablas.
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('./prisma');
const { matcher } = require('./matcherPicks');

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const NOMBRE = 'San Gabriel';

// Mismo criterio que client/src/lib/googleCalendar.js: las horas de la agenda
// son de Argentina, y el calendario se crea en ese huso.
const TZ = 'America/Argentina/Buenos_Aires';
const DURACION_MIN = 60;

// Cada cuánto se revisan TODAS las cuentas conectadas aunque nadie haya tocado
// nada. Es la red de seguridad para lo que no dispara una sincronización: el
// seed que vuelve a insertar un oficial borrado, un reinicio a mitad de una
// pasada, un error transitorio de Google.
const CADA_MS = 6 * 60 * 60 * 1000;

// Espera antes de sincronizar tras un cambio: quien cambia los filtros suele
// tocar varios seguidos, y el admin carga varios eventos de corrido. Cada
// cambio nuevo reinicia la cuenta, así sale una sola pasada al final.
const DEMORA_USUARIO_MS = 3000;
const DEMORA_TODOS_MS = 15000;

// Sin el secret no se puede canjear el código del permiso por un refresh
// token, así que el feature se apaga solo, igual que las push sin VAPID.
function configurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

class ErrorCalendario extends Error {}

// ── Cifrado del refresh token ─────────────────────────────────────────────
// AES-256-GCM con una clave derivada de JWT_SECRET: no suma otra variable al
// .env, y una copia suelta de la base no alcanza para escribir en el
// calendario de nadie.

function clave() {
  return crypto.createHash('sha256').update(`calendario-google:${process.env.JWT_SECRET}`).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

function descifrar(guardado) {
  const [iv, tag, datos] = String(guardado).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8');
}

// `postmessage` es el redirect URI que exige el flujo de popup de Google
// Identity Services: no hay que registrarlo en Cloud Console.
function clienteOAuth() {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: 'postmessage',
  });
}

// ── Llamadas a la API ─────────────────────────────────────────────────────

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function statusDe(err) {
  return err && err.response ? err.response.status : undefined;
}

function erroresDe(err) {
  const data = err && err.response && err.response.data;
  return (data && data.error && data.error.errors) || [];
}

// La cuota de Calendar es por usuario y por minuto: la primera pasada de una
// cuenta crea de golpe unos cien eventos y puede toparla. Ante un límite se
// espera y se reintenta, en vez de dejar el calendario a medio llenar.
async function llamar(cliente, { method = 'GET', path, params, data }) {
  for (let intento = 0; ; intento++) {
    try {
      const r = await cliente.request({ url: `${API}${path}`, method, params, data });
      return r.data;
    } catch (err) {
      const status = statusDe(err);
      const limitado = status === 429 || (status === 403 && erroresDe(err).some((e) => /rateLimitExceeded/.test(e.reason)));
      if (limitado && intento < 5) {
        await esperar(2 ** intento * 1000 + Math.random() * 500);
        continue;
      }
      throw err;
    }
  }
}

// El permiso ya no sirve: la persona lo sacó desde su cuenta de Google, o le
// destildó el acceso a calendarios. No tiene arreglo del lado del server.
function esPermisoPerdido(err) {
  const data = err && err.response && err.response.data;
  if (data && data.error === 'invalid_grant') return true;
  if (/invalid_grant/.test((err && err.message) || '')) return true;
  return statusDe(err) === 403 && erroresDe(err).some((e) => e.reason === 'insufficientPermissions');
}

// ── Evento de la agenda → evento de Google ────────────────────────────────
// Espejo de client/src/lib/googleCalendar.js (el botón de cada evento), para
// que un evento se vea igual por los dos caminos. Mismo motivo de duplicación
// que lib/catalogo.js: el build de Docker del cliente no entra en esta imagen.

const NIVELES = { fer: 'Feriado', ins: 'Institucional', ini: 'Inicial', pri: 'Primaria', sec: 'Secundaria' };

// Colores de evento de Google: los propios en violeta (como --per) y los
// feriados en rojo; lo demás toma el color del calendario.
const COLORES = { per: '3', fer: '11' };

const UNA = /^(\d{1,2})(?:[.:](\d{1,2}))?$/;
// "8 a 15" es como viene el calendario del colegio: un rango metido en el
// mismo campo `time` (ver CLAUDE.md, "Modelo de datos").
const RANGO = /^(\d{1,2})(?:[.:](\d{1,2}))?\s*a\s*(\d{1,2})(?:[.:](\d{1,2}))?$/i;

function minutos(h, m) {
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  if (!Number.isFinite(hh) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function reloj(txt) {
  const m = UNA.exec(String(txt || '').trim());
  return m ? minutos(m[1], m[2]) : null;
}

// { inicio, fin } en minutos, con `fin` null si el evento no dice cuándo
// termina. null entero = no hay hora utilizable y el evento va de día completo.
function horario(ev) {
  const txt = String(ev.time || '').trim();
  if (!txt) return null;

  const r = RANGO.exec(txt);
  if (r) {
    const inicio = minutos(r[1], r[2]);
    return inicio === null ? null : { inicio, fin: minutos(r[3], r[4]) };
  }

  const inicio = reloj(txt);
  if (inicio === null) return null;
  return { inicio, fin: reloj(ev.endTime) };
}

const dosDigitos = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${dosDigitos(Math.floor(min / 60))}:${dosDigitos(min % 60)}:00`;

function diaSiguiente(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Sin hora es de día completo, y ahí el fin es EXCLUSIVO (igual que en la URL
// del botón): un evento del 8 va del 8 al 9.
function tramo(ev) {
  const desde = ev.date;
  const hasta = ev.endDate || ev.date;
  const hs = horario(ev);

  if (!hs) return { start: { date: desde }, end: { date: diaSiguiente(hasta) } };

  // Sin hora de fin, o con una que no cierra (el mismo día terminando antes de
  // empezar), se le da una duración por default: Google rechaza un rango
  // invertido.
  let fin = hs.fin;
  if (fin === null || (hasta === desde && fin <= hs.inicio)) fin = hs.inicio + DURACION_MIN;
  const cierra = Math.min(fin, 23 * 60 + 59);

  return {
    start: { dateTime: `${desde}T${hhmm(hs.inicio)}`, timeZone: TZ },
    end: { dateTime: `${hasta}T${hhmm(cierra)}`, timeZone: TZ },
  };
}

function detalle(ev) {
  const lineas = [];
  if (ev.de) lineas.push(`Evento compartido por ${ev.de}.`);
  if (NIVELES[ev.level]) lineas.push(NIVELES[ev.level]);
  // Una hora que no se pudo interpretar no se pierde: va como texto.
  if (ev.time && !horario(ev)) lineas.push(`Horario: ${ev.endTime ? `${ev.time} a ${ev.endTime}` : ev.time}`);
  lineas.push('Agenda del Colegio San Gabriel');
  return lineas.join('\n');
}

// La huella se calcula sobre lo que se manda, así cualquier cambio de la
// agenda (o de cómo se arma el evento) la cambia y la próxima pasada lo
// actualiza. Un cambio hecho a mano en Google no la toca: ese evento queda
// como lo dejó la persona hasta que cambie algo del lado de la agenda.
function cuerpo(claveEvento, ev) {
  const base = { summary: ev.title, description: detalle(ev), ...tramo(ev) };
  if (COLORES[ev.level]) base.colorId = COLORES[ev.level];
  const huella = crypto.createHash('sha1').update(JSON.stringify(base)).digest('hex');
  return { ...base, extendedProperties: { private: { sgapp: '1', sgclave: claveEvento, sghuella: huella } } };
}

// Lo mismo que ve la cuenta en "Ver la agenda": los oficiales que le tocan
// según sus picks, más los propios y los compartidos, que no se filtran.
async function eventosDeseados(userId, picksRaw) {
  let picks = [];
  try {
    const v = JSON.parse(picksRaw || '[]');
    picks = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (err) {
    picks = [];
  }

  const [oficiales, propios, suscripciones] = await Promise.all([
    prisma.event.findMany(),
    prisma.personalEvent.findMany({ where: { userId } }),
    prisma.eventSubscription.findMany({ where: { subscriberId: userId }, select: { ownerId: true } }),
  ]);
  const ownerIds = suscripciones.map((s) => s.ownerId);
  const compartidos = ownerIds.length
    ? await prisma.personalEvent.findMany({
        where: { userId: { in: ownerIds } },
        include: { user: { select: { name: true } } },
      })
    : [];

  const visible = matcher(picks);
  return [
    ...oficiales.filter(visible).map((ev) => cuerpo(`o${ev.id}`, ev)),
    ...propios.map((ev) => cuerpo(`p${ev.id}`, { ...ev, level: 'per' })),
    ...compartidos.map((ev) => cuerpo(`p${ev.id}`, { ...ev, level: 'per', de: ev.user.name })),
  ];
}

// null si el calendario ya no existe (lo borraron desde Google).
async function listarEventos(cliente, calendarId) {
  const eventos = [];
  let pageToken;
  do {
    let pagina;
    try {
      pagina = await llamar(cliente, {
        path: `/calendars/${encodeURIComponent(calendarId)}/events`,
        params: { privateExtendedProperty: 'sgapp=1', maxResults: 2500, showDeleted: false, pageToken },
      });
    } catch (err) {
      if (statusDe(err) === 404 || statusDe(err) === 410) return null;
      throw err;
    }
    eventos.push(...(pagina.items || []));
    pageToken = pagina.nextPageToken;
  } while (pageToken);
  return eventos;
}

// ── Sincronización ────────────────────────────────────────────────────────

// Cuentas a las que se les pidió desconectar con una pasada en curso: la
// pasada lo mira entre escritura y escritura y corta, para no volver a crear
// el calendario que se está por borrar.
const cancelados = new Set();

class Cancelado extends Error {}

function chequear(userId) {
  if (cancelados.has(userId)) throw new Cancelado();
}

async function sincronizarAhora(userId) {
  if (!configurado()) return;
  const fila = await prisma.calendarioGoogle.findUnique({
    where: { userId },
    include: { user: { select: { picks: true } } },
  });
  if (!fila) return;

  let refresh;
  try {
    refresh = descifrar(fila.refreshToken);
  } catch (err) {
    // Cambió JWT_SECRET: el token guardado ya no se puede leer y no hay forma
    // de recuperarlo. Se borra la fila y la persona vuelve a dar el permiso.
    console.warn(`[calendario-google] no se pudo descifrar el permiso de la cuenta ${userId}; se descarta`);
    await prisma.calendarioGoogle.deleteMany({ where: { userId } });
    return;
  }

  const cliente = clienteOAuth();
  cliente.setCredentials({ refresh_token: refresh });

  try {
    let { calendarId } = fila;
    let existentes = calendarId ? await listarEventos(cliente, calendarId) : null;
    chequear(userId);

    if (existentes === null) {
      const cal = await llamar(cliente, {
        method: 'POST',
        path: '/calendars',
        data: {
          summary: NOMBRE,
          description: 'Agenda del Colegio San Gabriel: lo actualiza la agenda sola, con tus filtros y tus eventos personales.',
          timeZone: TZ,
        },
      });
      calendarId = cal.id;
      await prisma.calendarioGoogle.updateMany({ where: { userId }, data: { calendarId } });
      existentes = [];
    }

    const deseados = await eventosDeseados(userId, fila.user.picks);
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;

    // Si una pasada anterior se cortó a la mitad puede haber dos eventos con
    // la misma clave: el segundo sobra.
    const porClave = new Map();
    const sobran = [];
    existentes.forEach((e) => {
      const k = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.sgclave;
      if (!k || porClave.has(k)) sobran.push(e);
      else porClave.set(k, e);
    });

    let creados = 0;
    let actualizados = 0;
    for (const d of deseados) {
      chequear(userId);
      const k = d.extendedProperties.private.sgclave;
      const actual = porClave.get(k);
      if (!actual) {
        await llamar(cliente, { method: 'POST', path: base, data: d });
        creados++;
        continue;
      }
      porClave.delete(k);
      if (actual.extendedProperties.private.sghuella !== d.extendedProperties.private.sghuella) {
        await llamar(cliente, { method: 'PUT', path: `${base}/${encodeURIComponent(actual.id)}`, data: d });
        actualizados++;
      }
    }

    // Lo que quedó en porClave ya no le corresponde: un oficial que dejó de
    // matchear los filtros, un evento borrado, una suscripción que se cortó.
    sobran.push(...porClave.values());
    for (const e of sobran) {
      chequear(userId);
      try {
        await llamar(cliente, { method: 'DELETE', path: `${base}/${encodeURIComponent(e.id)}` });
      } catch (err) {
        if (statusDe(err) !== 404 && statusDe(err) !== 410) throw err;
      }
    }

    await prisma.calendarioGoogle.updateMany({
      where: { userId },
      data: { ultimaSync: new Date(), ultimoError: null },
    });
    if (creados || actualizados || sobran.length) {
      console.log(`[calendario-google] cuenta ${userId}: ${creados} creados, ${actualizados} actualizados, ${sobran.length} borrados`);
    }
  } catch (err) {
    if (err instanceof Cancelado) return;
    if (esPermisoPerdido(err)) {
      // Sin permiso no hay nada que reintentar: se borra la fila y en
      // Configuración vuelve a aparecer el botón para darlo.
      console.warn(`[calendario-google] la cuenta ${userId} ya no da permiso; se desconecta`);
      await prisma.calendarioGoogle.deleteMany({ where: { userId } });
      return;
    }
    console.error(`[calendario-google] falló la sincronización de la cuenta ${userId}:`, err.message);
    await prisma.calendarioGoogle.updateMany({
      where: { userId },
      data: { ultimoError: 'No se pudo actualizar el calendario de Google. Se vuelve a intentar solo en un rato.' },
    });
  }
}

// Una sola pasada por cuenta a la vez: dos en paralelo listarían lo mismo y
// crearían cada evento faltante dos veces. Si se pide otra mientras corre, se
// anota y sale al terminar la actual, con los datos ya nuevos.
const timers = new Map();
const enCurso = new Map();
const repetir = new Set();

function correr(userId) {
  if (enCurso.has(userId)) {
    repetir.add(userId);
    return enCurso.get(userId);
  }
  const p = sincronizarAhora(userId)
    .catch((err) => console.error('[calendario-google] error inesperado', err))
    .finally(() => {
      enCurso.delete(userId);
      if (repetir.delete(userId)) correr(userId);
    });
  enCurso.set(userId, p);
  return p;
}

// Fire-and-forget: lo llaman las rutas después de responder, sin await. Si la
// cuenta no conectó Google Calendar, la pasada no hace nada.
function programarSync(userId, demoraMs = DEMORA_USUARIO_MS) {
  if (!configurado() || !userId) return;
  clearTimeout(timers.get(userId));
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      correr(userId);
    }, demoraMs),
  );
}

// Los eventos propios de `ownerId` también están en el calendario de quien le
// canjeó el código.
async function programarSyncSuscriptores(ownerId) {
  if (!configurado()) return;
  const subs = await prisma.eventSubscription.findMany({ where: { ownerId }, select: { subscriberId: true } });
  subs.forEach((s) => programarSync(s.subscriberId));
}

// Un cambio del calendario oficial le puede tocar a cualquiera con el
// calendario conectado. Escalonado para no mandar todas las cuentas contra la
// API en el mismo segundo.
async function programarSyncTodos(demoraMs = DEMORA_TODOS_MS) {
  if (!configurado()) return;
  const filas = await prisma.calendarioGoogle.findMany({ select: { userId: true } });
  filas.forEach((f, i) => programarSync(f.userId, demoraMs + i * 2000));
}

function estaSincronizando(userId) {
  return timers.has(userId) || enCurso.has(userId);
}

// El código sale del popup de Google en el cliente; acá se canjea por el
// refresh token, que es lo que permite sincronizar sin que la persona esté.
async function conectar(userId, code) {
  let tokens;
  try {
    ({ tokens } = await clienteOAuth().getToken(code));
  } catch (err) {
    console.warn('[calendario-google] no se pudo canjear el código:', err.message);
    throw new ErrorCalendario('Google no aceptó el permiso. Probá de nuevo.');
  }

  // Con el consentimiento granular la persona puede destildar el acceso a
  // calendarios y aun así volver con un código válido: es su decisión, no se
  // conecta nada.
  const scopes = String(tokens.scope || '').split(' ');
  if (!scopes.includes(SCOPE)) {
    throw new ErrorCalendario('No se dio el permiso de calendarios, así que no se creó nada. Si querés el calendario, volvé a tocar "Dar permiso" y tildalo.');
  }

  const actual = await prisma.calendarioGoogle.findUnique({ where: { userId } });
  // Google manda el refresh token sólo la primera vez que se da el permiso.
  // Desconectar lo revoca, así que volver a conectar lo trae de nuevo; si no
  // llega es porque el permiso quedó dado de antes sin fila acá.
  if (!tokens.refresh_token && !actual) {
    throw new ErrorCalendario(
      'Google no devolvió un permiso duradero. Sacale el acceso a la agenda desde myaccount.google.com/permissions y volvé a intentar.',
    );
  }

  const data = { ultimoError: null, ...(tokens.refresh_token ? { refreshToken: cifrar(tokens.refresh_token) } : {}) };
  if (actual) await prisma.calendarioGoogle.update({ where: { userId }, data });
  else await prisma.calendarioGoogle.create({ data: { userId, ...data } });

  cancelados.delete(userId);
  programarSync(userId, 0);
}

// Borra el calendario "San Gabriel" de Google y revoca el permiso. Borrar el
// calendario es a propósito: una copia que ya no se actualiza sólo sirve para
// confundir cuando el colegio cambie una fecha.
async function desconectar(userId) {
  const fila = await prisma.calendarioGoogle.findUnique({ where: { userId } });
  if (!fila) return;

  clearTimeout(timers.get(userId));
  timers.delete(userId);
  repetir.delete(userId);
  cancelados.add(userId);
  try {
    if (enCurso.has(userId)) await enCurso.get(userId);
    await prisma.calendarioGoogle.deleteMany({ where: { userId } });
  } finally {
    cancelados.delete(userId);
  }

  let refresh;
  try {
    refresh = descifrar(fila.refreshToken);
  } catch (err) {
    return;
  }
  const cliente = clienteOAuth();
  cliente.setCredentials({ refresh_token: refresh });

  // Ninguno de los dos es crítico: si el permiso ya se había perdido, ni el
  // borrado ni la revocación van a andar, y la fila igual ya no está.
  if (fila.calendarId) {
    try {
      await llamar(cliente, { method: 'DELETE', path: `/calendars/${encodeURIComponent(fila.calendarId)}` });
    } catch (err) {
      if (statusDe(err) !== 404 && statusDe(err) !== 410) {
        console.warn(`[calendario-google] no se pudo borrar el calendario de la cuenta ${userId}:`, err.message);
      }
    }
  }
  try {
    await cliente.revokeToken(refresh);
  } catch (err) {
    /* ya revocado desde Google */
  }
}

function iniciarSyncCalendarios() {
  if (!configurado()) {
    console.warn('GOOGLE_CLIENT_SECRET no configurado: el calendario "San Gabriel" en Google Calendar queda apagado.');
    return;
  }
  // Una pasada al arrancar (con margen para que el seed termine) y después
  // cada CADA_MS.
  setTimeout(() => programarSyncTodos(0).catch(() => {}), 60 * 1000);
  setInterval(() => programarSyncTodos(0).catch(() => {}), CADA_MS);
}

module.exports = {
  SCOPE,
  ErrorCalendario,
  configurado,
  conectar,
  desconectar,
  programarSync,
  programarSyncSuscriptores,
  programarSyncTodos,
  estaSincronizando,
  iniciarSyncCalendarios,
};
