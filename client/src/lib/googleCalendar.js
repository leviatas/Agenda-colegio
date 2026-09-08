// El link de "agregar a Google Calendar" que lleva el botón al lado de cada
// evento. Es la URL pública del formulario de Google (`action=TEMPLATE`): abre
// el evento ya cargado y la persona confirma en su propia cuenta. No hace falta
// ni la API de Calendar ni pedirle permisos a nadie — la agenda no toca el
// calendario de Google, sólo le pasa los datos.
import { CAT, NIVELES, addDays, key, parse, textoHora } from './agenda';

const BASE = 'https://calendar.google.com/calendar/render';

// Fijo, como el corte de día de la telemetría: las horas de la agenda son de
// Argentina, y sin esto Google las interpreta en el huso del dispositivo (un
// acto de las 8.15 cargado desde otro país entraría corrido).
const TZ = 'America/Argentina/Buenos_Aires';

// Cuánto dura un evento del que sólo sabemos a qué hora empieza.
const DURACION_MIN = 60;

const UNA = /^(\d{1,2})(?:[.:](\d{1,2}))?$/;
// "8 a 15" es como viene el calendario del colegio: un rango metido en el
// mismo campo `time` (ver CLAUDE.md, "Modelo de datos").
const RANGO = /^(\d{1,2})(?:[.:](\d{1,2}))?\s*a\s*(\d{1,2})(?:[.:](\d{1,2}))?$/i;

// Texto de hora -> minutos desde la medianoche, o null si no tiene la forma de
// una hora. Devolver null no es un error: el evento se agrega como de día
// completo y la hora tal cual estaba escrita va en la descripción.
function minutos(h, m) {
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  if (!Number.isFinite(hh) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function reloj(txt) {
  const m = UNA.exec(String(txt || '').trim());
  return m ? minutos(m[1], m[2]) : null;
}

// { inicio, fin } en minutos, con `fin` null si el evento no dice cuándo
// termina. null entero = no hay hora utilizable.
function horario(ev) {
  const txt = String(ev.time || '').trim();
  if (!txt) return null;

  const r = RANGO.exec(txt);
  if (r) return { inicio: minutos(r[1], r[2]), fin: minutos(r[3], r[4]) };

  const inicio = reloj(txt);
  if (inicio === null) return null;
  return { inicio, fin: reloj(ev.endTime) };
}

const dosDigitos = (n) => String(n).padStart(2, '0');

// '2026-09-08' -> '20260908', el formato de fechas de la URL de Google.
const compacta = (fecha) => fecha.replace(/-/g, '');

const sello = (fecha, min) => `${compacta(fecha)}T${dosDigitos(Math.floor(min / 60))}${dosDigitos(min % 60)}00`;

// El tramo `dates=` de la URL. Sin hora es de día completo, y ahí Google toma
// el fin como EXCLUSIVO: un evento de un solo día va del 8 al 9.
function tramo(ev) {
  const desde = ev.date;
  const hasta = ev.endDate || ev.date;
  const hs = horario(ev);

  if (!hs) return `${compacta(desde)}/${compacta(key(addDays(parse(hasta), 1)))}`;

  let fin = hs.fin;
  // Sin hora de fin, o con una que no cierra (el mismo día terminando antes de
  // empezar), se le da una duración por default en vez de mandar un rango
  // inválido que Google descarta sin decir nada.
  if (fin === null || (hasta === desde && fin <= hs.inicio)) fin = hs.inicio + DURACION_MIN;
  const cierra = Math.min(fin, 23 * 60 + 59);

  return `${sello(desde, hs.inicio)}/${sello(hasta, cierra)}`;
}

// La descripción: de dónde salió el evento y, si la hora no se pudo interpretar
// como tal, el texto original — que si no se perdería del todo.
function detalle(ev) {
  const lineas = [];

  if (ev.de) lineas.push(`Evento compartido por ${ev.de}.`);

  // El evento de la página de un link compartido no trae `level` (ver la vista
  // previa en server/src/routes/eventos.js): sin nivel no hay nada que decir.
  if (ev.level && ev.level !== 'per') {
    const tags = (ev.groups || []).map((id) => CAT[id] && CAT[id].n).filter(Boolean);
    const nivel = NIVELES[ev.level] || '';
    lineas.push(tags.length ? `${nivel}: ${tags.join(', ')}` : nivel);
  }

  // Sin "hs": lo que cae acá es texto que no tiene forma de hora, y el
  // sufijo lo haría más raro todavía.
  if (ev.time && !horario(ev)) lineas.push(`Horario: ${textoHora(ev)}`);

  lineas.push('Agenda del Colegio San Gabriel');
  return lineas.filter(Boolean).join('\n');
}

export function urlGoogleCalendar(ev) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: tramo(ev),
    details: detalle(ev),
    ctz: TZ,
  });
  return `${BASE}?${p.toString()}`;
}
