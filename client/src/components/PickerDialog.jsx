import { useState } from 'react';
import Dialog from './Dialog';
import { EXTRAS, GRADOS, ANIOS, GRUPOS, SALAS } from '../lib/agenda';

function Opt({ o, activo, onToggle }) {
  return (
    <button
      type="button"
      className="opt"
      aria-pressed={activo}
      style={o.lv ? { '--lv': `var(--${o.lv})` } : undefined}
      onClick={() => onToggle(o.id)}
    >
      {o.c && <span className="sw" style={{ background: o.c }} />}
      {o.n}
    </button>
  );
}

// El cuerpo va en su propio componente porque Dialog desmonta el contenido al
// cerrarse: así el borrador se inicializa con los picks vigentes en CADA
// apertura, sin un efecto de sincronización que se olvide de correr.
function Cuerpo({ picks, onClose, onSave }) {
  const [draft, setDraft] = useState(picks);

  const toggle = (id) =>
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const activo = (id) => draft.includes(id);

  return (
    <>
      <div className="modal-head">
        <h2 id="picker-title">¿A quién seguís?</h2>
      </div>

      <div className="modal-body">
        <div className="grp ini">
          <h3>Jardín</h3>
          <div>
            {GRUPOS.map((gr) => (
              <div key={gr.k}>
                <p className="row-lbl">{gr.lbl}</p>
                <div className="opts">
                  {SALAS.filter((o) => o.g === gr.k).map((o) => (
                    <Opt key={o.id} o={o} activo={activo(o.id)} onToggle={toggle} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grp pri">
          <h3>Primaria</h3>
          <div className="opts">
            {GRADOS.map((o) => <Opt key={o.id} o={o} activo={activo(o.id)} onToggle={toggle} />)}
          </div>
        </div>

        <div className="grp sec">
          <h3>Secundaria</h3>
          <div className="opts">
            {ANIOS.map((o) => <Opt key={o.id} o={o} activo={activo(o.id)} onToggle={toggle} />)}
          </div>
        </div>

        <div className="grp per">
          <h3>Extras</h3>
          <div className="opts">
            {EXTRAS.map((o) => <Opt key={o.id} o={o} activo={activo(o.id)} onToggle={toggle} />)}
          </div>
        </div>
      </div>

      {/* En celular el modal ocupa toda la pantalla: tocar afuera no es una
          salida posible, así que el Cerrar propio no es opcional. */}
      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cerrar</button>
        <button className="mbtn" type="button" onClick={() => onSave([])}>Ver todo</button>
        <button className="mbtn primary" type="button" onClick={() => onSave(draft)}>Guardar</button>
      </div>
    </>
  );
}

export default function PickerDialog({ open, picks, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} id="picker" labelledBy="picker-title">
      <Cuerpo picks={picks} onClose={onClose} onSave={onSave} />
    </Dialog>
  );
}
