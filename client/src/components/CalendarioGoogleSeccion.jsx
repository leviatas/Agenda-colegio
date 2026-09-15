import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ConfirmDialog';
import { pedirPermisoCalendario, precargarGoogle } from '../lib/calendarioGoogle';

// Mientras el server está sincronizando se vuelve a preguntar cada tanto, así
// "Actualizando…" pasa solo a "Actualizado el…" sin cerrar el modal.
const CONSULTA_MS = 2500;

function cuando(fecha) {
  return new Date(fecha).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// La sección de Configuración del calendario "San Gabriel" en Google Calendar.
// Es OPCIONAL: no se pide nada hasta que la persona toca "Dar permiso", y si
// no lo toca la agenda funciona exactamente igual.
//
// El estado sale siempre del server (nunca de un flag local): el permiso se
// puede sacar desde la cuenta de Google sin que la app se entere, y el server
// es quien lo descubre al sincronizar.
export default function CalendarioGoogleSeccion() {
  const { token, user } = useAuth();
  const confirm = useConfirm();
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const e = await api.calendarioGoogle.estado(token);
      if (vivo.current) setEstado(e);
    } catch (err) {
      if (vivo.current) setEstado({ configurado: false, fallo: true });
    }
  }, [token]);

  useEffect(() => {
    vivo.current = true;
    precargarGoogle();
    cargar();
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  useEffect(() => {
    if (!estado || !estado.sincronizando) return undefined;
    const t = setTimeout(cargar, CONSULTA_MS);
    return () => clearTimeout(t);
  }, [estado, cargar]);

  async function conectar() {
    setError('');
    setAviso('');
    let code;
    try {
      // Sin await antes de esta línea: el popup se tiene que abrir dentro del
      // mismo click o el navegador lo bloquea.
      code = await pedirPermisoCalendario({ scope: estado.scope, email: user.email });
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!code) {
      setAviso('No se dio el permiso, así que no se creó nada. Podés darlo cuando quieras.');
      return;
    }

    setOcupado(true);
    try {
      await api.calendarioGoogle.conectar(token, code);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo conectar Google Calendar.');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function sincronizar() {
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      await api.calendarioGoogle.sincronizar(token);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar.');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function desconectar() {
    setError('');
    setAviso('');
    const ok = await confirm({
      title: 'Desconectar Google Calendar',
      message:
        'Se borra el calendario "San Gabriel" de tu Google Calendar y la agenda deja de tener permiso para tocarlo. Tus eventos de la agenda no se tocan.',
      confirmLabel: 'Desconectar',
    });
    if (!ok) return;

    setOcupado(true);
    try {
      await api.calendarioGoogle.desconectar(token);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo desconectar.');
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  const conectado = Boolean(estado && estado.conectado);
  let nota = null;
  if (conectado && estado.sincronizando) nota = 'Actualizando el calendario…';
  else if (conectado && !estado.error && estado.ultimaSync) nota = `Actualizado el ${cuando(estado.ultimaSync)}.`;

  return (
    <section className="config-seccion">
      <div className="config-row">
        <div className="config-info">
          <strong>Google Calendar</strong>
          <p className="lede muted">
            {conectado
              ? 'Tenés el calendario "San Gabriel" en tu Google Calendar, con los eventos de la agenda que te tocan según tus filtros, tus eventos personales y los que te comparten. Se actualiza solo cuando cambiás los filtros o los eventos.'
              : 'Opcional: si le das permiso, la agenda crea un calendario "San Gabriel" en tu Google Calendar con los eventos que te tocan según tus filtros y tus eventos personales, y lo mantiene al día. Sólo puede tocar ese calendario, nada más de tu cuenta.'}
          </p>
        </div>

        {estado === null ? (
          <span className="empty-note">Consultando…</span>
        ) : !estado.configurado ? (
          <span className="empty-note">
            {estado.fallo ? 'No se pudo consultar.' : 'No disponible en este servidor.'}
          </span>
        ) : (
          <div className="config-row-acciones">
            {conectado ? (
              <>
                <button type="button" className="mbtn" onClick={sincronizar} disabled={ocupado || estado.sincronizando}>
                  Sincronizar ahora
                </button>
                <button type="button" className="mbtn" onClick={desconectar} disabled={ocupado}>
                  Desconectar
                </button>
              </>
            ) : (
              <button type="button" className="mbtn primary" onClick={conectar} disabled={ocupado}>
                {ocupado ? 'Conectando…' : 'Dar permiso'}
              </button>
            )}
          </div>
        )}
      </div>

      {nota && <p className="lede muted">{nota}</p>}
      {conectado && estado.error && !estado.sincronizando && <p className="err">{estado.error}</p>}
      {error && <p className="err">{error}</p>}
      {aviso && <p className="lede muted">{aviso}</p>}
    </section>
  );
}
