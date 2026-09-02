// Quiénes entraron alguna vez con Google. Es de LECTURA y sólo para el admin:
// no hay alta, baja ni aprobación que hacer, porque cualquier cuenta queda
// habilitada sola en su primer login (ver routes/auth.js). Sirve para saber
// quién está usando la agenda, nada más.
//
// Los eventos personales NO salen por acá, ni siquiera contados: son privados
// y el admin no es una excepción (ver PersonalEvent en schema.prisma).
//
// Todo el router es admin, así que requireAdmin va en el router.use, igual que
// en oficial.js.
const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  const usuarios = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    // select explícito: googleId y picks no tienen para qué salir del server.
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  res.json({
    usuarios: usuarios.map((u) => ({
      ...u,
      // Acá el DateTime está bien: la fecha de alta es un instante, con hora.
      // Las que van como String son las del calendario, que son días sueltos.
      createdAt: u.createdAt.toISOString(),
    })),
  });
});

module.exports = router;
