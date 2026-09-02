// Catálogo y lógica del calendario. Todo puro: no toca el DOM ni la API, así
// que las pantallas se pueden re-renderizar sin recalcular nada de esto a mano.

// ⚠️ Los ids de acá son un ESPEJO de `server/src/lib/catalogo.js`, que valida
// los tags que manda la pantalla de gestión. Si agregás una sala, un grado o un
// año, tocá LOS DOS archivos. Duplicado a propósito: el build de Docker del
// cliente sólo copia `client/`, así que un archivo compartido fuera de esta
// carpeta no entraría en la imagen.

// Cada color de sala ya implica su edad y su ciclo, así que elegir el color
// alcanza: `imp` son los tags que ese pick arrastra (Celeste ⇒ sala de 3 ⇒
// infantes), y por eso un evento de "salas de 3" le aparece igual.
export const SALAS = [
  { id: 'amarillatm', n: 'Amarilla TM', c: '#E8C24A', g: 's1', imp: ['s1', 'maternal'] },
  { id: 'amarilladjtt', n: 'Amarilla DJ/TT', c: '#E8C24A', g: 's1', imp: ['s1', 'maternal'] },
  { id: 'violeta', n: 'Violeta', c: '#7A52A8', g: 's1', imp: ['s1', 'maternal'] },

  { id: 'rosatm', n: 'Rosa TM', c: '#E88BA8', g: 's2', imp: ['s2', 'maternal'] },
  { id: 'rosatt', n: 'Rosa TT', c: '#E88BA8', g: 's2', imp: ['s2', 'maternal'] },
  { id: 'turquesa', n: 'Turquesa', c: '#3FB3A8', g: 's2', imp: ['s2', 'maternal'] },

  { id: 'naranja', n: 'Naranja', c: '#E8873B', g: 's3', imp: ['s3', 'infantes'] },
  { id: 'celeste', n: 'Celeste', c: '#7FC4E8', g: 's3', imp: ['s3', 'infantes'] },
  { id: 'fucsia', n: 'Fucsia', c: '#C94E9A', g: 's3', imp: ['s3', 'infantes'] },

  { id: 'verde', n: 'Verde', c: '#4A9E5C', g: 's4', imp: ['s4', 'infantes'] },
  { id: 'azul', n: 'Azul', c: '#3B6FC4', g: 's4', imp: ['s4', 'infantes'] },
  { id: 'bordo', n: 'Bordó', c: '#7A2233', g: 's4', imp: ['s4', 'infantes'] },

  { id: 'roja', n: 'Roja', c: '#C8382F', g: 's5', imp: ['s5', 'infantes'] },
  { id: 'lila', n: 'Lila', c: '#A98BD1', g: 's5', imp: ['s5', 'infantes'] },
  { id: 'blanca', n: 'Blanca', c: '#FFFFFF', g: 's5', imp: ['s5', 'infantes'] },
];

export const GRUPOS = [
  { k: 's1', lbl: 'Sala de 1 · maternal' },
  { k: 's2', lbl: 'Sala de 2 · maternal' },
  { k: 's3', lbl: 'Sala de 3 · infantes' },
  { k: 's4', lbl: 'Sala de 4 · infantes' },
  { k: 's5', lbl: 'Sala de 5 · infantes' },
];

export const EXTRAS = [
  { id: 'personal', n: 'Personal', lv: 'per' },
  { id: 'feriados', n: 'Feriados', lv: 'fer' },
  { id: 'institucional', n: 'Institucional', lv: 'ins' },
];

export const GRADOS = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `g${i}`, n: `${i}° grado` }));
export const ANIOS = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `a${i}`, n: `${i}° año` }));

export const CAT = {};
[...EXTRAS, ...SALAS, ...GRADOS, ...ANIOS].forEach((o) => {
  CAT[o.id] = o;
});

// Qué listas del picker habilitan cada nivel de evento.
const POOL = { per: ['extras'], ini: ['salas'], pri: ['grados'], sec: ['anios'] };
export const LISTS = { extras: EXTRAS, salas: SALAS, grados: GRADOS, anios: ANIOS };

export const NIVELES = {
  per: 'Personal',
  fer: 'Feriado',
  ins: 'Institucional',
  ini: 'Inicial',
  pri: 'Primaria',
  sec: 'Secundaria',
};

// Orden de precedencia dentro de un día. NO se puede ordenar por el string del
// nivel: sería alfabético (fer, ini, ins, per, pri, sec), que no significa nada.
export const ORDER = { per: 0, fer: 1, ins: 2, ini: 3, pri: 4, sec: 5 };

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_AB = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const DIAS_AB = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Los meses que dibuja la agenda: [año, mes 0-based].
export const MONTHS = [[2026, 8], [2026, 9], [2026, 10], [2026, 11]];

