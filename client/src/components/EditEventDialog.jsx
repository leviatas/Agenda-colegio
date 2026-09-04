import { useState } from 'react';
import Dialog from './Dialog';
import { useEventos } from '../context/EventosContext';
import { DESDE, HASTA, fmtHora, toInputHora } from '../lib/agenda';

// Editar UN evento propio. Se llega acá SÓLO tocando "Editar" en EventoMenu
// (el menú rápido que se abre al clickear el evento en el calendario o en
// "Próximas fechas"): compartir y borrar viven en ese menú, así que este
// modal tiene un solo trabajo. No hay lista de "mis eventos" en ningún lado:
// el calendario mismo es la lista.
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
  const { editarMio } = useEventos();

  // Se lee una sola vez al montar: Dialog desmonta este componente entero al
  // cerrarse (ver Dialog.jsx), así que cada apertura ya arranca con el evento
  // que se clickeó, sin un efecto que lo sincronice después.
  const [form, setForm] = useState(() => formularioDe(evento));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

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

  return (
    <>
      <div className="modal-head">
        <h2 id="edit-event-title">Editar evento</h2>
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
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cancelar</button>
        <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
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
