// El calendario "San Gabriel" en Google Calendar (el trabajo real vive en
// lib/calendarioGoogle.js). Todo pide cuenta: sin ella no hay dónde guardar el
// permiso ni de qué eventos personales armar el calendario. Nada de esto se
// dispara solo: el permiso se pide sólo desde el botón de Configuración.
const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const {
  SCOPE,
  ErrorCalendario,
  configurado,
  conectar,
  desconectar,
  programarSync,
  estaSincronizando,
} = require('../lib/calendarioGoogle');

const router = express.Router();

router.use(requireAuth);

const NO_CONFIGURADO = 'La conexión con Google Calendar no está configurada en este servidor.';

// El scope viaja en la respuesta para que el cliente pida exactamente el
// mismo que después se exige al canjear el código.
router.get('/', async (req, res) => {
  if (!configurado()) return res.json({ configurado: false, conectado: false });

  const fila = await prisma.calendarioGoogle.findUnique({ where: { userId: req.user.id } });
  res.json({
    configurado: true,
    scope: SCOPE,
    conectado: Boolean(fila),
    ultimaSync: fila ? fila.ultimaSync : null,
    error: fila ? fila.ultimoError : null,
    sincronizando: fila ? estaSincronizando(req.user.id) : false,
  });
});

router.post('/conectar', async (req, res) => {
  if (!configurado()) return res.status(503).json({ error: NO_CONFIGURADO });

  const code = req.body && req.body.code;
  if (typeof code !== 'string' || !code || code.length > 2048) {
    return res.status(400).json({ error: 'Falta el permiso de Google.' });
  }

  try {
    await conectar(req.user.id, code);
  } catch (err) {
    if (err instanceof ErrorCalendario) return res.status(400).json({ error: err.message });
    throw err;
  }
  res.status(204).end();
});

// "Sincronizar ahora": no espera a que termine (la primera pasada puede tardar
// bastante), el cliente consulta el estado hasta que deja de sincronizar.
router.post('/sincronizar', async (req, res) => {
  if (!configurado()) return res.status(503).json({ error: NO_CONFIGURADO });

  const fila = await prisma.calendarioGoogle.findUnique({ where: { userId: req.user.id } });
  if (!fila) return res.status(404).json({ error: 'Todavía no conectaste Google Calendar.' });

  programarSync(req.user.id, 0);
  res.status(204).end();
});

router.delete('/', async (req, res) => {
  await desconectar(req.user.id);
  res.status(204).end();
});

module.exports = router;
