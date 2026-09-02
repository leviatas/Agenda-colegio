import { Link, useLocation } from 'react-router-dom';
import ThemeSwitch from './ThemeSwitch';
import { useAuth } from '../context/AuthContext';

export default function Masthead() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const enOficial = pathname.startsWith('/oficial');
  const enUsuarios = pathname.startsWith('/usuarios');

  return (
    <header className="masthead">
      <div className="wrap">
        <div className="top-row">
          <div className="kicker">Colegio San Gabriel · Ciclo lectivo 2026</div>
          <div className="top-actions">
            {user && (
              <div className="cuenta">
                {user.avatarUrl && <img src={user.avatarUrl} alt="" width="24" height="24" />}
                <span className="nombre">{user.name}</span>
                <button type="button" className="linkish" onClick={logout}>Salir</button>
              </div>
            )}
            <ThemeSwitch />
          </div>
        </div>

        <h1>{enOficial ? 'Calendario oficial' : enUsuarios ? 'Cuentas' : 'Agenda escolar'}</h1>

        {/* La gestión del calendario sólo aparece para quien lo administra. El
            candado real está en el server; esto es para no mostrar una pantalla
            que nadie más puede usar. */}
        {user && user.isAdmin && (
          <nav className="nav">
            <Link to="/" className={enOficial || enUsuarios ? '' : 'on'}>Ver la agenda</Link>
            <Link to="/oficial" className={enOficial ? 'on' : ''}>Editar el calendario</Link>
            <Link to="/usuarios" className={enUsuarios ? 'on' : ''}>Cuentas</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
