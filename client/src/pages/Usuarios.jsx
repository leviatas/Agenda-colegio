import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { MES_AB } from '../lib/agenda';

// La fecha de alta sí es un instante con hora, así que `new Date` está bien
// acá — al revés que las fechas del calendario, que son String 'YYYY-MM-DD' y
// van por parse() de lib/agenda para no correrse un día por el huso.
function alta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MES_AB[d.getMonth()]} ${d.getFullYear()}`;
}

function inicial(nombre) {
  const limpio = (nombre || '').trim();
  return limpio ? limpio.charAt(0).toUpperCase() : '?';
}

export default function Usuarios() {
  const { user, token } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const esAdmin = Boolean(user && user.isAdmin);

  useEffect(() => {
    if (!esAdmin) {
      setCargando(false);
      return undefined;
    }
    let vivo = true;
    setCargando(true);
    api
      .usuarios(token)
      .then((data) => {
        if (!vivo) return;
        setUsuarios(data.usuarios);
        setError('');
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
  }, [esAdmin, token]);

  // El return temprano va DESPUÉS de todos los hooks: si va antes, la cantidad
  // de hooks cambia entre renders y React se rompe. Y es UI, no seguridad: lo
  // que cierra la lista es requireAdmin en el server.
  if (!esAdmin) {
    return (
      <div className="wrap">
        <p className="empty-note">Esta pantalla es sólo para quien administra el calendario del colegio.</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="sec-head">
        {/* El h1 del masthead ya dice "Cuentas": acá conviene el subtítulo. */}
        <h2>Entraron con Google</h2>
        <span className="rule" />
        <span className="meta">
          {usuarios.length} {usuarios.length === 1 ? 'cuenta' : 'cuentas'}
        </span>
      </div>

      <p className="empty-note us-nota">
        Cualquiera puede ver el calendario y cargar sus eventos sin cuenta: acá aparece quien
        además entró con Google, que es lo que hace que sus eventos y sus filtros lo sigan de un
        dispositivo a otro. No hay nada que aprobar. Los eventos de cada familia son privados y no
        se ven desde acá.
      </p>

      {cargando && <p className="empty-note">Cargando las cuentas…</p>}
      {error && <p className="err banner">{error}</p>}

      {!cargando && !error && usuarios.length === 0 && (
        <p className="empty-note">Todavía no entró nadie con Google.</p>
      )}

      {!cargando && usuarios.length > 0 && (
        <ul className="us-list">
          {usuarios.map((u) => (
            <li key={u.id}>
              {u.avatarUrl ? (
                <img className="us-foto" src={u.avatarUrl} alt="" width="34" height="34" />
              ) : (
                <span className="us-foto us-inicial" aria-hidden="true">{inicial(u.name)}</span>
              )}
              <span className="us-nombre">
                {u.name}
                {u.isAdmin && <span className="us-badge">Admin</span>}
              </span>
              <span className="us-mail">{u.email}</span>
              <span className="us-alta">desde el {alta(u.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
