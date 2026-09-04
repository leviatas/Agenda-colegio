// Ping de visita: lo manda el cliente una vez por carga de la app (ver
// client/src/lib/telemetria.js). Escribe una línea en el log del server (ver
// lib/telemetria.js, que sigue sin guardar IP ni mail) y, aparte, un acceso
// con la IP en la tabla Visita (ver lib/metricas.js), que alimenta /metricas
// —sólo la ve el admin.
//
// Es `optionalAuth` porque la agenda se ve sin cuenta y esas visitas son
// justamente las que hay que contar: con token la línea sale además con el id
// de la cuenta, y un token vencido no corta nada, se cuenta como anónima.
const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { registrarVisita } = require('../lib/telemetria');
const { registrarAcceso } = require('../lib/metricas');

const router = express.Router();

// El id lo genera el navegador, así que llega como venga: se acota acá para que
// no entre basura al log (una línea con un "vid" de 10 kB no la quiere nadie).
const VID = /^[A-Za-z0-9-]{6,64}$/;

router.post('/visita', optionalAuth, (req, res) => {
  const enviado = req.body && req.body.vid;
  const vid = typeof enviado === 'string' && VID.test(enviado) ? enviado : null;
  const userId = req.user ? req.user.id : null;

  registrarVisita({
    vid,
    userId,
    admin: Boolean(req.user && req.user.isAdmin),
  });
  registrarAcceso({ ip: req.ip, userId });

  // 204 siempre, incluso con un vid inválido: la telemetría no es algo que la
  // app tenga que reintentar ni mostrarle a nadie. Contar de menos es mejor que
  // hacerle ruido a quien está mirando el calendario.
  res.status(204).end();
});

module.exports = router;
