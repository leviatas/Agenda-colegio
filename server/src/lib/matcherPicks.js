// Mirror de la parte de client/src/lib/agenda.js que decide si un evento del
// calendario OFICIAL le toca a ciertos `picks` (sala/grado/año/feriados/
// institucional). Lo necesita únicamente lib/push.js, para saber si avisarle
// a una suscripción sin tener que pedirle nada al cliente más que sus picks
// guardados. 'per' no entra acá: los personales viven en PersonalEvent y se
// resuelven aparte (ver push.js).
//
// Mismo motivo de duplicación que catalogo.js (que ya espeja SALAS/GRADOS/
// ANIOS): el build de Docker del cliente no entra en la imagen del server.
// Lo que agenda.js no tiene y hace falta acá es el `imp` de cada sala —qué
// grupo de edad y ciclo arrastra—, así que ESTE archivo también hay que
// tocarlo si se agrega una sala nueva.
const { SALAS, GRADOS, ANIOS } = require('./catalogo');

const SALAS_IMP = {
  amarillatm: ['s1', 'maternal'], amarilladjtt: ['s1', 'maternal'], violeta: ['s1', 'maternal'],
  rosatm: ['s2', 'maternal'], rosatt: ['s2', 'maternal'], turquesa: ['s2', 'maternal'],
  naranja: ['s3', 'infantes'], celeste: ['s3', 'infantes'], fucsia: ['s3', 'infantes'],
  verde: ['s4', 'infantes'], azul: ['s4', 'infantes'], bordo: ['s4', 'infantes'],
  roja: ['s5', 'infantes'], lila: ['s5', 'infantes'], blanca: ['s5', 'infantes'],
};

const POOL = { ini: SALAS, pri: GRADOS, sec: ANIOS };

function expandir(picks) {
  const exp = {};
  picks.forEach((id) => {
    exp[id] = true;
    (SALAS_IMP[id] || []).forEach((t) => { exp[t] = true; });
  });
  return exp;
}

function levelChosen(picks, nivel) {
  const lista = POOL[nivel];
  return Boolean(lista) && lista.some((id) => picks.includes(id));
}

// Devuelve una función `visible(ev)`, igual que matcher() de agenda.js.
function matcher(picks) {
  const exp = expandir(picks);
  const hay = picks.length > 0;

  return function visible(ev) {
    if (!hay) return true; // sin nada elegido: se ve todo
    if (ev.level === 'fer') return picks.includes('feriados');
    if (ev.level === 'ins') return picks.includes('institucional');
    if (!levelChosen(picks, ev.level)) return false;
    let groups = [];
    try {
      groups = JSON.parse(ev.groups || '[]');
    } catch (err) {
      groups = [];
    }
    if (!groups.length) return true; // actividad de todo el nivel
    return groups.some((t) => exp[t]);
  };
}

module.exports = { matcher };
