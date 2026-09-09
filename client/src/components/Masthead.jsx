import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeSwitch from './ThemeSwitch';
import GoogleLoginButton from './GoogleLoginButton';
import IconoCompartir from './IconoCompartir';
import IconoConfig from './IconoConfig';
import IconoInfo from './IconoInfo';
import ConfiguracionDialog from './ConfiguracionDialog';
import NovedadesDialog from './NovedadesDialog';
import { useCompartirTodo } from './CompartirTodoDialog';
import { useAuth } from '../context/AuthContext';
import { useNovedades } from '../context/NovedadesContext';
import { useAngosto } from '../lib/media';

function inicial(nombre) {
  const limpio = (nombre || '').trim();
  return limpio ? limpio.charAt(0).toUpperCase() : '?';
}

export default function Masthead() {
  const { user, loginWithCredential, logout } = useAuth();
  const { pathname } = useLocation();
  const angosto = useAngosto();
  const [errorLogin, setErrorLogin] = useState('');
  // Compartir TODOS los eventos (código + suscripciones) es aparte de
  // compartir uno solo: el modal es una única instancia compartida con
  // EventosPersonales.jsx (ver CompartirTodoDialog.jsx), acá sólo se abre.
  const abrirCompartirTodo = useCompartirTodo();

  // Menú del avatar: por ahora una sola opción (Config), pero es un menú de
  // verdad y no un atajo directo a ConfiguracionDialog porque acá es donde
  // va a ir lo próximo que se agregue sobre la cuenta.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [configAbierta, setConfiguracionAbierta] = useState(false);
  const menuRef = useRef(null);

  // La "i" de novedades: la ve cualquiera, con cuenta o sin ella, porque los
  // avisos son para todo el mundo. Sólo aparece si hay alguna vigente — un
  // botón que abre una lista vacía es ruido, y acá arriba el lugar es poco.
  const { novedades } = useNovedades();
  const [novedadesAbiertas, setNovedadesAbiertas] = useState(false);

  useEffect(() => {
    if (!menuAbierto) return undefined;
    // Cierra al tocar afuera o con Escape. mousedown y no click: así el click
    // que abrió el menú (en el propio botón) no llega a este listener antes
    // de que exista, y tocar afuera cierra antes de que ese click dispare
    // cualquier otra cosa debajo.
    function alTocarAfuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAbierto(false);
    }
    function alEscape(e) {
      if (e.key === 'Escape') setMenuAbierto(false);
    }
    document.addEventListener('mousedown', alTocarAfuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alTocarAfuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [menuAbierto]);

  const enOficial = pathname.startsWith('/oficial');
  const enUsuarios = pathname.startsWith('/usuarios');
  const enMetricas = pathname.startsWith('/metricas');
  const enNovedades = pathname.startsWith('/novedades');
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
            {novedades.length > 0 && (
              <button
                type="button"
                className="novedades-btn"
                title="Ver las novedades"
                aria-label={`Ver las novedades (${novedades.length})`}
                onClick={() => setNovedadesAbiertas(true)}
              >
                <IconoInfo />
              </button>
            )}
            {user ? (
              <div className="cuenta">
                <div className="avatar-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className="avatar-btn"
                    aria-haspopup="menu"
                    aria-expanded={menuAbierto}
                    aria-label={`Menú de ${user.name}`}
                    onClick={() => setMenuAbierto((v) => !v)}
                  >
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} alt="" width="24" height="24" />
                      : <span className="avatar-inicial" aria-hidden="true">{inicial(user.name)}</span>}
                  </button>
                  {menuAbierto && (
                    <div className="avatar-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuAbierto(false);
                          setConfiguracionAbierta(true);
                        }}
                      >
                        <IconoConfig />
                        Config
                      </button>
                    </div>
                  )}
                </div>
                {/* Al lado del avatar, no de "Salir": es una acción sobre la
                    cuenta, como el avatar y el nombre. */}
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
            : enNovedades ? 'Novedades'
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
            <Link to="/" className={enOficial || enUsuarios || enMetricas || enNovedades || enPersonales ? '' : 'on'}>Ver la agenda</Link>
            <Link to="/personales" className={enPersonales ? 'on' : ''}>Eventos Personales</Link>
            {user && user.isAdmin && (
              <>
                <Link to="/oficial" className={enOficial ? 'on' : ''}>Editar el calendario</Link>
                <Link to="/usuarios" className={enUsuarios ? 'on' : ''}>Cuentas</Link>
                <Link to="/metricas" className={enMetricas ? 'on' : ''}>Métricas</Link>
                <Link to="/novedades" className={enNovedades ? 'on' : ''}>Novedades</Link>
              </>
            )}
          </nav>
        )}
      </div>

      {user && <ConfiguracionDialog open={configAbierta} onClose={() => setConfiguracionAbierta(false)} />}
      <NovedadesDialog open={novedadesAbiertas} onClose={() => setNovedadesAbiertas(false)} />
    </header>
  );
}
