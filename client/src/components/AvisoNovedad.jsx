import { useState } from 'react';
import IconoCalendario from './IconoCalendario';
import IconoCerrar from './IconoCerrar';

// El aviso de la novedad, arriba del calendario: contar que ahora cada evento
// se puede pasar al Google Calendar propio, porque un ícono nuevo en cada
// renglón no se explica solo.
//
// **Se queda hasta que lo cierren**: no se va solo con el tiempo ni al
// recargar, y no hay botón de "después". Sólo la X lo saca, y ahí no vuelve
// nunca más en ese navegador — la marca va en localStorage, mismo mecanismo
// que el prompt de notificaciones (`sg-notif-preguntado-v1`).
const KEY = 'sg-aviso-gcal-v1';

// En modo privado localStorage tira tanto al leer como al escribir. Si no se
// puede leer, se muestra: mejor un aviso de más que una pantalla rota.
function yaCerrado() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch (err) {
    return false;
  }
}

export default function AvisoNovedad() {
  // Se lee una vez al montar y no en cada render: si no, tocar la X no se
  // vería hasta recargar.
  const [cerrado, setCerrado] = useState(yaCerrado);

  if (cerrado) return null;

  function cerrar() {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch (err) {
      /* sin almacenamiento el aviso vuelve en la próxima carga: se puede
         cerrar igual, que es lo que importa mientras esté a la vista */
    }
    setCerrado(true);
  }

  return (
    <div className="aviso" role="status">
      <span className="aviso-ico"><IconoCalendario /></span>
      <p className="aviso-txt">
        <b>Novedad:</b> al lado de cada evento hay un botón para agregarlo a tu Google Calendar.
      </p>
      <button type="button" className="aviso-cerrar" onClick={cerrar} aria-label="Cerrar el aviso">
        <IconoCerrar />
      </button>
    </div>
  );
}
