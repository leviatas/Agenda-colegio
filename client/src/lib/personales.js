// Los eventos propios de quien todavía no entró con Google viven acá: en el
// localStorage de este navegador. En el primer login se suben a la cuenta y se
// van del navegador (ver `migrar` en EventosContext).
//
// Un evento local tiene la MISMA forma que el que devuelve el server
// (`serializePersonal`), así que el calendario los dibuja sin saber de dónde
// salieron. Lo único distinto es el id: un string 'loc-…' en vez del número que
// asigna SQLite. Esa diferencia es la que mira el contexto para decidir si una
// edición va al localStorage o a la API, y no pueden chocar nunca porque un id
// numérico jamás es un string.

const KEY = 'sg-eventos-locales-v1';

// En modo privado localStorage tira tanto al leer como al escribir, y el JSON
// guardado puede estar roto. Sin almacenamiento la app tiene que funcionar
// igual, así que todo acceso cae a vacío en vez de propagar el error.
function leerCrudo() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (err) {
    return [];
  }
}

function guardar(lista) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lista));
  } catch (err) {
    /* sin almacenamiento: los eventos valen para esta visita */
  }
  return lista;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Una fila corrupta se descarta sola: mejor perder un evento que dejar el
// calendario entero sin dibujar.
function sano(e) {
  return (
    e && typeof e === 'object' &&
    typeof e.id === 'string' && e.id !== '' &&
    typeof e.title === 'string' && e.title !== '' &&
    typeof e.date === 'string' && FECHA.test(e.date)
  );
}

// Mismas normalizaciones que hace el server al guardar (`parseEvento`), para
// que un evento se vea igual antes y después de migrar a la cuenta: endDate
// igual al inicio es un evento de un día, no un tramo de "día 1 de 1".
function normalizar(e) {
  return {
    id: e.id,
    date: e.date,
    endDate: e.endDate && e.endDate !== e.date ? e.endDate : null,
    level: 'per',
    time: e.time || null,
    title: e.title,
    groups: [],
  };
}

export function leerLocales() {
  return leerCrudo().filter(sano).map(normalizar);
}

// El id local lleva prefijo para que se note de dónde viene al mirar el
// storage; lo que importa para el código es que sea string.
function nuevoId() {
  return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const esLocal = (id) => typeof id === 'string';

// Las tres devuelven la lista resultante: el contexto la usa para setear el
// estado sin volver a leer el storage.
export function crearLocal(data) {
  return guardar([...leerLocales(), normalizar({ ...data, id: nuevoId() })]);
}

export function editarLocal(id, data) {
  return guardar(leerLocales().map((e) => (e.id === id ? normalizar({ ...data, id }) : e)));
}

export function borrarLocal(id) {
  return guardar(leerLocales().filter((e) => e.id !== id));
}
