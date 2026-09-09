// Las novedades como las ve cualquiera: el aviso de arriba del calendario y la
// lista de la "i" del encabezado. La LECTURA es pública a propósito, igual que
// el calendario oficial —el link se le pasa a las familias y tiene que abrir
// sin cuenta—, así que acá no hay requireAuth de router. Lo que edita las
// novedades es otro router (routes/novedadesAdmin.js), cerrado con
// requireAdmin.
const express = require('express');
const prisma = require('../lib/prisma');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { hoyISO } = require('../lib/fechas');

const router = express.Router();

function serialize(n) {
  return {
    id: n.id,
    titulo: n.titulo,
    texto: n.texto,
    desde: n.desde,
    hasta: n.hasta,
  };
}

// Las vigentes de hoy y, si hay sesión, cuáles de esas ya cerró esta cuenta.
// Las cerradas VIENEN en la lista igual: el aviso de arriba del calendario las
// filtra, pero la "i" del encabezado las muestra todas —para eso está, para
// poder volver a leer algo que se cerró de más.
//
// optionalAuth y no requireAuth: sin cuenta `cerradas` sale vacío y el cliente
// usa las marcas de su localStorage (client/src/lib/novedades.js). Un token
// vencido tampoco corta nada: se sigue como anónimo, igual que en GET
// /api/eventos.
router.get('/', optionalAuth, async (req, res) => {
  const hoy = hoyISO();

  // Comparar strings 'YYYY-MM-DD' alcanza y es exactamente lo mismo que
  // comparar fechas: el formato ordena igual como texto que como calendario.
  const novedades = await prisma.novedad.findMany({
    where: { desde: { lte: hoy }, hasta: { gte: hoy } },
    orderBy: [{ desde: 'desc' }, { id: 'desc' }],
  });

  let cerradas = [];
  if (req.user && novedades.length > 0) {
    const marcas = await prisma.novedadCierre.findMany({
      where: { userId: req.user.id, novedadId: { in: novedades.map((n) => n.id) } },
      select: { novedadId: true },
    });
    cerradas = marcas.map((m) => m.novedadId);
  }

  res.json({ novedades: novedades.map(serialize), cerradas });
});

// "No me la muestres más". Sólo con cuenta: sin sesión no hay dónde guardar la
// marca del lado del server y el cliente la anota en su localStorage.
//
// Es idempotente (upsert sobre el unique novedadId+userId): cerrar la misma
// novedad desde el celular y desde la compu no es un error, es la misma marca.
router.post('/:id/cerrar', requireAuth, async (req, res) => {
  const novedadId = Number(req.params.id);
  if (!Number.isInteger(novedadId)) return res.status(400).json({ error: 'Novedad inválida' });

  // Se chequea que exista para devolver un 404 claro en vez del error de clave
  // foránea que tiraría el insert.
  const novedad = await prisma.novedad.findUnique({ where: { id: novedadId } });
  if (!novedad) return res.status(404).json({ error: 'No encontrada' });

  await prisma.novedadCierre.upsert({
    where: { novedadId_userId: { novedadId, userId: req.user.id } },
    update: {},
    create: { novedadId, userId: req.user.id },
  });

  res.status(204).end();
});

module.exports = router;
