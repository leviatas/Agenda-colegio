import Dialog from './Dialog';
import { useNovedades } from '../context/NovedadesContext';
import { MES_AB, parse } from '../lib/agenda';

// parse() y no new Date(iso): un 'YYYY-MM-DD' pelado lo parsea el navegador
// como UTC y la fecha se corre un día (ver CLAUDE.md).
function fecha(iso) {
  const d = parse(iso);
  return `${d.getDate()} ${MES_AB[d.getMonth()]}`;
}

// La lista completa de novedades vigentes, atrás de la "i" del encabezado.
// Muestra TODAS —también las que ya se cerraron con la X— porque para eso
// está: para volver a leer algo que se cerró de más o se cerró en otro
// dispositivo. Es de sólo lectura; lo único que se hace acá es leer.
function Cuerpo({ onClose }) {
  const { novedades, cerradas } = useNovedades();

  return (
    <>
      <div className="modal-head">
        <h2 id="novedades-title">Novedades</h2>
      </div>

      <div className="modal-body">
        {novedades.length === 0 ? (
          <p className="empty-note">No hay novedades por ahora.</p>
        ) : (
          <ul className="nov-list">
            {novedades.map((n) => (
              <li key={n.id}>
                <strong>{n.titulo}</strong>
                <p>{n.texto}</p>
                <span className="nov-meta">
                  hasta el {fecha(n.hasta)}
                  {/* Que ya esté cerrada no la esconde de acá, pero se dice:
                      si no, no se entiende por qué está en esta lista y no
                      arriba del calendario. */}
                  {cerradas.has(n.id) && ' · ya la cerraste'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cerrar</button>
      </div>
    </>
  );
}

export default function NovedadesDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} id="novedades" labelledBy="novedades-title">
      <Cuerpo onClose={onClose} />
    </Dialog>
  );
}
