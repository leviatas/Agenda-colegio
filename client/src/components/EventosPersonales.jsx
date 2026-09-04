import { useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';
import { esLocal } from '../lib/personales';
import IconoEditar from './IconoEditar';
import IconoCompartir from './IconoCompartir';
import IconoBorrar from './IconoBorrar';
import { MES_AB, parse, textoHora } from '../lib/agenda';

// La lista de "Eventos Personales" (Calendario.jsx en /personales): a
// diferencia del calendario general, acá cada fila actúa directo —lápiz para
// editar, ícono de compartir— sin pasar por el menú rápido de EventoMenu.jsx,
// que es el de tocar un evento en el calendario o en "Próximas fechas".
function cuando(ev) {
  const s = parse(ev.date);
  if (!ev.endDate) return `${s.getDate()} ${MES_AB[s.getMonth()]}`;
  const e = parse(ev.endDate);
  return `${s.getDate()} al ${e.getDate()} ${MES_AB[e.getMonth()]}`;
}

export default function EventosPersonales({ eventos, visible, onEditar }) {
  const { token } = useAuth();
  const { borrarMio } = useEventos();
  const confirm = useConfirm();

  const [error, setError] = useState('');
  // Link recién generado, si tocaron compartir y el navegador no tiene panel
  // nativo (ver `compartir` más abajo) — uno solo por vez, para el evento que
  // se esté compartiendo.
  const [link, setLink] = useState(null);

  const lista = eventos.filter(visible).slice().sort((a, b) => parse(a.date) - parse(b.date));

  async function compartir(ev) {
    setError('');
    try {
      const { token: evToken } = await api.mios.compartir(token, ev.id);
      const url = `${window.location.origin}/compartir/evento/${evToken}`;

      if (navigator.share) {
        try {
          await navigator.share({ title: ev.title, text: `Te comparto este evento: ${ev.title}`, url });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          // Cualquier otro motivo (por ejemplo el panel no llegó a abrir):
          // sigue de largo al plan B de copiar el link.
        }
      }

      setLink({ title: ev.title, url });
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        /* se copia a mano desde el input del diálogo */
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar(ev) {
    const ok = await confirm({
      title: 'Borrar evento',
      message: `¿Borrar "${ev.title}"? No se puede deshacer.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarMio(ev.id);
    } catch (err) {
      setError(err.message);
    }
  }

  if (lista.length === 0) {
    return <p className="empty-note">Todavía no cargaste ningún evento propio.</p>;
  }

  return (
    <>
      {error && <p className="err banner">{error}</p>}

      <ul className="per-list">
        {lista.map((ev) => {
          // Uno compartido con vos (trae `de`) es de sólo lectura: nada de
          // editar, compartir ni borrar lo que es de otra cuenta.
          const esPropio = !ev.de;
          return (
            <li key={ev.id} className="per-item">
              <span className="per-fecha">{cuando(ev)}</span>
              <span className="per-titulo">
                {ev.time && <b>{textoHora(ev)}hs · </b>}
                {ev.title}
                {ev.de && <span className="de"> · {ev.de}</span>}
              </span>
              {esPropio && (
                <span className="per-acciones">
                  <button type="button" className="ic" title="Editar" aria-label={`Editar ${ev.title}`} onClick={() => onEditar(ev)}>
                    <IconoEditar />
                  </button>
                  {/* Uno local (sin cuenta todavía) no tiene nada que compartir. */}
                  {!esLocal(ev.id) && (
                    <button type="button" className="ic" title="Compartir" aria-label={`Compartir ${ev.title}`} onClick={() => compartir(ev)}>
                      <IconoCompartir />
                    </button>
                  )}
                  <button type="button" className="ic danger" title="Eliminar" aria-label={`Eliminar ${ev.title}`} onClick={() => eliminar(ev)}>
                    <IconoBorrar />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(link)} onClose={() => setLink(null)} id="per-link" className="ev-menu-dialog" labelledBy="per-link-title">
        {link && (
          <div className="ev-menu">
            <p className="ev-menu-title" id="per-link-title">{link.title}</p>
            <div className="share-link">
              <p className="lede muted">El link se copió solo. Si no, pegalo a mano desde acá.</p>
              <div className="share-link-row">
                <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
                <button type="button" className="mbtn" onClick={() => setLink(null)}>Listo</button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
