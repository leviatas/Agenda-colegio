import { useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';
import { esLocal } from '../lib/personales';
import IconoCompartir from './IconoCompartir';
import IconoBorrar from './IconoBorrar';
import { DESDE, HASTA, fmtHora, toInputHora } from '../lib/agenda';

// Editar, borrar o compartir UN evento propio, abierto clickeándolo directo
// en el calendario o en "Próximas fechas" (Month.jsx, Upcoming.jsx vía
// Calendario.jsx). No hay lista de "mis eventos" acá: el calendario mismo es
// la lista.
function formularioDe(ev) {
  return {
    id: ev.id,
    title: ev.title,
    date: ev.date,
    endDate: ev.endDate || '',
    time: toInputHora(ev.time),
    endTime: toInputHora(ev.endTime),
  };
}

function Cuerpo({ evento, onClose }) {
  const { token } = useAuth();
  const { editarMio, borrarMio } = useEventos();
  const confirm = useConfirm();

  // Se lee una sola vez al montar: Dialog desmonta este componente entero al
  // cerrarse (ver Dialog.jsx), así que cada apertura ya arranca con el evento
  // que se clickeó, sin un efecto que lo sincronice después.
  const [form, setForm] = useState(() => formularioDe(evento));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Link recién generado para este evento, si tocaron compartir y el
  // navegador no tiene panel nativo (ver `compartir` más abajo).
  const [link, setLink] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    setError('');
    const title = form.title.trim();
    if (!title) return setError('Falta el título.');
    if (!form.date) return setError('Falta la fecha.');
    if (form.date < DESDE || form.date > HASTA) {
      return setError('Tiene que caer entre el 31/08 y el 31/12 de 2026.');
    }
    if (form.endDate && form.endDate < form.date) {
      return setError('La fecha de fin no puede ser anterior al inicio.');
    }
    if (form.endTime && !form.time) {
      return setError('Para poner una hora de fin hace falta la hora de inicio.');
    }
    // Sólo cuando empieza y termina el mismo día: en un tramo de varios días la
    // hora de fin es la del último día y puede ser más temprana que la de inicio.
    if (form.endTime && !form.endDate && form.endTime <= form.time) {
      return setError('La hora de fin tiene que ser posterior a la de inicio.');
    }

    const data = {
      title,
      date: form.date,
      endDate: form.endDate || null,
      time: fmtHora(form.time),
      endTime: fmtHora(form.endTime),
    };

    setGuardando(true);
    try {
      await editarMio(form.id, data);
      // A diferencia de "Agregar", esto es un modal de UN evento: guardar
      // cierra, no tiene sentido dejarlo abierto para "el próximo".
      onClose();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  async function borrar() {
    const ok = await confirm({
      title: 'Borrar evento',
      message: `¿Borrar "${form.title}"? No se puede deshacer.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarMio(form.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  // Con navigator.share disponible (celular, básicamente) se abre el panel
  // nativo del sistema —WhatsApp, Mensajes, Mail, lo que tenga instalado la
  // persona— y listo, no hace falta nada más de acá. Cancelar ese panel tira
  // un AbortError que no es un error de verdad, así que no muestra nada. Sin
  // navigator.share (la mayoría de los navegadores de escritorio) se cae al
  // link copiado en el input de abajo, que sigue existiendo para eso.
  async function compartir() {
    setError('');
    try {
      const { token: evToken } = await api.mios.compartir(token, form.id);
      const url = `${window.location.origin}/compartir/evento/${evToken}`;

      if (navigator.share) {
        try {
          await navigator.share({ title: form.title, text: `Te comparto este evento: ${form.title}`, url });
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

  return (
    <>
      <div className="modal-head">
        <h2 id="edit-event-title">Editar evento</h2>
        {/* Sólo si ya existe en el server: uno local (sin cuenta todavía) no
            tiene nada que compartir. */}
        {!esLocal(form.id) && (
          <button type="button" className="share" title="Compartir" aria-label={`Compartir ${form.title}`} onClick={compartir}>
            <IconoCompartir />
          </button>
        )}
      </div>

      <div className="modal-body">
        <div className="field">
          <label htmlFor="ee-t">Título</label>
          <input id="ee-t" type="text" maxLength={90} autoComplete="off" value={form.title} onChange={set('title')} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ee-d">Fecha</label>
            <input id="ee-d" type="date" min={DESDE} max={HASTA} value={form.date} onChange={set('date')} />
          </div>
          <div className="field">
            <label htmlFor="ee-h">Hora <span className="hint">(opcional)</span></label>
            <input id="ee-h" type="time" value={form.time} onChange={set('time')} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ee-e">Hasta <span className="hint">(opcional, si dura varios días)</span></label>
            <input id="ee-e" type="date" min={form.date || DESDE} max={HASTA} value={form.endDate} onChange={set('endDate')} />
          </div>
          <div className="field">
            <label htmlFor="ee-hh">Hora hasta <span className="hint">(opcional)</span></label>
            <input id="ee-hh" type="time" value={form.endTime} onChange={set('endTime')} />
          </div>
        </div>

        {error && <p className="err">{error}</p>}

        {link && (
          <div className="share-link">
            <p className="lede muted">El link se copió solo. Si no, pegalo a mano desde acá.</p>
            <div className="share-link-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="mbtn" onClick={() => setLink(null)}>Listo</button>
            </div>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="mbtn btn-danger icon-only" type="button" onClick={borrar} title="Borrar" aria-label={`Borrar ${form.title}`}>
          <IconoBorrar />
        </button>
        <div className="modal-foot-right">
          <button className="mbtn" type="button" onClick={onClose}>Cancelar</button>
          <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function EditEventDialog({ evento, onClose }) {
  return (
    <Dialog open={Boolean(evento)} onClose={onClose} id="edit-event" labelledBy="edit-event-title">
      <Cuerpo evento={evento} onClose={onClose} />
    </Dialog>
  );
}
