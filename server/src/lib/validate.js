// Validación compartida entre el calendario oficial y los eventos personales:
// las dos rutas escriben las mismas fechas, el mismo formato de hora y el mismo
// título, y no queremos dos criterios distintos para lo mismo.

// Ventana del ciclo lectivo que cubre la agenda. Es el mismo rango que acota el
// <input type="date"> del cliente; se revalida acá porque el atributo `min`/`max`
// del input es una ayuda de UI, no una defensa (un POST con curl lo ignora).
const DESDE = '2026-08-31';
const HASTA = '2026-12-31';

const MAX_TITULO = 90;

function esFecha(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  // La regex sola deja pasar 2026-02-31. Comparamos contra la fecha
  // reconstruida en UTC para no depender del huso del proceso.
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Devuelve { ok: true, value } o { ok: false, error } — nunca tira.
function parseEvento(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { ok: false, error: 'Falta el título.' };
  if (title.length > MAX_TITULO) {
    return { ok: false, error: `El título no puede pasar de ${MAX_TITULO} caracteres.` };
  }

  const date = body.date;
  if (!esFecha(date)) return { ok: false, error: 'La fecha no es válida.' };
  if (date < DESDE || date > HASTA) {
    return { ok: false, error: 'La fecha tiene que caer entre el 31/08 y el 31/12 de 2026.' };
  }

  // endDate vacío, null o ausente son lo mismo: evento de un solo día.
  let endDate = body.endDate || null;
  if (endDate !== null) {
    if (!esFecha(endDate)) return { ok: false, error: 'La fecha de fin no es válida.' };
    if (endDate < date) return { ok: false, error: 'La fecha de fin no puede ser anterior al inicio.' };
    if (endDate > HASTA) return { ok: false, error: 'La fecha de fin se va del ciclo lectivo.' };
    // Guardar endDate == date sería un tramo de "un día" que el cliente pintaría
    // como span ("día 1 de 1"). Se normaliza a null.
    if (endDate === date) endDate = null;
  }

  // La hora es texto libre porque la agenda mezcla formatos ('8.15', '8 a 15').
  // Sólo se acota el largo y se normaliza el vacío a null.
  let time = typeof body.time === 'string' ? body.time.trim() : '';
  if (time.length > 20) return { ok: false, error: 'La hora es demasiado larga.' };
  time = time || null;

  return { ok: true, value: { title, date, endDate, time } };
}

module.exports = { parseEvento, esFecha, DESDE, HASTA };
