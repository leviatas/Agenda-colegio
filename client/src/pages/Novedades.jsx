import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import NovedadDialog from '../components/NovedadDialog';
import { api } from '../api';
import { MES_AB, parse } from '../lib/agenda';

// parse() y no new Date(iso): un 'YYYY-MM-DD' pelado lo parsea el navegador
// como UTC y la fecha se corre un día (ver CLAUDE.md).
function fecha(iso) {
  const d = parse(iso);
  return `${d.getDate()} ${MES_AB[d.getMonth()]}`;
}

// Administrar los avisos que ven las familias arriba del calendario. A
// diferencia de /oficial, la pantalla **abre con la lista** y el formulario
// vive en un modal (NovedadDialog.jsx) que se abre con "Agregar novedad +" o
// con el "Editar" de una fila: se entra acá muchas más veces a ver qué hay
// publicado que a cargar algo nuevo.
//
// Ojo con la diferencia entre el vencimiento y la X de cada familia: el
// vencimiento saca la novedad para TODO el mundo pase lo que pase, mientras que
// la X sólo la saca para quien la tocó (ver AvisoNovedad.jsx).
export default function Novedades() {
  const { user, token } = useAuth();
  const confirm = useConfirm();

  const [novedades, setNovedades] = useState([]);
  // "Hoy" según el server (Argentina), no según el reloj de esta máquina: es el
  // mismo día con el que se decide qué novedad está vigente.
  const [hoy, setHoy] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // null = el modal cerrado. Abierto lleva { novedad }, con la novedad que se
  // está editando o null si es un alta.
  const [editor, setEditor] = useState(null);

  const esAdmin = Boolean(user && user.isAdmin);

  useEffect(() => {
    if (!esAdmin) {
      setCargando(false);
      return undefined;
    }
    let vivo = true;
    api.novedades.admin
      .list(token)
      .then((data) => {
        if (!vivo) return;
        setNovedades(data.novedades);
        setHoy(data.hoy);
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

  const cerrarEditor = useCallback(() => setEditor(null), []);

  // La lista queda ordenada como la manda el server: primero la que empieza más
  // tarde, y a igual fecha la más nueva.
  const alGuardar = useCallback((novedad) => {
    setNovedades((lista) => [novedad, ...lista.filter((n) => n.id !== novedad.id)]
      .sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : b.id - a.id)));
  }, []);

  // El return temprano va DESPUÉS de todos los hooks (si no, la cantidad de
  // hooks cambia entre renders y React se rompe) y es UI, no seguridad: lo que
  // cierra esto es requireAdmin en routes/novedadesAdmin.js.
  if (!esAdmin) {
    return (
      <div className="wrap">
        <p className="empty-note">Esta pantalla es sólo para quien administra el calendario del colegio.</p>
      </div>
    );
  }

  async function borrar(n) {
    const ok = await confirm({
      title: 'Borrar la novedad',
      message: `¿Borrar "${n.titulo}"? La dejan de ver todas las familias, también quienes todavía no la habían cerrado.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api.novedades.admin.remove(token, n.id);
      setNovedades((lista) => lista.filter((x) => x.id !== n.id));
      // Si justo se estaba editando esa, el modal se queda sin sujeto.
      if (editor && editor.novedad && editor.novedad.id === n.id) cerrarEditor();
    } catch (err) {
      setError(err.message);
    }
  }

  const vigentes = novedades.filter((n) => n.vigente).length;

  return (
    <div className="wrap">
      <div className="sec-head">
        <h2>Novedades</h2>
        <span className="rule" />
        <span className="meta">{vigentes} vigente{vigentes === 1 ? '' : 's'}</span>
      </div>

      <div className="nov-barra">
        <button className="btn ghost" type="button" onClick={() => setEditor({ novedad: null })}>
          Agregar novedad +
        </button>
        <span className="meta">las vencidas quedan acá, no se borran solas</span>
      </div>

      {error && <p className="err banner">{error}</p>}
      {cargando && <p className="empty-note">Cargando…</p>}
      {!cargando && novedades.length === 0 && (
        <p className="empty-note">Todavía no hay ninguna novedad cargada.</p>
      )}

      <ul className="of-list nov-admin">
        {novedades.map((n) => (
          <li key={n.id} className={editor && editor.novedad && editor.novedad.id === n.id ? 'editando' : undefined}>
            <span className={`of-dot ${n.vigente ? 'ins' : 'vencida'}`} aria-hidden="true" />
            <span className="of-fecha">
              {fecha(n.desde)} al {fecha(n.hasta)}
              <em>{n.vigente ? 'vigente' : n.hasta < hoy ? 'vencida' : 'programada'}</em>
            </span>
            <span className="of-titulo">
              <b>{n.titulo}:</b> {n.texto}
              {/* Cuántas cuentas la cerraron: sirve para saber si se está
                  leyendo. Quiénes son no se muestra en ningún lado. */}
              <span className="of-tags">
                {n.cierres === 0 ? 'nadie la cerró todavía' : n.cierres === 1 ? '1 la cerró' : `${n.cierres} la cerraron`}
              </span>
            </span>
            <span className="of-acciones">
              <button type="button" className="edit" onClick={() => setEditor({ novedad: n })}>Editar</button>
              <button type="button" className="del" aria-label={`Borrar ${n.titulo}`} onClick={() => borrar(n)}>×</button>
            </span>
          </li>
        ))}
      </ul>

      <NovedadDialog
        open={Boolean(editor)}
        novedad={editor ? editor.novedad : null}
        hoy={hoy}
        onClose={cerrarEditor}
        onGuardada={alGuardar}
      />
    </div>
  );
}
