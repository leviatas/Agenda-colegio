import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { api } from '../api';
import { MES_AB, parse } from '../lib/agenda';

const VACIO = { id: null, titulo: 'Novedad', texto: '', desde: '', hasta: '' };

const MAX_TITULO = 60;
const MAX_TEXTO = 300;

// parse() y no new Date(iso): un 'YYYY-MM-DD' pelado lo parsea el navegador
// como UTC y la fecha se corre un día (ver CLAUDE.md).
function fecha(iso) {
  const d = parse(iso);
  return `${d.getDate()} ${MES_AB[d.getMonth()]}`;
}

// `dias` días después de `iso`, en el mismo formato. Sólo se usa para proponer
// un vencimiento por default en el formulario; el corte real lo hace el server
// con su propia fecha (lib/fechas.js).
function masDias(iso, dias) {
  const d = parse(iso);
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Administrar los avisos que ven las familias arriba del calendario. Misma
// forma que /oficial: un formulario arriba (que sirve para cargar y para
// editar) y la lista abajo.
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
  const [form, setForm] = useState(VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const esAdmin = Boolean(user && user.isAdmin);
  const editando = form.id !== null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
        // Una novedad nueva arranca vigente hoy y con un mes de vida: es lo que
        // se quiere casi siempre, y las dos fechas se pueden cambiar. No pisa
        // lo que ya se haya empezado a escribir.
        setForm((f) => (f.desde ? f : { ...f, desde: data.hoy, hasta: masDias(data.hoy, 30) }));
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

  function limpiar() {
    setForm({ ...VACIO, desde: hoy, hasta: hoy ? masDias(hoy, 30) : '' });
  }

  // La lista queda ordenada como la manda el server: primero la que empieza más
  // tarde, y a igual fecha la más nueva.
  function ordenar(lista) {
    return [...lista].sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : b.id - a.id));
  }

  async function guardar() {
    setError('');
    if (!form.titulo.trim()) return setError('Falta el título.');
    if (!form.texto.trim()) return setError('Falta el texto de la novedad.');
    if (!form.desde) return setError('Falta la fecha de inicio.');
    if (!form.hasta) return setError('Falta la fecha de vencimiento.');

    const data = {
      titulo: form.titulo.trim(),
      texto: form.texto.trim(),
      desde: form.desde,
      hasta: form.hasta,
    };

    setGuardando(true);
    try {
      const res = editando
        ? await api.novedades.admin.update(token, form.id, data)
        : await api.novedades.admin.create(token, data);
      setNovedades((lista) => ordenar([res.novedad, ...lista.filter((n) => n.id !== res.novedad.id)]));
      limpiar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
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
      if (form.id === n.id) limpiar();
    } catch (err) {
      setError(err.message);
    }
  }

  function editar(n) {
    setError('');
    setForm({ id: n.id, titulo: n.titulo, texto: n.texto, desde: n.desde, hasta: n.hasta });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const vigentes = novedades.filter((n) => n.vigente).length;

  return (
    <div className="wrap">
      <div className="sec-head">
        <h2>{editando ? 'Editar la novedad' : 'Nueva novedad'}</h2>
        <span className="rule" />
        <span className="meta">{vigentes} vigente{vigentes === 1 ? '' : 's'}</span>
      </div>

      <div className="card-form">
        <div className="field-row">
          <div className="field">
            {/* Es un prefijo corto, no una oración: se lee pegado al texto
                ("Novedad: ahora podés…"). */}
            <label htmlFor="nv-t">Título <span className="hint">(Novedad, Aviso…)</span></label>
            <input id="nv-t" type="text" maxLength={MAX_TITULO} value={form.titulo} onChange={set('titulo')} />
          </div>
          <div className="field">
            <label htmlFor="nv-d">Desde</label>
            <input id="nv-d" type="date" value={form.desde} onChange={set('desde')} />
          </div>
          <div className="field">
            {/* Este es el corte que no depende de nadie: pasada esta fecha la
                novedad no aparece más, la haya cerrado la familia o no. */}
            <label htmlFor="nv-h">Vence</label>
            <input id="nv-h" type="date" min={form.desde || undefined} value={form.hasta} onChange={set('hasta')} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="nv-x">Texto</label>
          <textarea id="nv-x" rows={3} maxLength={MAX_TEXTO} value={form.texto} onChange={set('texto')} />
          <span className="hint contador">{form.texto.length}/{MAX_TEXTO}</span>
        </div>

        {error && <p className="err">{error}</p>}

        <div className="form-actions">
          {editando && (
            <button className="mbtn" type="button" onClick={limpiar}>Cancelar</button>
          )}
          <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Publicar la novedad'}
          </button>
        </div>
      </div>

      <div className="sec-head">
        <h2>Todas las novedades</h2>
        <span className="rule" />
        <span className="meta">las vencidas quedan acá, no se borran solas</span>
      </div>

      {cargando && <p className="empty-note">Cargando…</p>}
      {!cargando && novedades.length === 0 && (
        <p className="empty-note">Todavía no hay ninguna novedad cargada.</p>
      )}

      <ul className="of-list nov-admin">
        {novedades.map((n) => (
          <li key={n.id} className={form.id === n.id ? 'editando' : undefined}>
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
              <button type="button" className="edit" onClick={() => editar(n)}>Editar</button>
              <button type="button" className="del" aria-label={`Borrar ${n.titulo}`} onClick={() => borrar(n)}>×</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
