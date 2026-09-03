const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { parseEvento } = require('../lib/validate');
const { firmarEventoCompartido, leerEventoCompartido, generarCodigo } = require('../lib/compartir');

const router = express.Router();

function serializeOficial(e) {
  return {
    id: e.id,
    date: e.date,
    endDate: e.endDate,
    level: e.level,
    time: e.time,
    endTime: e.endTime,
    title: e.title,
    groups: parseGroups(e.groups),
  };
}

function parseGroups(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (err) {
    return [];
  }
}

// Los personales salen con level 'per' fijo: es el nivel que el cliente pinta
// de violeta y filtra con la opción "Personal". No se guarda en la tabla
// porque no puede ser otra cosa.
function serializePersonal(e) {
  return {
    id: e.id,
    date: e.date,
    endDate: e.endDate,
    level: 'per',
    time: e.time,
    endTime: e.endTime,
    title: e.title,
    groups: [],
  };
}

// Igual que serializePersonal, pero para los eventos que llegan por una
// EventSubscription: llevan además `de`, el nombre de quien los cargó, porque
// acá sí hace falta distinguirlos de los propios (el calendario los mezcla en
// el mismo nivel 'per', de sólo lectura). No es un dato más sensible que el
// nombre que ya se ve en /usuarios: quien suscribe ya sabe de quién son, se lo
// pasó la otra persona junto con el código.
function serializeCompartido(e) {
  return {
    id: e.id,
    date: e.date,
    endDate: e.endDate,
    level: 'per',
    time: e.time,
    endTime: e.endTime,
    title: e.title,
    groups: [],
    de: e.user.name,
  };
}

// Única carga del calendario. Sin token devuelve sólo el oficial (el link se le
// pasa a las familias y tiene que abrir sin cuenta); con token válido suma los
// eventos personales de esa persona y los de quien haya suscripto en la misma
// respuesta.
router.get('/', optionalAuth, async (req, res) => {
  const oficiales = await prisma.event.findMany({ orderBy: { date: 'asc' } });

  const personales = req.user
    ? await prisma.personalEvent.findMany({
        where: { userId: req.user.id },
        orderBy: { date: 'asc' },
      })
    : [];

  // Sólo lectura y en un solo sentido: ver los eventos de quien te compartió
  // su código no hace que él vea los tuyos (routes/eventos.js, sección
  // "Compartir", y el modelo EventSubscription).
  const suscripciones = req.user
    ? await prisma.eventSubscription.findMany({ where: { subscriberId: req.user.id } })
    : [];
  const ownerIds = suscripciones.map((s) => s.ownerId);
  const compartidos = ownerIds.length
    ? await prisma.personalEvent.findMany({
        where: { userId: { in: ownerIds } },
        orderBy: { date: 'asc' },
        include: { user: { select: { name: true } } },
      })
    : [];

  res.json({
    oficiales: oficiales.map(serializeOficial),
    personales: personales.map(serializePersonal),
    compartidos: compartidos.map(serializeCompartido),
  });
});

// ── Eventos personales ────────────────────────────────────────────────────
// Todo lo de acá abajo va scopeado por req.user.id. Los lookups por id usan
// findFirst con userId, NUNCA findUnique: el id de otra persona tiene que dar
// 404, no devolver (ni dejar borrar) su fila.

