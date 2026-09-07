import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { activarNotificaciones, desactivarNotificaciones, estadoNotificaciones, probarNotificaciones, probarEventosHoy } from '../lib/push';

// Configuración de la cuenta/navegador. Por ahora sólo tiene notificaciones,
// pero va en su propio modal (y no adentro de otro) porque es donde va a
// crecer lo próximo que se agregue acá.
function Cuerpo({ onClose }) {
  const { token, picks } = useAuth();
  // null mientras se consulta al navegador: el estado real (permiso +
  // suscripción activa) nunca se asume, se pregunta cada vez que se abre
  // este modal (ver estadoNotificaciones en lib/push.js).
  const [estado, setEstado] = useState(null);
  const [cambiando, setCambiando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [probandoHoy, setProbandoHoy] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    estadoNotificaciones().then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function probar() {
    setError('');
    setAviso('');
    setProbando(true);
    try {
      await probarNotificaciones(token);
      setAviso('Se mandó. Debería llegarte en unos segundos.');
    } catch (err) {
      setError(err.message || 'No se pudo mandar la prueba.');
    } finally {
      setProbando(false);
    }
  }

  async function probarHoy() {
    setError('');
    setAviso('');
    setProbandoHoy(true);
    try {
      await probarEventosHoy(token);
      setAviso(
        'Listo: se corrió el aviso diario ahora mismo. Si hoy tenés eventos que matchean tus filtros, la notificación llega en unos segundos. Si no llega nada, es porque hoy no hay eventos que te correspondan (lo mismo que pasaría a las 8:00 AM).'
      );
    } catch (err) {
      setError(err.message || 'No se pudo ejecutar el aviso diario.');
    } finally {
      setProbandoHoy(false);
    }
  }

  async function alternar() {
    setError('');
    setAviso('');
    setCambiando(true);
    try {
      if (estado.activo) {
        await desactivarNotificaciones(token);
        setEstado((e) => ({ ...e, activo: false }));
      } else {
        const r = await activarNotificaciones({ picks, token });
        if (!r.ok) {
          setError(
            r.motivo === 'denegado'
              ? 'El navegador no dio el permiso. Podés habilitarlo desde los ajustes del sitio (el ícono del candado en la barra de direcciones) y volver a intentar.'
              : 'Este navegador o dispositivo no puede recibir notificaciones.'
          );
        } else {
          setEstado((e) => ({ ...e, activo: true }));
        }
      }
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la configuración.');
    } finally {
      setCambiando(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <h2 id="config-title">Configuración</h2>
      </div>

      <div className="modal-body">
        <div className="config-row">
          <div className="config-info">
            <strong>Notificaciones</strong>
            <p className="lede muted">
              Un aviso en el celular o la compu si hoy tenés algo en la agenda: un evento oficial de
              tu sala o grado, o uno propio.
            </p>
          </div>

          {estado === null ? (
            <span className="empty-note">Consultando…</span>
          ) : !estado.soportado ? (
            <span className="empty-note">No disponible en este navegador.</span>
          ) : (
            <div className="config-row-acciones">
              {/* Sólo tiene sentido probar algo que ya está activo: si no,
                  "Probar" no haría más que repetir el mismo pedido de
                  permiso que ya hace "Activar". */}
              {estado.activo && (
                <>
                  <button type="button" className="mbtn" onClick={probar} disabled={probando || probandoHoy || cambiando}>
                    {probando ? 'Mandando…' : 'Probar'}
                  </button>
                  <button type="button" className="mbtn" onClick={probarHoy} disabled={probandoHoy || probando || cambiando}>
                    {probandoHoy ? 'Simulando…' : 'Prueba Eventos Hoy'}
                  </button>
                </>
              )}
              <button
                type="button"
                className={`mbtn${estado.activo ? '' : ' primary'}`}
                onClick={alternar}
                disabled={cambiando || probando}
              >
                {cambiando ? 'Un momento…' : estado.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </div>

        {error && <p className="err">{error}</p>}
        {aviso && <p className="lede muted">{aviso}</p>}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cerrar</button>
      </div>
    </>
  );
}

export default function ConfiguracionDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} id="configuracion" labelledBy="config-title">
      <Cuerpo onClose={onClose} />
    </Dialog>
  );
}
