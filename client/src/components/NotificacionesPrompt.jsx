import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { activarNotificaciones, marcarPreguntado, soportaPush, yaSePregunto } from '../lib/push';

// El prompt de "¿querés que te avisemos?" de la primera visita. Aparte de
// ConfirmDialog a propósito: ese es específicamente para confirmar acciones
// destructivas (ver CLAUDE.md) y su botón de confirmar es rojo — activar
// notificaciones no es ni destructivo ni algo de qué alertar.
export default function NotificacionesPrompt() {
  const { token, picks, loading } = useAuth();
  const [abierto, setAbierto] = useState(false);
  // Se muestra un segundo modal aparte, no un simple aviso en el primero, por
  // la misma regla que el resto de la app en celular: todo modal se cierra
  // con un botón propio, nunca dejando el anterior con un texto que cambia
  // solo debajo de dos botones que ya no aplican.
  const [avisoDespues, setAvisoDespues] = useState(false);

  useEffect(() => {
    if (loading || !soportaPush() || yaSePregunto()) return;
    // Un respiro antes de preguntar: que la agenda termine de mostrarse
    // primero, no competir por la atención de quien recién entró.
    const id = setTimeout(() => setAbierto(true), 1200);
    return () => clearTimeout(id);
  }, [loading]);

  async function responder(quiere) {
    marcarPreguntado();
    setAbierto(false);
    if (!quiere) {
      setAvisoDespues(true);
      return;
    }
    try {
      await activarNotificaciones({ picks, token });
    } catch (err) {
      /* si falla no hay dónde mostrarlo acá: se puede reintentar desde
         Configuración, que si tiene su propio mensaje de error */
    }
  }

  return (
    <>
      <Dialog
        open={abierto}
        onClose={() => responder(false)}
        id="notif-prompt"
        className="ev-menu-dialog"
        labelledBy="notif-prompt-title"
      >
        <div className="ev-menu">
          <p className="ev-menu-title" id="notif-prompt-title">
            ¿Querés que te avisemos si mañana tenés eventos?
          </p>
          <p className="lede muted notif-prompt-lede">
            Un aviso en el celular o la compu a las 17, sólo la tarde anterior a un día
            con algo en tu agenda.
          </p>
          <div className="modal-actions notif-prompt-acciones">
            <button type="button" className="mbtn" onClick={() => responder(false)}>No</button>
            <button type="button" className="mbtn primary" onClick={() => responder(true)}>Sí</button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={avisoDespues}
        onClose={() => setAvisoDespues(false)}
        id="notif-aviso"
        className="ev-menu-dialog"
        labelledBy="notif-aviso-title"
      >
        <div className="ev-menu">
          <p className="ev-menu-title" id="notif-aviso-title">Listo</p>
          <p className="lede muted notif-prompt-lede">
            Cuando quieras, las podés activar desde tu perfil (arriba a la derecha) → Config.
          </p>
          <button type="button" className="mbtn ev-menu-cancel" onClick={() => setAvisoDespues(false)}>
            Entendido
          </button>
        </div>
      </Dialog>
    </>
  );
}