router.post('/mios', requireAuth, async (req, res) => {
  const parsed = parseEvento(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const evento = await prisma.personalEvent.create({
    data: { ...parsed.value, userId: req.user.id },
  });
  res.status(201).json({ evento: serializePersonal(evento) });
});

router.put('/mios/:id', requireAuth, async (req, res) => {
  const parsed = parseEvento(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const actual = await prisma.personalEvent.findFirst({
    where: { id: Number(req.params.id), userId: req.user.id },
  });
  if (!actual) return res.status(404).json({ error: 'No encontrado' });

  const evento = await prisma.personalEvent.update({
    where: { id: actual.id },
    data: parsed.value,
  });
  res.json({ evento: serializePersonal(evento) });
});

router.delete('/mios/:id', requireAuth, async (req, res) => {
  const actual = await prisma.personalEvent.findFirst({
    where: { id: Number(req.params.id), userId: req.user.id },
  });
  if (!actual) return res.status(404).json({ error: 'No encontrado' });

  await prisma.personalEvent.delete({ where: { id: actual.id } });
  res.status(204).end();
});

// Genera el link de UN evento propio. findFirst con userId, como todo lo de
// acá arriba: no se puede sacar un token de un evento ajeno probando ids.
router.post('/mios/:id/compartir', requireAuth, async (req, res) => {
  const actual = await prisma.personalEvent.findFirst({
    where: { id: Number(req.params.id), userId: req.user.id },
  });
  if (!actual) return res.status(404).json({ error: 'No encontrado' });

  res.json({ token: firmarEventoCompartido(actual.id) });
});

// ── Compartir ─────────────────────────────────────────────────────────────
// Dos mecanismos independientes: el link de un evento suelto (arriba) crea
// una COPIA en la cuenta de quien lo acepta, de una sola vez; el código de
// acá abajo es una suscripción en vivo a TODOS los eventos de una cuenta (ver
// EventSubscription en schema.prisma). No se cruzan entre sí.

// Vista previa del link, pública a propósito: quien lo recibe tiene que poder
// ver DE QUÉ evento se trata antes de que se le pida entrar con Google, igual
// que el calendario oficial se ve sin cuenta. Sólo entrar con Google hace
// falta para aceptar, no para mirar.
router.get('/compartir/evento/:token', async (req, res) => {
  const id = leerEventoCompartido(req.params.token);
  if (id === null) return res.status(404).json({ error: 'Este link no es válido.' });

  const evento = await prisma.personalEvent.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!evento) {
    return res.status(404).json({ error: 'Este evento ya no existe: puede que quien lo compartió lo haya borrado.' });
  }

  res.json({
    evento: {
      title: evento.title,
      date: evento.date,
      endDate: evento.endDate,
      time: evento.time,
      endTime: evento.endTime,
      de: evento.user.name,
    },
  });
});

// Aceptar: crea una COPIA independiente en la cuenta de quien acepta. No queda
// vinculada al original — si el dueño la edita o la borra después, no le
// cambia nada a esta. El mismo link se puede aceptar más de una vez, incluso
// por gente distinta: no hay nada que marcar como "usado".
router.post('/compartir/evento/:token/aceptar', requireAuth, async (req, res) => {
  const id = leerEventoCompartido(req.params.token);
  if (id === null) return res.status(404).json({ error: 'Este link no es válido.' });

  const original = await prisma.personalEvent.findUnique({ where: { id } });
  if (!original) {
    return res.status(404).json({ error: 'Este evento ya no existe: puede que quien lo compartió lo haya borrado.' });
  }

  const copia = await prisma.personalEvent.create({
    data: {
      userId: req.user.id,
      date: original.date,
      endDate: original.endDate,
      time: original.time,
      endTime: original.endTime,
      title: original.title,
    },
  });
  res.status(201).json({ evento: serializePersonal(copia) });
});

// El código propio: null mientras no se generó o después de apagarlo.
router.get('/compartir/codigo', requireAuth, async (req, res) => {
  res.json({ codigo: req.user.shareCode });
});

// Generar o regenerar: pisa el que hubiera. No afecta a quien ya canjeó el
// anterior, esa fila de EventSubscription no depende del código.
router.post('/compartir/codigo', requireAuth, async (req, res) => {
  // Con 8 caracteres de un alfabeto de 32 la chance de chocar es
  // prácticamente cero; el reintento es sólo por las dudas, nunca en la
  // práctica hace falta un segundo intento.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    try {
      await prisma.user.update({ where: { id: req.user.id }, data: { shareCode: codigo } });
      return res.json({ codigo });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
    }
  }
  res.status(500).json({ error: 'No se pudo generar el código, probá de nuevo.' });
});

// Apagarlo: sólo cierra la puerta a canjes nuevos. Quien ya lo usó sigue
// viendo los eventos hasta que se lo saque puntualmente de la lista de
// suscriptores (DELETE de acá abajo).
router.delete('/compartir/codigo', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { shareCode: null } });
  res.status(204).end();
});

// Quién puede ver MIS eventos.
router.get('/compartir/suscriptores', requireAuth, async (req, res) => {
  const filas = await prisma.eventSubscription.findMany({
    where: { ownerId: req.user.id },
    include: { subscriber: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ suscriptores: filas.map((f) => f.subscriber) });
});

// Cortarle el acceso a alguien puntual, sin tocar el código.
router.delete('/compartir/suscriptores/:userId', requireAuth, async (req, res) => {
  await prisma.eventSubscription.deleteMany({
    where: { ownerId: req.user.id, subscriberId: Number(req.params.userId) },
  });
  res.status(204).end();
});

// A quiénes veo yo.
router.get('/compartir/suscripciones', requireAuth, async (req, res) => {
  const filas = await prisma.eventSubscription.findMany({
    where: { subscriberId: req.user.id },
    include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ suscripciones: filas.map((f) => f.owner) });
});

// Dejar de ver a alguien, por mi cuenta (no hace falta que la otra persona
// haga nada).
router.delete('/compartir/suscripciones/:ownerId', requireAuth, async (req, res) => {
  await prisma.eventSubscription.deleteMany({
    where: { subscriberId: req.user.id, ownerId: Number(req.params.ownerId) },
  });
  res.status(204).end();
});

// Canjear el código de otra cuenta: crea la EventSubscription. No es un login
// aparte, hace falta el propio para saber a quién le queda la suscripción.
router.post('/compartir/canjear', requireAuth, async (req, res) => {
  const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().toUpperCase() : '';
  if (!codigo || codigo.length > 32) return res.status(400).json({ error: 'Falta el código.' });

  const owner = await prisma.user.findUnique({ where: { shareCode: codigo } });
  if (!owner) return res.status(404).json({ error: 'Ese código no existe. Fijate que esté bien escrito.' });
  if (owner.id === req.user.id) return res.status(400).json({ error: 'Es tu propio código.' });

  try {
    await prisma.eventSubscription.create({ data: { ownerId: owner.id, subscriberId: req.user.id } });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
    return res.status(400).json({ error: 'Ya estás viendo los eventos de esa cuenta.' });
  }

  res.status(201).json({ owner: { id: owner.id, name: owner.name, avatarUrl: owner.avatarUrl } });
});

module.exports = { router, serializeOficial, parseGroups };
