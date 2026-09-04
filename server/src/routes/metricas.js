// Métricas de acceso: sólo para el admin. Complementa /usuarios (que dice
// QUIÉN entró alguna vez con Google) con CUÁNTA gente entra y desde qué IP,
// cruzando la tabla Visita (ver schema.prisma) con las cuentas: si una IP
// conocida corresponde a alguien logueado, acá aparece quién es.
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { obtenerMetricas } = require('../lib/metricas');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  res.json(await obtenerMetricas());
});

module.exports = router;
