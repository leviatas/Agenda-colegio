import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { MES_AB } from '../lib/agenda';

// La fecha de un acceso es un instante con hora, así que `new Date` está
// bien acá — al revés que las fechas del calendario, que son String
// 'YYYY-MM-DD' y van por parse() de lib/agenda para no correrse un día por
// el huso (ver CLAUDE.md).
function fecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MES_AB[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Metricas() {
  const { user, token } = useAuth();

  const [datos, setDatos] = useState(null);
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
      .metricas(token)
      .then((data) => {
        if (!vivo) return;
        setDatos(data);
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
  // que cierra esto es requireAdmin en el server.
  if (!esAdmin) {
    return (
      <div className="wrap">
        <p className="empty-note">Esta pantalla es sólo para quien administra el calendario del colegio.</p>
      </div>
    );
  }

  const ips = datos ? datos.ips : [];

  return (
    <div className="wrap">
      <div className="sec-head">
        <h2>Accesos</h2>
        <span className="rule" />
        {datos && (
          <span className="meta">
            {datos.cuentas} {datos.cuentas === 1 ? 'cuenta se logueó' : 'cuentas distintas se loguearon'}
          </span>
        )}
      </div>

      <p className="empty-note mt-nota">
        Una fila por IP, la más reciente primero. Cuando alguna vez se vio una cuenta logueada desde
        esa IP aparece en la columna de al lado; una IP sin cuenta es alguien que sólo miró el
        calendario o cargó eventos propios sin entrar con Google. No es un padrón: la misma familia
        desde el celular y la compu son dos filas distintas, y cambiar de red vuelve a contar como
        una IP nueva.
      </p>

      {cargando && <p className="empty-note">Cargando…</p>}
      {error && <p className="err banner">{error}</p>}

      {!cargando && !error && ips.length === 0 && (
        <p className="empty-note">Todavía no hay accesos registrados.</p>
      )}

      {!cargando && ips.length > 0 && (
        <ul className="mt-list">
          <li className="mt-head" aria-hidden="true">
            <span>IP</span>
            <span>Usuario</span>
            <span>Visitas</span>
            <span>Último ingreso</span>
          </li>
          {ips.map((f) => (
            <li key={f.ip}>
              <span className="mt-ip">{f.ip}</span>
              <span className="mt-usuario">
                {f.usuarios.length === 0 ? (
                  <span className="muted">— sin cuenta —</span>
                ) : (
                  f.usuarios.map((u) => `${u.name} (${u.email})`).join(', ')
                )}
              </span>
              <span className="mt-visitas">{f.visitas}</span>
              <span className="mt-fecha">{fecha(f.ultimoIngreso)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
