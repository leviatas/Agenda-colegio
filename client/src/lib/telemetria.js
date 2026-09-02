// Telemetría de visitas del lado del cliente: avisarle al server que alguien
// abrió la agenda, para poder contar cuántas personas distintas la usan (el
// server lo escribe en su log, ver server/src/lib/telemetria.js).
//
// El id del visitante es un random que vive en el localStorage de este
// navegador. No sale de la IP ni de nada de la persona: es sólo un número para
// no contar diez veces a quien entra diez veces. Como es del navegador, la
// misma familia desde el celular y desde la computadora cuenta como dos, y
// quien limpia el navegador vuelve a contar como una visita nueva. Para saber
// si la agenda se usa alcanza y sobra.

import { api } from '../api';

const KEY = 'sg-visitante-v1';

// Mismo formato que los ids locales de personales.js: tiempo + random en base
// 36. Tiene que matchear la regex del server (letras, números y guiones).
function nuevoId() {
  return `vis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Fallback para cuando no hay almacenamiento (modo privado): el id vale para
// esta pestaña. La visita se cuenta igual, sólo que como visitante nuevo.
let enMemoria = null;

export function visitanteId() {
  try {
    const guardado = window.localStorage.getItem(KEY);
    if (guardado) return guardado;
    const id = nuevoId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch (err) {
    if (!enMemoria) enMemoria = nuevoId();
    return enMemoria;
  }
}

// Una visita por token distinto en la vida de la pestaña. El Set cubre tres
// cosas de una: el doble montaje de StrictMode en desarrollo, los re-renders, y
// que entrar con Google mande una segunda visita —esa ya con la cuenta— sin que
// después se repita en cada render.
const avisadas = new Set();

export function registrarVisita(token) {
  const clave = token || 'anon';
  if (avisadas.has(clave)) return;
  avisadas.add(clave);

  api.visita(token, visitanteId()).catch(() => {
    // Contar una visita nunca puede romperle la agenda a nadie ni mostrar un
    // error: si no llegó, no llegó.
  });
}
