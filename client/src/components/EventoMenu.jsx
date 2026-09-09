import { useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';
import { esLocal } from '../lib/personales';
import { DIAS, MESES, isoDow, parse, textoHora } from '../lib/agenda';
import IconoEditar from './IconoEditar';
import IconoCompartir from './IconoCompartir';
import IconoBorrar from './IconoBorrar';

// Menú rápido al tocar un evento propio (calendario o "Próximas fechas"):
// Editar abre EditEventDialog (el formulario completo); Compartir y Eliminar
// actúan directo desde acá, sin pasar por el formulario. Mismo patrón que
// antes vivía en EditEventDialog para compartir (navigator.share con
// fallback a link copiado) y para borrar (useConfirm, nunca window.confirm).
// La fecha completa, con día de la semana y mes en letras: este menú es lo
// primero que se abre al tocar un evento, así que hace de vista del evento y
// tiene que decir CUÁNDO es sin obligar a abrir "Editar". En un tramo de
// varios días el día de la semana sobra —lo que importa es del cuándo al
// cuándo—, y si los dos días caen en el mismo mes se nombra una sola vez.
function cuando(ev) {
  const s = parse(ev.date);
  const dia = (d) => `${d.getDate()} de ${MESES[d.getMonth()]}`;

  if (!ev.endDate || ev.endDate === ev.date) return `${DIAS[isoDow(s)]} ${dia(s)}`;

  const e = parse(ev.endDate);
  if (e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear()) {
    return `del ${s.getDate()} al ${dia(e)}`;
  }
  return `del ${dia(s)} al ${dia(e)}`;
}

function Cuerpo({ evento, onEditar, onClose }) {
  const { token } = useAuth();
  const { borrarMio } = useEventos();
  const confirm = useConfirm();
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');

  async function compartir() {
    setError('');
    try {
      const { token: evToken } = await api.mios.compartir(token, evento.id);
      const url = `${window.location.origin}/compartir/evento/${evToken}`;

      if (navigator.share) {
        try {
          await navigator.share({ title: evento.title, text: `Te comparto este evento: ${evento.title}`, url });
          onClose();
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          // Cualquier otro motivo (por ejemplo el panel no llegó a abrir):
          // sigue de largo al plan B de copiar el link.
        }
      }

      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        /* se copia a mano desde el input de abajo */
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar() {
    const ok = await confirm({
      title: 'Borrar evento',
      message: `¿Borrar "${evento.title}"? No se puede deshacer.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarMio(evento.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="ev-menu">
      <div className="ev-menu-head">
        <p className="ev-menu-title" id="evento-menu-title">{evento.title}</p>
        <p className="ev-menu-cuando">
          {cuando(evento)}
          {/* Sin hora no va nada: un "hs" pelado no dice nada, mismo criterio
              que el resto de las pantallas. */}
          {evento.time && <> · {textoHora(evento)}hs</>}
        </p>
      </div>

      {error && <p className="err">{error}</p>}

      {link ? (
        <div className="share-link">
          <p className="lede muted">El link se copió solo. Si no, pegalo a mano desde acá.</p>
          <div className="share-link-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button type="button" className="mbtn" onClick={onClose}>Listo</button>
          </div>
        </div>
      ) : (
        <div className="ev-menu-row">
          <button type="button" className="ev-menu-btn" onClick={() => onEditar(evento)}>
            <span className="ev-menu-icon"><IconoEditar /></span>
            Editar
          </button>
          {/* Sólo si ya existe en el server: uno local (sin cuenta todavía) no
              tiene nada que compartir. */}
          {!esLocal(evento.id) && (
            <button type="button" className="ev-menu-btn" onClick={compartir}>
              <span className="ev-menu-icon"><IconoCompartir /></span>
              Compartir
            </button>
          )}
          <button type="button" className="ev-menu-btn danger" onClick={eliminar}>
            <span className="ev-menu-icon"><IconoBorrar /></span>
            Eliminar
          </button>
        </div>
      )}

      {/* En celular tocar afuera no cierra nada (ver CLAUDE.md, "Mobile"):
          todo modal nuevo necesita su propio botón de salida, y acá no hay
          Guardar que ya cumpla ese rol. Con el link a la vista ya está
          "Listo" para eso. */}
      {!link && (
        <button type="button" className="mbtn ev-menu-cancel" onClick={onClose}>Cancelar</button>
      )}
    </div>
  );
}

export default function EventoMenu({ evento, onClose, onEditar }) {
  return (
    <Dialog open={Boolean(evento)} onClose={onClose} id="evento-menu" className="ev-menu-dialog" labelledBy="evento-menu-title">
      {evento && <Cuerpo evento={evento} onEditar={onEditar} onClose={onClose} />}
    </Dialog>
  );
}
