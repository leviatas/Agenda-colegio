// Calendario oficial: la pantalla de gestión. Todo este router escribe, así
// que requireAdmin va en el router.use — a diferencia del requireWriter del
// stack genérico, acá no hay ningún GET que deba quedar abierto: el calendario
// se lee por GET /api/eventos, que es público.
const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { parseEvento } = require('../lib/validate');
const { LEVELS, TAGS } = require('../lib/catalogo');
const { serializeOficial } = require('./eventos');

const router = express.Router();

router.use(requireAuth, requireAdmin);

function parseOficial(body) {
  const base = parseEvento(body);
  if (!base.ok) return base;

  if (!LEVELS.includes(body.level)) {
    return { ok: false, error: `El nivel tiene que ser uno de: ${LEVELS.join(', ')}.` };
  }

  const groups = Array.isArray(body.groups) ? body.groups : [];
  const invalido = groups.find((g) => !TAGS.has(g));
  if (invalido) return { ok: false, error: `"${invalido}" no es una sala, grado ni año conocido.` };

  return {
    ok: true,
    value: {
      ...base.value,
      level: body.level,
      // Sin duplicados y en orden estable, así dos ediciones equivalentes
      // guardan exactamente el mismo texto.
      groups: JSON.stringify([...new Set(groups)].sort()),
    },
  };
}

router.get('/', async (req, res) => {
  const eventos = await prisma.event.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] });
  res.json({ eventos: eventos.map(serializeOficial) });
});

router.post('/', async (req, res) => {
  const parsed = parseOficial(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const evento = await prisma.event.create({ data: parsed.value });
  res.status(201).json({ evento: serializeOficial(evento) });
});

router.put('/:id', async (req, res) => {
  const parsed = parseOficial(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const id = Number(req.params.id);
  const actual = await prisma.event.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'No encontrado' });

  const evento = await prisma.event.update({ where: { id }, data: parsed.value });
  res.json({ evento: serializeOficial(evento) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.event.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'No encontrado' });

  await prisma.event.delete({ where: { id } });
  res.status(204).end();
});

module.exports = router;
