import { useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { DESDE, HASTA, MES_AB, fmtHora, parse, textoHora, toInputHora } from '../lib/agenda';

const VACIO = { id: null, title: '', date: '', endDate: '', time: '', endTime: '' };

function Cuerpo({ onClose }) {
  const { user } = useAuth();
  const { personales, agregarMio, editarMio, borrarMio } = useEventos();
  const confirm = useConfirm();

  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const editando = form.id !== null;
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
      // La hora se guarda en el formato de la agenda ('8.15'), no en el del
      // input ('08:15'), para que se muestre igual que los eventos oficiales.
      time: fmtHora(form.time),
      endTime: fmtHora(form.endTime),
    };

    setGuardando(true);
    try {
      if (editando) await editarMio(form.id, data);
      else await agregarMio(data);
      setForm(VACIO);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(ev) {
    const ok = await confirm({
      title: 'Borrar evento',
      message: `¿Borrar "${ev.title}"? No se puede deshacer.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarMio(ev.id);
      if (form.id === ev.id) setForm(VACIO);
    } catch (err) {
      setError(err.message);
    }
  }

  function editar(ev) {
    setError('');
    setForm({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      endDate: ev.endDate || '',
      time: toInputHora(ev.time),
      endTime: toInputHora(ev.endTime),
    });
  }

  const ordenados = [...personales].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <>
      <div className="modal-head">
        <h2 id="adder-title">{editando ? 'Editar evento' : 'Agregar evento'}</h2>
      </div>

      <div className="modal-body">
        <div className="field">
          <label htmlFor="ev-t">Título</label>
          <input id="ev-t" type="text" maxLength={90} autoComplete="off" value={form.title} onChange={set('title')} />
        </div>

        {/* Dos filas simétricas: arriba cuándo empieza, abajo cuándo termina.
            Las dos partes del final son independientes — un evento puede tener
            hora de fin sin durar varios días ("de 17 a 19"), o durar varios
            días sin hora ninguna. */}
        <div className="field-row">
          <div className="field">
            <label htmlFor="ev-d">Fecha</label>
            <input id="ev-d" type="date" min={DESDE} max={HASTA} value={form.date} onChange={set('date')} />
          </div>
          <div className="field">
            <label htmlFor="ev-h">Hora <span className="hint">(opcional)</span></label>
            <input id="ev-h" type="time" value={form.time} onChange={set('time')} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ev-e">Hasta <span className="hint">(opcional, si dura varios días)</span></label>
            <input id="ev-e" type="date" min={form.date || DESDE} max={HASTA} value={form.endDate} onChange={set('endDate')} />
          </div>
          <div className="field">
            <label htmlFor="ev-hh">Hora hasta <span className="hint">(opcional)</span></label>
            <input id="ev-hh" type="time" value={form.endTime} onChange={set('endTime')} />
          </div>
        </div>

        {error && <p className="err">{error}</p>}

        <div className="mine">
          {ordenados.length === 0 && <p className="none">Todavía no agregaste ninguno.</p>}
          {ordenados.length > 0 && (
            <ul>
              {ordenados.map((ev) => {
                const dt = parse(ev.date);
                return (
                  <li key={ev.id}>
                    <span className="md">
                      {dt.getDate()} {MES_AB[dt.getMonth()]}{ev.time ? ` · ${textoHora(ev)}` : ''}
                    </span>
                    <span className="mt">{ev.title}</span>
                    <button type="button" className="edit" aria-label={`Editar ${ev.title}`} onClick={() => editar(ev)}>
                      Editar
                    </button>
                    <button type="button" className="del" aria-label={`Borrar ${ev.title}`} onClick={() => borrar(ev)}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sin cuenta los eventos quedan en este navegador, que alcanza para
            usar la agenda. El aviso cuenta lo que suma entrar —verlos en el
            celular y en la computadora—, no es una condición para cargarlos.
            El botón de Google vive arriba, en el encabezado, así que acá va el
            texto solo: dos botones de login en pantalla confunden. */}
        {!user && (
          <div className="nudge">
            <p className="lede muted">
              Tus eventos quedan guardados en este navegador. Si entrás con Google —el botón
              está arriba de todo— pasan a tu cuenta y los ves igual desde el celular y desde
              la computadora. Nadie más los ve, ni el colegio.
            </p>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={editando ? () => setForm(VACIO) : onClose}>
          {editando ? 'Cancelar' : 'Cerrar'}
        </button>
        <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar'}
        </button>
      </div>
    </>
  );
}

export default function AdderDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} id="adder" labelledBy="adder-title">
      <Cuerpo onClose={onClose} />
    </Dialog>
  );
}
