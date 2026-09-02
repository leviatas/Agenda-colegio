const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const { signToken, requireAuth } = require('../middleware/auth');
const { registrarLogin } = require('../lib/telemetria');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    picks: parsePicks(user.picks),
  };
}

// picks es JSON guardado como texto: una fila corrupta no puede tumbar el
// login, así que ante cualquier problema se vuelve a "sin filtros".
function parsePicks(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (err) {
    return [];
  }
}

// El cliente saca el ID token con Google Identity Services y lo manda acá. El
// server lo verifica contra Google (audience = GOOGLE_CLIENT_ID): nunca confía
// en la identidad que manda el cliente.
//
// No hay aprobación ni alta manual: cualquier cuenta de Google queda habilitada
// en el primer login para cargar sus propios eventos. isAdmin sale SIEMPRE de
// ADMIN_EMAILS y se recalcula en cada login, así sacar un mail de la variable
// alcanza para bajarle el permiso.
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Falta el credential de Google' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Token de Google inválido' });
  }
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'No se pudo verificar la cuenta de Google' });
  }
  // Una cuenta sin el mail verificado se puede haber creado con la dirección de
  // otra persona; como el admin se decide por mail, eso alcanzaría para
  // hacerse pasar por el del colegio.
  if (payload.email_verified === false) {
    return res.status(401).json({ error: 'Esa cuenta de Google no tiene el correo verificado' });
  }

  const email = payload.email.toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(email);

  let user =
    (await prisma.user.findUnique({ where: { googleId: payload.sub } })) ||
    (await prisma.user.findUnique({ where: { email } }));

  // Antes de crearla: es el único momento en que se puede saber que es el
  // primer ingreso de esta familia, y va al log de telemetría.
  const cuentaNueva = !user;

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: payload.sub,
        email,
        name: payload.name || email,
        avatarUrl: payload.picture || null,
        isAdmin,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        isAdmin,
        googleId: payload.sub,
        name: payload.name || user.name,
        avatarUrl: payload.picture || null,
      },
    });
  }

  registrarLogin({ userId: user.id, nueva: cuentaNueva, admin: user.isAdmin });

  res.json({ token: signToken(user), user: serializeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

// Los filtros del picker, para que la selección viaje entre dispositivos. Se
// guardan enteros: el cliente manda siempre la lista completa, no un diff.
router.put('/me/picks', requireAuth, async (req, res) => {
  const { picks } = req.body;
  if (!Array.isArray(picks) || picks.some((p) => typeof p !== 'string')) {
    return res.status(400).json({ error: 'picks tiene que ser un array de ids' });
  }
  // Tope defensivo: el catálogo del cliente tiene ~30 ids, cualquier cosa más
  // larga es basura y no hay razón para guardarla.
  if (picks.length > 60) {
    return res.status(400).json({ error: 'Demasiados filtros' });
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { picks: JSON.stringify(picks) },
  });
  res.json({ user: serializeUser(user) });
});

module.exports = router;
