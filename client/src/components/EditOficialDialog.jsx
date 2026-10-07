import { useState } from 'react';
import Dialog from './Dialog';
import CamposOficial, { datosOficial, formularioOficial } from './CamposOficial';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';

// Editar UN evento oficial sin salir del calendario: el admin lo abre tocando
// la tarjeta en "Próximas fechas". Es el mismo formulario que /oficial
// (CamposOficial) y la misma ruta de la API, así que lo cierra requireAdmin
// igual: que la tarjeta sea clickeable sólo para el admin es UI, no seguridad.
function Cuerpo({ evento, onClose }) {
  const { token } = useAuth();
  const { reemplazarOficial, quitarOficial } = useEventos();
  const confirm = useConfirm();

  // Se lee una sola vez al montar: Dialog desmonta el cuerpo al cerrarse, así
  // que cada apertura arranca con el evento que se tocó.
  const [form, setForm] = useState(() => formularioOficial(evento));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError('');
    const { error: invalido, data } = datosOficial(form);
    if (invalido) return setError(invalido);

    setGuardando(true);
    try {
      const res = await api.oficial.update(token, form.id, data);
      reemplazarOficial(res.evento);
      onClose();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  // Mismo texto y misma confirmación que el "×" de /oficial. El <dialog> de
  // la confirmación se abre arriba de éste (top layer, ver ConfirmDialog).
  async function borrar() {
    setError('');
    const ok = await confirm({
      title: 'Borrar del calendario oficial',
      message: `¿Borrar "${evento.title}" del ${evento.date}? Lo dejan de ver todas las familias.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    setGuardando(true);
    try {
      await api.oficial.remove(token, evento.id);
      quitarOficial(evento.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <h2 id="edit-oficial-title">Editar evento oficial</h2>
      </div>

      <div className="modal-body">
        <CamposOficial form={form} setForm={setForm} idPrefix="eo" />
        <p className="hint">El cambio lo ven todas las familias.</p>
        {error && <p className="err">{error}</p>}
      </div>

      {/* Borrar a la izquierda, lejos de Guardar: .modal-foot reparte con
          space-between, así no queda pegado al botón que más se toca. */}
      <div className="modal-foot">
        <button className="mbtn danger" type="button" onClick={borrar} disabled={guardando}>Borrar</button>
        <div className="modal-foot-der">
          <button className="mbtn" type="button" onClick={onClose}>Cancelar</button>
          <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function EditOficialDialog({ evento, onClose }) {
  return (
    <Dialog open={Boolean(evento)} onClose={onClose} id="edit-oficial" labelledBy="edit-oficial-title">
      <Cuerpo evento={evento} onClose={onClose} />
    </Dialog>
  );
}
