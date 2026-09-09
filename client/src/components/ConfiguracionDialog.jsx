import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import {
  activarNotificaciones,
  desactivarNotificaciones,
  estadoNotificaciones,
  guardarPreferencias,
  leerPreferencias,
  probarNotificaciones,
  probarAviso,
  PREFERENCIAS_DEFECTO,
} from '../lib/push';

// Las 24 horas del día como opciones del select. La hora es la de Argentina
// (el server la resuelve con un offset fijo, ver server/src/lib/push.js), así
// que no depende del huso del dispositivo.
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function hhmm(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

// Cómo se lee la preferencia en una frase, para que el texto de arriba diga
// lo que está realmente configurado y no un ejemplo fijo.
function resumen(p) {
  const cuando = p.dia === 'hoy' ? 'ese mismo día' : 'al día siguiente';
  const que = p.detalle === 'titulos' ? 'con el título de cada uno' : 'con cuántos son';
  return `Ahora te llega a las ${hhmm(p.hora)}, si ${cuando} tenés algo, ${que}.`;
}

// Configuración de la cuenta/navegador. Por ahora sólo tiene notificaciones,
// pero va en su propio modal (y no adentro de otro) porque es donde va a
// crecer lo próximo que se agregue acá.
function Cuerpo({ onClose }) {
  const { token, picks } = useAuth();
  // null mientras se consulta al navegador: el estado real (permiso +
  // suscripción activa) nunca se asume, se pregunta cada vez que se abre
  // este modal (ver estadoNotificaciones en lib/push.js).
  const [estado, setEstado] = useState(null);
  // Las preferencias del aviso son de la SUSCRIPCIÓN (este navegador), no de
  // la cuenta: se leen del server al abrir, no de un default local.
  const [prefs, setPrefs] = useState(PREFERENCIAS_DEFECTO);
  const [cambiando, setCambiando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [probandoAviso, setProbandoAviso] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    estadoNotificaciones().then(async (e) => {
      if (!vivo) return;
      setEstado(e);
      if (!e.activo) return;
      try {
        const p = await leerPreferencias(token);
        if (vivo) setPrefs(p);
      } catch (err) {
        /* si no se pudieron leer, quedan los defaults a la vista: el server
           sigue teniendo las suyas y no se pisan hasta que se toque un select */
      }
    });
    return () => {
      vivo = false;
    };
  }, [token]);

  // Los selects guardan solos: este modal no tiene botón de Guardar (sólo
  // "Cerrar"), así que un cambio que no se persistiera al toque se perdería
  // sin que nadie se entere. Optimista, con vuelta atrás si el server rechaza.
  async function cambiarPref(campo, valor) {
    const previas = prefs;
    const nuevas = { ...prefs, [campo]: valor };
    setPrefs(nuevas);
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      const r = await guardarPreferencias(token, nuevas);
      if (!r.ok) {
        setPrefs(previas);
        setError('Las notificaciones no están activas en este navegador.');
      } else {
        setPrefs(r.preferencias);
      }
    } catch (err) {
      setPrefs(previas);
      setError(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  }

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

  async function probarElAviso() {
    setError('');
    setAviso('');
    setProbandoAviso(true);
    try {
      const r = await probarAviso(token);
      const cuando = prefs.dia === 'hoy' ? 'hoy' : 'mañana';
      setAviso(
        r.enviados > 0
          ? `Listo: se corrió el aviso real ahora mismo, con el texto que te va a llegar a las ${hhmm(prefs.hora)}.`
          : `Se corrió el aviso real ahora mismo y no salió ninguna notificación: ${cuando} no hay eventos que te correspondan según tus filtros. Es lo mismo que pasaría a las ${hhmm(prefs.hora)}.`
      );
    } catch (err) {
      setError(err.message || 'No se pudo ejecutar el aviso.');
    } finally {
      setProbandoAviso(false);
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
        // Se manda lo que muestran los selects: si es la primera vez son los
        // defaults, y si ya estuvo activa antes son las que quedaron a la
        // vista, así reactivar no sorprende con otra hora.
        const r = await activarNotificaciones({ picks, token, preferencias: prefs });
        if (!r.ok) {
          setError(
            r.motivo === 'denegado'
              ? 'El navegador no dio el permiso. Podés habilitarlo desde los ajustes del sitio (el ícono del candado en la barra de direcciones) y volver a intentar.'
              : 'Este navegador o dispositivo no puede recibir notificaciones.'
          );
        } else {
          setEstado((e) => ({ ...e, activo: true }));
          try {
            setPrefs(await leerPreferencias(token));
          } catch (err) {
            /* quedan las que se acaban de mandar */
          }
        }
      }
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la configuración.');
    } finally {
      setCambiando(false);
    }
  }

  const ocupado = cambiando || probando || probandoAviso;

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
              Un aviso en el celular o la compu cuando tenés algo en la agenda: un evento oficial
              de tu sala o grado, o uno propio.{' '}
              {estado && estado.activo
                ? resumen(prefs)
                : 'Elegís a qué hora te llega, si es sobre los eventos de ese mismo día o los del siguiente, y si te dice sólo cuántos son o el título de cada uno.'}
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
                  <button type="button" className="mbtn" onClick={probar} disabled={ocupado}>
                    {probando ? 'Mandando…' : 'Probar'}
                  </button>
                  <button type="button" className="mbtn" onClick={probarElAviso} disabled={ocupado}>
                    {probandoAviso ? 'Simulando…' : 'Probar aviso'}
                  </button>
                </>
              )}
              <button
                type="button"
                className={`mbtn${estado.activo ? '' : ' primary'}`}
                onClick={alternar}
                disabled={ocupado}
              >
                {cambiando ? 'Un momento…' : estado.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </div>

        {/* Las preferencias son de ESTE navegador (ver PushSubscription en
            schema.prisma), así que sólo tienen sentido con la suscripción ya
            creada: sin eso no hay fila donde guardarlas. */}
        {estado && estado.soportado && estado.activo && (
          <div className="config-prefs">
            <label className="config-pref">
              <span>Avisarme a las</span>
              <select
                value={prefs.hora}
                onChange={(e) => cambiarPref('hora', Number(e.target.value))}
                disabled={guardando || ocupado}
              >
                {HORAS.map((h) => (
                  <option key={h} value={h}>{hhmm(h)}</option>
                ))}
              </select>
            </label>

            <label className="config-pref">
              <span>Sobre los eventos</span>
              <select
                value={prefs.dia}
                onChange={(e) => cambiarPref('dia', e.target.value)}
                disabled={guardando || ocupado}
              >
                <option value="siguiente">Del día siguiente</option>
                <option value="hoy">De ese mismo día</option>
              </select>
            </label>

            <label className="config-pref">
              <span>En el aviso</span>
              <select
                value={prefs.detalle}
                onChange={(e) => cambiarPref('detalle', e.target.value)}
                disabled={guardando || ocupado}
              >
                <option value="cantidad">Sólo cuántos son</option>
                <option value="titulos">El título de cada evento</option>
              </select>
            </label>

            <p className="lede muted config-pref-nota">
              Es la configuración de este dispositivo: el celular y la compu pueden tener horas
              distintas. La hora es la de Argentina.
              {prefs.dia === 'hoy' && ' Ojo que con los eventos del mismo día, si elegís una hora tardía el aviso llega cuando ya pasaron.'}
            </p>
          </div>
        )}

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
