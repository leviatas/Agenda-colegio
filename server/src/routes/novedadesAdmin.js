// Administrar las novedades. Todo este router escribe o lista TODO (incluidas
// las vencidas y las que todavía no arrancaron), así que requireAdmin va en el
// router.use — mismo criterio que routes/oficial.js: lo que tiene que ver
// cualquiera sale por otra ruta (routes/novedades.js, pública).
const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { esFecha } = require('../lib/validate');
const { hoyISO } = require('../lib/fechas');

const router = express.Router();

router.use(requireAuth, requireAdmin);

const MAX_TITULO = 60;
const MAX_TEXTO = 300;

// Devuelve { ok: true, value } o { ok: false, error } — nunca tira, igual que
// parseEvento en lib/validate.js.
//
// A diferencia de los eventos, las fechas NO se acotan al ciclo lectivo: una
// novedad puede avisar algo de la app misma y no tiene por qué caer entre
// septiembre y diciembre de 2026.
function parseNovedad(body) {
  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  if (!titulo) return { ok: false, error: 'Falta el título.' };
  if (titulo.length > MAX_TITULO) {
    return { ok: false, error: `El título no puede pasar de ${MAX_TITULO} caracteres.` };
  }

  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!texto) return { ok: false, error: 'Falta el texto de la novedad.' };
  if (texto.length > MAX_TEXTO) {
    return { ok: false, error: `El texto no puede pasar de ${MAX_TEXTO} caracteres.` };
  }

  const desde = body.desde;
  if (!esFecha(desde)) return { ok: false, error: 'La fecha de inicio no es válida.' };

  const hasta = body.hasta;
  if (!esFecha(hasta)) return { ok: false, error: 'La fecha de vencimiento no es válida.' };
  if (hasta < desde) {
    return { ok: false, error: 'El vencimiento no puede ser anterior al inicio.' };
  }

  return { ok: true, value: { titulo, texto, desde, hasta } };
}

// Serializa con `vigente` calculado acá y no en el cliente: el corte es la
// fecha de Argentina del server (lib/fechas.js), que es la misma con la que
// GET /api/novedades decide qué mostrar. Si lo calculara el navegador, un
// celular con el reloj corrido diría otra cosa que la lista real.
function serialize(n, hoy) {
  return {
    id: n.id,
    titulo: n.titulo,
    texto: n.texto,
    desde: n.desde,
    hasta: n.hasta,
    vigente: n.desde <= hoy && hoy <= n.hasta,
    // Cuánta gente con cuenta la cerró. Es un número suelto y no una lista:
    // sirve para saber si la novedad se está leyendo, sin decir quién es quién.
    cierres: n._count ? n._count.cierres : 0,
  };
}

router.get('/', async (req, res) => {
  const hoy = hoyISO();
  const novedades = await prisma.novedad.findMany({
    orderBy: [{ desde: 'desc' }, { id: 'desc' }],
    include: { _count: { select: { cierres: true } } },
  });
  res.json({ hoy, novedades: novedades.map((n) => serialize(n, hoy)) });
});

router.post('/', async (req, res) => {
  const parsed = parseNovedad(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const novedad = await prisma.novedad.create({ data: parsed.value });
  res.status(201).json({ novedad: serialize(novedad, hoyISO()) });
});

router.put('/:id', async (req, res) => {
  const parsed = parseNovedad(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const id = Number(req.params.id);
  const actual = await prisma.novedad.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'No encontrada' });

  // Editar NO borra los cierres: quien ya la cerró la cerró, y reaparecerle un
  // aviso porque se corrigió una coma sería peor que el error de tipeo. Para
  // que la vuelva a ver todo el mundo, la novedad se crea de nuevo.
  const novedad = await prisma.novedad.update({
    where: { id },
    data: parsed.value,
    include: { _count: { select: { cierres: true } } },
  });
  res.json({ novedad: serialize(novedad, hoyISO()) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.novedad.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'No encontrada' });

  // Los cierres se van con ella (onDelete: Cascade en schema.prisma): no hay
  // nada que conservar de una novedad que ya no existe.
  await prisma.novedad.delete({ where: { id } });
  res.status(204).end();
});

module.exports = router;
