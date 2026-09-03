// Dos mecanismos de compartir eventos personales entre cuentas, ninguno con
// tabla propia para el link de un solo evento (ver más abajo por qué sí la
// tiene la suscripción a todos).

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Link de UN evento: el token es un JWT que sólo guarda el id del
// PersonalEvent, sin tabla propia — no hace falta persistir nada porque el
// evento en sí YA está guardado, y el token se limita a probar que quien lo
// tiene puede verlo. Sin `expiresIn` a propósito: compartir un cumpleaños no
// debería vencer. Se invalida solo si el evento se borra, porque quien lo lee
// vuelve a buscarlo en la base en cada uso en vez de confiar en algo que
// viajó en el token.
function firmarEventoCompartido(personalEventId) {
  return jwt.sign({ t: 'evento', id: personalEventId }, JWT_SECRET);
}

// Devuelve el id o null: un token vencido no aplica acá (no tienen
// expiración), pero uno viejo de otro propósito, manipulado, o simplemente
// basura en la URL tienen que dar el mismo "no es válido" que un evento
// borrado, no un 500.
function leerEventoCompartido(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.t !== 'evento' || typeof payload.id !== 'number') return null;
    return payload.id;
  } catch (err) {
    return null;
  }
}

// Código de "compartir todos mis eventos" (User.shareCode): a diferencia del
// link de un evento, ACÁ sí hace falta guardar algo, porque el código tiene
// que seguir sirviendo después de que el navegador que lo generó se cierre, y
// porque hay que poder listar y cortar accesos (EventSubscription). Alfabeto
// sin 0/O ni 1/I/L: son los caracteres que más se confunden al pasar un código
// a mano por WhatsApp.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 8;

function generarCodigo() {
  let s = '';
  for (let i = 0; i < LARGO; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return s;
}

module.exports = { firmarEventoCompartido, leerEventoCompartido, generarCodigo };
