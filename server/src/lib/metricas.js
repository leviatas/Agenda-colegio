// Persistencia de accesos por IP, para /metricas (sólo admin, ver
// routes/metricas.js). Aparte de lib/telemetria.js a propósito: ese archivo
// es el conteo anónimo que sale por stdout y nunca guarda IP ni mail — acá sí
// se guarda la IP, así que esta tabla vive detrás de requireAdmin en todo
// momento y sólo sirve para que el admin vea cuánta gente distinta entra y,
// si una IP conocida corresponde a una cuenta logueada, de quién es.
const prisma = require('./prisma');

// Cuánto se guardan los accesos. No hace falta un cron aparte para podarlos:
// alcanza con tirar un dado en cada escritura (ver registrarAcceso).
const RETENCION_DIAS = 180;
const PROBABILIDAD_PODA = 0.005;

// Fire-and-forget: la telemetría no puede demorar ni tumbar la respuesta al
// cliente que sólo quiere ver la agenda, así que nadie espera esta promesa.
function registrarAcceso({ ip, userId }) {
  if (!ip) return;

  prisma.visita
    .create({ data: { ip, userId: userId || null } })
    .catch((err) => console.error('No se pudo guardar el acceso para métricas', err));

  if (Math.random() < PROBABILIDAD_PODA) {
    const limite = new Date(Date.now() - RETENCION_DIAS * 86400000);
    prisma.visita
      .deleteMany({ where: { creadoEn: { lt: limite } } })
      .catch((err) => console.error('No se pudo podar la tabla de accesos', err));
  }
}

// Agrupado a mano y no con groupBy de Prisma: además de contar hace falta la
// última visita de cada IP y, si la hay, qué cuenta(s) se vieron ahí —
// groupBy no trae relaciones.
async function obtenerMetricas() {
  const [cuentas, visitas] = await Promise.all([
    // Todo User se creó en un login con Google (routes/auth.js), así que este
    // conteo ES la cantidad de gente distinta que se logueó alguna vez.
    prisma.user.count(),
    prisma.visita.findMany({
      orderBy: { creadoEn: 'desc' },
      // Tope defensivo: alcanza para agrupar por IP sin traer la tabla entera
      // si el sitio lleva mucho tiempo andando.
      take: 20000,
      select: {
        ip: true,
        creadoEn: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const porIp = new Map();
  for (const v of visitas) {
    let fila = porIp.get(v.ip);
    if (!fila) {
      fila = { ip: v.ip, visitas: 0, ultimoIngreso: v.creadoEn, usuarios: new Map() };
      porIp.set(v.ip, fila);
    }
    fila.visitas += 1;
    if (v.creadoEn > fila.ultimoIngreso) fila.ultimoIngreso = v.creadoEn;
    if (v.user) fila.usuarios.set(v.user.id, v.user);
  }

  const ips = [...porIp.values()]
    .sort((a, b) => b.ultimoIngreso - a.ultimoIngreso)
    .map((f) => ({
      ip: f.ip,
      visitas: f.visitas,
      ultimoIngreso: f.ultimoIngreso.toISOString(),
      usuarios: [...f.usuarios.values()],
    }));

  return { cuentas, ips };
}

module.exports = { registrarAcceso, obtenerMetricas };