// Ventana del ciclo lectivo. Espejo de DESDE/HASTA en server/src/lib/validate.js.
export const DESDE = '2026-08-31';
export const HASTA = '2026-12-31';

// ── fechas ────────────────────────────────────────────────────────────────
// Todo se maneja como string 'YYYY-MM-DD' y se construye la Date con los tres
// números por separado: `new Date('2026-09-01')` parsea como UTC medianoche, que
// en Argentina es el 31/08 a las 21hs y corre el evento un día para atrás.

export function parse(s) {
  const p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

export function key(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function isoDow(dt) {
  return (dt.getDay() + 6) % 7; // lunes = 0
}

export function addDays(dt, n) {
  const d = new Date(dt);
  d.setDate(d.getDate() + n);
  return d;
}

export function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// "08:15" (valor de un <input type="time">) -> "8.15" (formato de la agenda).
// Lo que no tenga esa forma se devuelve tal cual: la pantalla de gestión usa un
// campo de texto libre porque el calendario del colegio tiene horarios como
// "8 a 15", y ahí no hay nada que convertir.
export function fmtHora(v) {
  if (!v) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return v.trim();
  return `${parseInt(m[1], 10)}.${m[2]}`;
}

// La inversa, para precargar el input al editar. Devuelve '' si la hora no es
// del formato H.MM — la agenda oficial tiene cosas como "8 a 15", que un
// <input type="time"> no puede representar.
export function toInputHora(v) {
  if (!v) return '';
  const m = /^(\d{1,2})\.(\d{2})$/.exec(v.trim());
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// Cómo se muestra la hora de un evento: la hora sola ("8.15") o el rango
// ("8.15 a 12.30") cuando además tiene hora de fin. La hora de fin es
// independiente de endDate: un acto puede empezar y terminar el mismo día.
// Devuelve '' si el evento no tiene hora — las pantallas cuentan con eso para
// no dibujar un "hs" pelado.
export function textoHora(ev) {
  if (!ev.time) return '';
  return ev.endTime ? `${ev.time} a ${ev.endTime}` : ev.time;
}

// ── índice por día ────────────────────────────────────────────────────────
// Un evento de varios días se expande a una ocurrencia por fecha, para que cada
// celda del calendario sepa qué mostrar sin recorrer la lista entera.

export function buildIndex(eventos) {
  const byDay = {};

  eventos.forEach((ev) => {
    const start = parse(ev.date);
    const end = ev.endDate ? parse(ev.endDate) : start;
    const total = Math.round((end - start) / 86400000) + 1;
    for (let k = 0; k < total; k++) {
      const kk = key(addDays(start, k));
      (byDay[kk] = byDay[kk] || []).push({
        ev,
        idx: k,
        total,
        span: total > 1,
        first: k === 0,
      });
    }
  });

  Object.keys(byDay).forEach((k) => {
    byDay[k].sort((a, b) => {
      if (a.span !== b.span) return a.span ? -1 : 1;
      const ha = a.ev.time ? parseFloat(a.ev.time) : 99;
      const hb = b.ev.time ? parseFloat(b.ev.time) : 99;
      if (ha !== hb) return ha - hb;
      return ORDER[a.ev.level] - ORDER[b.ev.level];
    });
  });

  return byDay;
}

// ── filtros ───────────────────────────────────────────────────────────────

// Cada pick arrastra lo que implica: Celeste ⇒ sala de 3 ⇒ infantes.
export function expandir(picks) {
  const exp = {};
  picks.forEach((id) => {
    exp[id] = true;
    const o = CAT[id];
    if (o && o.imp) o.imp.forEach((t) => { exp[t] = true; });
  });
  return exp;
}

function levelChosen(picks, n) {
  return (POOL[n] || []).some((k) => LISTS[k].some((o) => picks.includes(o.id)));
}

// Devuelve una función `visible(ev)` en vez de tomar los picks en cada llamada:
// se evalúa una vez por render y después se aplica a cientos de ocurrencias.
export function matcher(picks) {
  const exp = expandir(picks);
  const hay = picks.length > 0;

  return function visible(ev) {
    if (!hay) return true; // sin nada elegido: se ve todo
    if (ev.level === 'per') return picks.includes('personal');
    if (ev.level === 'fer') return picks.includes('feriados');
    if (ev.level === 'ins') return picks.includes('institucional');
    if (!levelChosen(picks, ev.level)) return false; // nivel que no le toca a nadie
    if (!ev.groups || !ev.groups.length) return true; // actividad de todo el nivel
    return ev.groups.some((t) => exp[t]);
  };
}

// Orden estable del resumen del header: el mismo que el catálogo, no el orden
// en que la persona fue tocando los botones.
export function ordenarPicks(picks) {
  const order = Object.keys(CAT);
  return [...picks].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
