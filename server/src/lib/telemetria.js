// Telemetría de visitas: cuántas personas distintas abren la agenda.
//
// Sale por los logs del proceso (stdout), que en Docker son los del contenedor
// `server`. No hay tabla ni servicio externo: contar visitas no vale una
// migración, y un dato que se puede leer con `docker compose logs` es un dato
// que no hay que mantener.
//
// Cada línea es un JSON de una sola línea con el prefijo [telemetria], para
// poder filtrarla con grep y parsearla con jq (ver la sección "Telemetría" del
// README).
//
// QUÉ NO SE LOGUEA, a propósito: ni el mail, ni la IP, ni el user-agent. El
// visitante se identifica con un id random que genera el cliente y guarda en su
// localStorage (`sg-visitante-v1`, ver client/src/lib/telemetria.js): alcanza
// para contar personas distintas y no identifica a nadie. De las cuentas sale
// sólo el id numérico; el mail está en /usuarios, que es del admin.
const PREFIJO = '[telemetria]';

// Tope de ids por día. Los Sets viven en memoria del proceso, así que hay que
// acotarlos: un bot que mande un vid distinto por request no puede hacer crecer
// el proceso sin límite. Pasado el tope se dejan de sumar ids y la línea sale
// con `tope: true`, que significa "los únicos son un piso, no el total". Para
// una agenda de un colegio esto no se toca nunca.
const TOPE_IDS = 20000;

// El día se corta a la medianoche de Argentina, no a la UTC: si el proceso
// corre en UTC (el contenedor lo hace), una visita de las 22 de acá caería en
// el día siguiente. -03:00 fijo porque Argentina no usa horario de verano desde
// 2009; misma lógica que las fechas del calendario, que se manejan como
// strings para no depender del huso (ver CLAUDE.md).
const OFFSET_MIN = -180;

function diaDe(ts) {
  return new Date(ts.getTime() + OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

function nuevoDia(dia) {
  return { dia, visitas: 0, visitantes: new Set(), cuentas: new Set(), tope: false };
}

let actual = nuevoDia(diaDe(new Date()));

function linea(obj) {
  console.log(`${PREFIJO} ${JSON.stringify(obj)}`);
}

// El resumen del día se imprime con la PRIMERA visita del día siguiente, que es
// cuando el proceso se entera de que el día cambió (no hay timer: un setInterval
// para esto sólo mantiene vivo el proceso sin necesidad). Si un día no viene
// nadie, no hay resumen, y si el server se reinicia se pierde el parcial: por
// eso cada línea de visita lleva además los totales corridos del día, así el
// último `visita` de una jornada ya dice cuántos fueron.
function cerrar(previo) {
  linea({
    evento: 'resumen',
    dia: previo.dia,
    visitas: previo.visitas,
    visitantes: previo.visitantes.size,
    cuentas: previo.cuentas.size,
    tope: previo.tope,
  });
}

function alDia(ts) {
  const dia = diaDe(ts);
  if (actual.dia === dia) return;
  if (actual.visitas > 0) cerrar(actual);
  actual = nuevoDia(dia);
}

// Devuelve true sólo si el valor es nuevo en el día. El tope se marca en el día
// en curso para que la línea diga que los únicos quedaron cortados.
function sumar(set, valor) {
  if (valor === null || valor === undefined) return false;
  if (set.has(valor)) return false;
  if (set.size >= TOPE_IDS) {
    actual.tope = true;
    return false;
  }
  set.add(valor);
  return true;
}

// Una carga de la agenda. `vid` es el id del navegador (null si el cliente no
// lo pudo generar o mandó cualquier cosa) y `userId` la cuenta, si entró con
// Google. Un mismo navegador que entra y después se loguea manda dos visitas,
// una anónima y otra con cuenta: son el mismo `vid`, así que cuenta como un
// visitante solo.
function registrarVisita({ vid = null, userId = null, admin = false } = {}) {
  const ts = new Date();
  alDia(ts);

  actual.visitas += 1;
  const nuevoVisitante = sumar(actual.visitantes, vid);
  sumar(actual.cuentas, userId);

  linea({
    evento: 'visita',
    ts: ts.toISOString(),
    dia: actual.dia,
    vid,
    user: userId,
    admin,
    // Primera vez que se ve este navegador en el día. Con esto solo ya se
    // cuentan los visitantes únicos de una jornada sin deduplicar nada.
    nuevo: nuevoVisitante,
    visitasHoy: actual.visitas,
    visitantesHoy: actual.visitantes.size,
    cuentasHoy: actual.cuentas.size,
    tope: actual.tope,
  });
}

// Un login con Google que salió bien. Va aparte de la visita porque es el único
// momento en que se sabe si la cuenta es nueva (primer ingreso de esa familia).
function registrarLogin({ userId, nueva = false, admin = false }) {
  const ts = new Date();
  alDia(ts);
  sumar(actual.cuentas, userId);

  linea({
    evento: 'login',
    ts: ts.toISOString(),
    dia: actual.dia,
    user: userId,
    // Primer ingreso de esta cuenta, no primer ingreso del día.
    nueva,
    admin,
    cuentasHoy: actual.cuentas.size,
  });
}

module.exports = { registrarVisita, registrarLogin };
