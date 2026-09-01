// Niveles y tags válidos del calendario oficial.
//
// ⚠️ Esto es un ESPEJO de `client/src/lib/agenda.js`: si agregás una sala, un
// grado o un año, tocá LOS DOS archivos. Está duplicado a propósito y no
// compartido: el build de Docker del cliente sólo copia `client/`, así que un
// archivo común fuera de esa carpeta no entraría en la imagen.
//
// Vale la duplicación porque el modo de falla del otro camino (no validar) es
// el peor posible para un calendario: un tag mal escrito guarda el evento sin
// error y lo deja invisible para todo el mundo, porque no matchea con ningún
// filtro. Mejor un 400 al cargarlo.

// 'per' no está: los personales viven en PersonalEvent, no en Event.
const LEVELS = ['ini', 'pri', 'sec', 'ins', 'fer'];

const SALAS = [
  'amarillatm', 'amarilladjtt', 'violeta',
  'rosatm', 'rosatt', 'turquesa',
  'naranja', 'celeste', 'fucsia',
  'verde', 'azul', 'bordo',
  'roja', 'lila', 'blanca',
];

// Tags implicados: una sala arrastra su grupo de edad y su ciclo, y un evento
// puede apuntar directo al grupo ("campamento salas de 3").
const GRUPOS = ['s1', 's2', 's3', 's4', 's5', 'maternal', 'infantes'];

const GRADOS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
const ANIOS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

const TAGS = new Set([...SALAS, ...GRUPOS, ...GRADOS, ...ANIOS]);

module.exports = { LEVELS, TAGS, SALAS, GRUPOS, GRADOS, ANIOS };
