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

// Menú rápido al tocar un evento propio (calendario o "Próximas fechas"):
// Editar abre EditEventDialog (el formulario completo); Compartir y Eliminar
// actúan directo desde acá, sin pasar por el formulario. Mismo patrón que
// antes vivía en EditEventDialog para compartir (navigator.share con
// fallback a link copiado) y para borrar (useConfirm, nunca window.confirm).
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
      <p className="ev-menu-title" id="evento-menu-title">{evento.title}</p>

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
