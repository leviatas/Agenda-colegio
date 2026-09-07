// Suscripción a las notificaciones push de "hoy tenés eventos" (el trabajo
// real vive en lib/push.js). `optionalAuth` porque cargar eventos propios no
// pide cuenta (ver CLAUDE.md): las notificaciones tampoco, aunque sin cuenta
// sólo avisan por los oficiales — ver el comentario de `PushSubscription` en
// schema.prisma.
const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { registrarSuscripcion, eliminarSuscripcion, enviarPrueba, revisarYNotificarHoy } = require('../lib/push');

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

// El botón "Probar" de ConfiguracionDialog.jsx: manda un push ya mismo a
// ESA suscripción, sin esperar al trabajo diario ni pasar por el matcher de
// picks. No hace falta requireAuth porque el endpoint no es adivinable y ya
// es lo mismo que exige DELETE /suscribir; en el peor caso, alguien con el
// endpoint de otra persona le dispara una notificación de prueba, no un dato
// suyo.
router.post('/probar', optionalAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Falta el endpoint.' });

  const r = await enviarPrueba(endpoint);
  if (r.ok) return res.status(204).end();

  const mensajes = {
    'no-configurado': 'Las notificaciones no están configuradas en este servidor.',
    'sin-suscripcion': 'No hay ninguna suscripción activa para probar.',
    vencida: 'Esa suscripción ya no es válida; volvé a activar las notificaciones.',
    error: 'No se pudo mandar la notificación de prueba.',
  };
  res.status(r.motivo === 'sin-suscripcion' ? 404 : 502).json({ error: mensajes[r.motivo] || mensajes.error });
});

// Botón "Prueba Eventos Hoy" de ConfiguracionDialog.jsx: ejecuta el mismo
// trabajo que el scheduler diario de las 8:00 AM pero ahora mismo, a modo de
// demostración. Sólo accesible con cuenta para no dejar el endpoint expuesto
// sin ninguna restricción.
router.post('/probar-hoy', optionalAuth, async (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'Las notificaciones no están configuradas en este servidor.' });
  }
  try {
    await revisarYNotificarHoy();
    res.status(204).end();
  } catch (err) {
    console.error('Error en probar-hoy:', err);
    res.status(500).json({ error: 'No se pudo ejecutar el aviso diario.' });
  }
});

module.exports = router;
