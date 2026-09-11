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

  // Los accesos SIN cuenta se cuentan aparte, y por IP: una IP que alguna vez
  // tuvo un login igual acumula visitas anónimas —el calendario se ve sin
  // entrar—, y sin este desglose quedaban escondidas adentro del total con el
  // nombre de la cuenta al lado, como si todas fueran de esa persona.
  const porIp = new Map();
  let accesos = 0;
  let accesosSinCuenta = 0;

  for (const v of visitas) {
    let fila = porIp.get(v.ip);
    if (!fila) {
      fila = { ip: v.ip, visitas: 0, sinCuenta: 0, ultimoIngreso: v.creadoEn, usuarios: new Map() };
      porIp.set(v.ip, fila);
    }
    fila.visitas += 1;
    accesos += 1;
    if (v.creadoEn > fila.ultimoIngreso) fila.ultimoIngreso = v.creadoEn;
    // Sin `user` es un acceso sin sesión. También cae acá el de una cuenta
    // borrada: `Visita.userId` es onDelete SetNull, así que sus accesos quedan
    // en el historial como accesos sin cuenta (ver CLAUDE.md).
    if (v.user) fila.usuarios.set(v.user.id, v.user);
    else {
      fila.sinCuenta += 1;
      accesosSinCuenta += 1;
    }
  }

  const ips = [...porIp.values()]
    .sort((a, b) => b.ultimoIngreso - a.ultimoIngreso)
    .map((f) => ({
      ip: f.ip,
      visitas: f.visitas,
      sinCuenta: f.sinCuenta,
      ultimoIngreso: f.ultimoIngreso.toISOString(),
      usuarios: [...f.usuarios.values()],
    }));

  return { cuentas, accesos, accesosSinCuenta, ips };
}

module.exports = { registrarAcceso, obtenerMetricas };
