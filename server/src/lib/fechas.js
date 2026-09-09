// El día de calendario argentino, para lo que tiene que preguntarse "¿qué día
// es hoy?" del lado del server.
//
// -03:00 fijo y no una librería de zonas horarias: Argentina no usa horario de
// verano desde 2009. El contenedor corre en UTC, así que sin este corrimiento
// todo lo de después de las 21 de acá caería en el día siguiente — una novedad
// que vence hoy dejaría de verse tres horas antes de tiempo.
//
// Es el mismo criterio (y el mismo -180) con el que lib/telemetria.js corta el
// día de las visitas; ahí la función toma el timestamp de la línea y por eso
// vive allá.
const OFFSET_MIN = -180;

function ahoraArgentina() {
  return new Date(Date.now() + OFFSET_MIN * 60000);
}

// La fecha de hoy en Argentina, o la de dentro de `dias` días, como
// 'YYYY-MM-DD' — el mismo formato en que se guardan las fechas del calendario,
// así que se comparan directo como strings. Sumar 86.400.000 ms alcanza porque
// acá todos los días duran lo mismo.
function diaISO(dias = 0) {
  return new Date(ahoraArgentina().getTime() + dias * 86400000).toISOString().slice(0, 10);
}

function hoyISO() {
  return diaISO(0);
}

function mananaISO() {
  return diaISO(1);
}

module.exports = { OFFSET_MIN, ahoraArgentina, diaISO, hoyISO, mananaISO };
