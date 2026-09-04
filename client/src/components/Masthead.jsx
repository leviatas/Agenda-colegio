import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeSwitch from './ThemeSwitch';
import GoogleLoginButton from './GoogleLoginButton';
import IconoCompartir from './IconoCompartir';
import { useCompartirTodo } from './CompartirTodoDialog';
import { useAuth } from '../context/AuthContext';
import { useAngosto } from '../lib/media';

export default function Masthead() {
  const { user, loginWithCredential, logout } = useAuth();
  const { pathname } = useLocation();
  const angosto = useAngosto();
  const [errorLogin, setErrorLogin] = useState('');
  // Compartir TODOS los eventos (código + suscripciones) es aparte de
  // compartir uno solo: el modal es una única instancia compartida con
  // EventosPersonales.jsx (ver CompartirTodoDialog.jsx), acá sólo se abre.
  const abrirCompartirTodo = useCompartirTodo();
  const enOficial = pathname.startsWith('/oficial');
  const enUsuarios = pathname.startsWith('/usuarios');
  const enMetricas = pathname.startsWith('/metricas');
  const enPersonales = pathname.startsWith('/personales');
  const enCompartir = pathname.startsWith('/compartir');

  async function onCredential(credential) {
    setErrorLogin('');
    try {
      // Al entrar, EventosProvider sube solo los eventos que estaban en este
      // navegador: acá no hay nada que hacer más que loguear.
      await loginWithCredential(credential);
    } catch (err) {
      setErrorLogin(err.message);
    }
  }

  return (
    <header className="masthead">
      <div className="wrap">
        <div className="top-row">
          <div className="kicker">Colegio San Gabriel · Ciclo lectivo 2026</div>
          <div className="top-actions">
            {user ? (
              <div className="cuenta">
                {user.avatarUrl && <img src={user.avatarUrl} alt="" width="24" height="24" />}
                {/* Al lado del ícono de usuario, no de "Salir": es una acción
                    sobre la cuenta, como el avatar y el nombre. */}
                <button
                  type="button"
                  className="share"
                  title="Compartir tus eventos"
                  aria-label="Compartir todos tus eventos"
                  onClick={abrirCompartirTodo}
                >
                  <IconoCompartir />
                </button>
                <span className="nombre">{user.name}</span>
                <button type="button" className="linkish" onClick={logout}>Salir</button>
              </div>
            ) : (
              // En celular el botón va en su versión de sólo ícono: el de
              // "Iniciar sesión con Google" entero no entra al lado del tema
              // sin empujar el ancho de la página.
              <GoogleLoginButton
                onCredential={onCredential}
                tipo={angosto ? 'icon' : 'standard'}
                tema="filled_black"
                tamano="medium"
              />
            )}
            <ThemeSwitch />
          </div>
        </div>

        {errorLogin && <p className="err top-err">{errorLogin}</p>}

        <h1>
          {enOficial ? 'Calendario oficial'
            : enUsuarios ? 'Cuentas'
            : enMetricas ? 'Métricas'
            : enCompartir ? 'Evento compartido'
            : enPersonales ? 'Eventos personales'
            : 'Agenda escolar'}
        </h1>

        {/* Ver la agenda / Eventos personales las ve cualquiera, con cuenta o
            sin ella: cargar eventos propios no pide login (ver CLAUDE.md,
            "Eventos personales: navegador o cuenta"). No se muestra en la
            página de un link compartido: a quien lo abre puede no conocer el
            resto de la agenda. La gestión del calendario y la lista de cuentas
            sí son sólo para quien administra — el candado real está en el
            server, esto es para no mostrar una pantalla que nadie más puede
            usar. */}
        {!enCompartir && (
          <nav className="nav">
            <Link to="/" className={enOficial || enUsuarios || enMetricas || enPersonales ? '' : 'on'}>Ver la agenda</Link>
            <Link to="/personales" className={enPersonales ? 'on' : ''}>Eventos Personales</Link>
            {user && user.isAdmin && (
              <>
                <Link to="/oficial" className={enOficial ? 'on' : ''}>Editar el calendario</Link>
                <Link to="/usuarios" className={enUsuarios ? 'on' : ''}>Cuentas</Link>
                <Link to="/metricas" className={enMetricas ? 'on' : ''}>Métricas</Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
