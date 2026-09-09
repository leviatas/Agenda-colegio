// Suscripción y preferencias de las notificaciones push de "tenés eventos"
// (el trabajo real vive en lib/push.js). `optionalAuth` porque cargar eventos propios no
// pide cuenta (ver CLAUDE.md): las notificaciones tampoco, aunque sin cuenta
// sólo avisan por los oficiales — ver el comentario de `PushSubscription` en
// schema.prisma.
const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const {
  PREFERENCIAS_DEFECTO,
  registrarSuscripcion,
  eliminarSuscripcion,
  leerPreferencias,
  guardarPreferencias,
  enviarPrueba,
  revisarYNotificar,
} = require('../lib/push');

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
  const { subscription, picks, preferencias } = req.body || {};
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
    // Opcional: sin esto la suscripción conserva las preferencias que ya
    // tenía (ver registrarSuscripcion en lib/push.js).
    preferencias,
  });
  res.status(204).end();
});

// Las preferencias del aviso (hora, de qué día y con cuánto detalle) son de
// la SUSCRIPCIÓN, no de la cuenta: cada dispositivo elige la suya (ver
// PushSubscription en schema.prisma). Por eso las dos rutas van por POST con
// el endpoint en el body y no por GET con el endpoint en la URL: el endpoint
// es la credencial con la que se le manda un push a ese navegador, y en la
// query string terminaría en el log de accesos de nginx.
router.post('/preferencias/leer', optionalAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Falta el endpoint.' });

  const preferencias = await leerPreferencias(endpoint);
  // Sin fila todavía (recién se está por activar, o el server la borró por un
  // 410) el cliente igual tiene que poder pintar los selects: se le devuelven
  // los defaults, que es lo que va a quedar guardado al suscribirse.
  res.json({ preferencias: preferencias || PREFERENCIAS_DEFECTO, suscripto: Boolean(preferencias) });
});

router.post('/preferencias', optionalAuth, async (req, res) => {
  const { endpoint, preferencias } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Falta el endpoint.' });

  const guardadas = await guardarPreferencias(endpoint, preferencias);
  if (!guardadas) {
    return res.status(404).json({ error: 'No hay ninguna suscripción activa para este navegador.' });
  }
  res.json({ preferencias: guardadas });
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

// Botón "Probar aviso del día" de ConfiguracionDialog.jsx: ejecuta el mismo
// trabajo que el scheduler pero ahora mismo y SÓLO para este navegador, a
// modo de demostración — con el matcher de picks y las preferencias
// guardadas, así el texto que llega es exactamente el del aviso real. No
// marca el aviso del día como mandado: probar a las 16 no puede dejar sin
// aviso al de las 17 (ver revisarYNotificar en lib/push.js).
router.post('/probar-aviso', optionalAuth, async (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(503).json({ error: 'Las notificaciones no están configuradas en este servidor.' });
  }
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Falta el endpoint.' });

  try {
    const enviados = await revisarYNotificar({ soloEndpoint: endpoint });
    // `enviados` en 0 no es un error: es que ese día no hay nada que
    // corresponda, lo mismo que pasaría a la hora del aviso.
    res.json({ enviados });
  } catch (err) {
    console.error('Error en probar-aviso:', err);
    res.status(500).json({ error: 'No se pudo ejecutar el aviso.' });
  }
});

module.exports = router;
