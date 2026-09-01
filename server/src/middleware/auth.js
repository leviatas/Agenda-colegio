const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch (err) {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  req.user = user;
  next();
}

// El calendario oficial se lee SIN cuenta: el link se le pasa a las familias y
// tiene que abrir directo. Pero si además viene un token válido, el mismo
// endpoint suma los eventos personales de esa persona en la misma respuesta,
// así el cliente pinta todo de una sola pasada.
//
// Un token inválido o vencido NO es un 401 acá: se ignora y se sigue como
// anónimo. Si cortara, una sesión vencida dejaría el calendario público en
// blanco en vez de simplemente perder los eventos propios.
async function optionalAuth(req, res, next) {
  req.user = await userFromToken(bearer(req));
  next();
}

// Único rol de la app: sale de ADMIN_EMAILS y se resetea en cada login (ver
// routes/auth.js). Habilita editar el calendario oficial, nada más — los
// eventos personales de otras cuentas siguen siendo privados para el admin.
function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Solo un administrador puede editar el calendario oficial' });
  }
  next();
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin };
