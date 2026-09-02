const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { parseEvento } = require('../lib/validate');

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

// Única carga del calendario. Sin token devuelve sólo el oficial (el link se le
// pasa a las familias y tiene que abrir sin cuenta); con token válido suma los
// eventos personales de esa persona en la misma respuesta.
router.get('/', optionalAuth, async (req, res) => {
  const oficiales = await prisma.event.findMany({ orderBy: { date: 'asc' } });

  const personales = req.user
    ? await prisma.personalEvent.findMany({
        where: { userId: req.user.id },
        orderBy: { date: 'asc' },
      })
    : [];

  res.json({
    oficiales: oficiales.map(serializeOficial),
    personales: personales.map(serializePersonal),
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

module.exports = { router, serializeOficial, parseGroups };
