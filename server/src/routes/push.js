// Suscripción a las notificaciones push de "hoy tenés eventos" (el trabajo
// real vive en lib/push.js). `optionalAuth` porque cargar eventos propios no
// pide cuenta (ver CLAUDE.md): las notificaciones tampoco, aunque sin cuenta
// sólo avisan por los oficiales — ver el comentario de `PushSubscription` en
// schema.prisma.
const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { registrarSuscripcion, eliminarSuscripcion } = require('../lib/push');

const router = express.Router();

// Pública a propósito: la clave VAPID no es un secreto (es la mitad que el
// service worker necesita para pedir la suscripción al navegador), la
// privada es la que nunca sale del server.
router.get('/clave-publica', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Las notificaciones no están configuradas en este servidor.' });
  }
  res.json({ clave: process.env.VAPID_PUBLIC_KEY });
});

router.post('/suscribir', optionalAuth, async (req, res) => {
  const { subscription, picks } = req.body || {};
  if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys) {
    return res.status(400).json({ error: 'Falta la suscripción.' });
  }
  const { endpoint, keys } = subscription;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'Suscripción inválida.' });
  }

  await registrarSuscripcion({
    endpoint,
    keys,
    userId: req.user ? req.user.id : null,
    picks: Array.isArray(picks) ? picks.filter((p) => typeof p === 'string') : [],
  });
  res.status(204).end();
});

router.delete('/suscribir', optionalAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Falta el endpoint.' });
  await eliminarSuscripcion(endpoint);
  res.status(204).end();
});

module.exports = router;
