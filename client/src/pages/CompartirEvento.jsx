import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { api } from '../api';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { DIAS, MES_AB, isoDow, parse, textoHora } from '../lib/agenda';

// Página del link de UN evento (ver AdderDialog: "Compartir" arriba de la
// lista de eventos propios). Pública en la parte de mirar —igual que el
// calendario oficial, se puede ver de qué evento se trata sin cuenta— y pide
// login sólo para el paso de agregarlo, porque la copia tiene que quedar en
// ALGUNA cuenta.
export default function CompartirEvento() {
  const { token: evToken } = useParams();
  const navigate = useNavigate();
  const { user, token, loginWithCredential } = useAuth();
  const { cargar } = useEventos();

  const [evento, setEvento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [aceptando, setAceptando] = useState(false);
  const [agregado, setAgregado] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.compartir
      .previa(evToken)
      .then((data) => {
        if (vivo) setEvento(data.evento);
      })
      .catch((err) => {
        if (vivo) setError(err.message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [evToken]);

  async function onCredential(credential) {
    setErrorLogin('');
    try {
      // Al entrar, EventosProvider sube solo los eventos que hubiera en este
      // navegador (ver Masthead): acá no hay nada más que hacer que loguear,
      // el botón de "Agregar" aparece solo en el siguiente render.
      await loginWithCredential(credential);
    } catch (err) {
      setErrorLogin(err.message);
    }
  }

  async function aceptar() {
    setError('');
    setAceptando(true);
    try {
      await api.compartir.aceptar(token, evToken);
      // Refresca todo el calendario: el nuevo evento tiene que verse en "mis
      // eventos" y en la grilla apenas se vuelva a la agenda.
      await cargar();
      setAgregado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setAceptando(false);
    }
  }

  if (cargando) {
    return (
      <div className="wrap">
        <p className="empty-note">Buscando el evento…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wrap">
        <p className="err banner">{error}</p>
      </div>
    );
  }

  if (agregado) {
    return (
      <div className="wrap compartir-evento">
        <div className="compartir-card">
          <p className="lede muted">Listo, lo agregamos a tu agenda.</p>
          <button type="button" className="mbtn primary" onClick={() => navigate('/')}>
            Ver en el calendario
          </button>
        </div>
      </div>
    );
  }

  const dt = parse(evento.date);
  const en = evento.endDate ? parse(evento.endDate) : dt;
  const cuando = evento.endDate
    ? `${dt.getDate()} al ${en.getDate()} de ${MES_AB[en.getMonth()]}`
    : `${DIAS[isoDow(dt)]} ${dt.getDate()} de ${MES_AB[dt.getMonth()]}`;

  return (
    <div className="wrap compartir-evento">
      <div className="compartir-card">
        <p className="lede muted">{evento.de} te quiere compartir este evento:</p>
        <h2>{evento.title}</h2>
        <p className="cuando">
          {cuando}
          {evento.time && <> · {textoHora(evento)}hs</>}
        </p>

        {user ? (
          <button type="button" className="mbtn primary" onClick={aceptar} disabled={aceptando}>
            {aceptando ? 'Agregando…' : 'Agregar a mi agenda'}
          </button>
        ) : (
          <>
            <p className="lede muted">Para agregarlo hace falta entrar con Google.</p>
            <GoogleLoginButton onCredential={onCredential} tema="filled_black" tamano="medium" />
            {errorLogin && <p className="err">{errorLogin}</p>}
          </>
        )}
      </div>
    </div>
  );
}
