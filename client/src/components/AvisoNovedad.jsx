import IconoInfo from './IconoInfo';
import IconoCerrar from './IconoCerrar';
import { useNovedades } from '../context/NovedadesContext';

// Los avisos de arriba del calendario. Ya no son un texto fijo en el código:
// los carga y los da de baja el admin desde /novedades, y cada uno vive entre
// su fecha de inicio y la de vencimiento (ver routes/novedades.js — el corte
// por fecha lo hace el server).
//
// **Cada aviso se queda hasta que lo cierren**: no se va solo con el tiempo ni
// al recargar, y no hay botón de "después". La X lo saca para siempre — en la
// cuenta si hay sesión, y si no en este navegador (ver NovedadesContext). Lo
// único que lo saca sin que nadie lo toque es el vencimiento.
//
// Un aviso cerrado se puede volver a leer desde la "i" del encabezado, que
// muestra todas las vigentes estén cerradas o no.
export default function AvisoNovedad() {
  const { sinCerrar, cerrar } = useNovedades();

  if (sinCerrar.length === 0) return null;

  return (
    <>
      {sinCerrar.map((n) => (
        <div key={n.id} className="aviso" role="status">
          <span className="aviso-ico"><IconoInfo /></span>
          {/* El título es un prefijo corto ("Novedad", "Aviso"), no una
              oración: se lee pegado al texto, como venía el aviso fijo que
              había acá antes. */}
          <p className="aviso-txt">
            <b>{n.titulo}:</b> {n.texto}
          </p>
          <button
            type="button"
            className="aviso-cerrar"
            onClick={() => cerrar(n.id)}
            aria-label={`Cerrar el aviso "${n.titulo}"`}
          >
            <IconoCerrar />
          </button>
        </div>
      ))}
    </>
  );
}
