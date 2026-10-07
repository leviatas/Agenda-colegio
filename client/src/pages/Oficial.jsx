import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from '../components/ConfirmDialog';
import { api } from '../api';
import CamposOficial, {
  VACIO_OFICIAL as VACIO, datosOficial, formularioOficial, nombreTag,
} from '../components/CamposOficial';
import { MESES, MES_AB, parse, textoHora } from '../lib/agenda';

export default function Oficial() {
  const { user, token } = useAuth();
  const { oficiales, reemplazarOficial, quitarOficial } = useEventos();
  const confirm = useConfirm();

  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const editando = form.id !== null;

  const listados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = q
      ? oficiales.filter((e) => e.title.toLowerCase().includes(q) || e.date.includes(q))
      : oficiales;

    // Agrupados por mes para que la lista de 150+ eventos se pueda recorrer.
    const grupos = new Map();
    [...filtrados]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
      .forEach((e) => {
        const mes = e.date.slice(0, 7);
        if (!grupos.has(mes)) grupos.set(mes, []);
        grupos.get(mes).push(e);
      });
    return [...grupos.entries()];
  }, [oficiales, busqueda]);

  // Va DESPUÉS de todos los hooks: un return temprano arriba los saltearía y
  // React se rompe si la cantidad de hooks cambia entre renders.
  //
  // Este gate es UI, no seguridad: el server ya rechaza con 403 cualquier
  // escritura de quien no está en ADMIN_EMAILS (requireAdmin en routes/oficial).
  if (!user || !user.isAdmin) {
    return (
      <div className="wrap">
        <p className="empty-note">Esta pantalla es sólo para quien administra el calendario del colegio.</p>
      </div>
    );
  }

  async function guardar() {
    setError('');
    const { error: invalido, data } = datosOficial(form);
    if (invalido) return setError(invalido);

    setGuardando(true);
    try {
      const res = editando
        ? await api.oficial.update(token, form.id, data)
        : await api.oficial.create(token, data);
      reemplazarOficial(res.evento);
      setForm(VACIO);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(ev) {
    const ok = await confirm({
      title: 'Borrar del calendario oficial',
      message: `¿Borrar "${ev.title}" del ${ev.date}? Lo dejan de ver todas las familias.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api.oficial.remove(token, ev.id);
      quitarOficial(ev.id);
      if (form.id === ev.id) setForm(VACIO);
    } catch (err) {
      setError(err.message);
    }
  }

  function editar(ev) {
    setError('');
    setForm(formularioOficial(ev));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="wrap">
      <div className="sec-head">
        <h2>{editando ? 'Editar evento oficial' : 'Nuevo evento oficial'}</h2>
        <span className="rule" />
        <span className="meta">{oficiales.length} en el calendario</span>
      </div>

      <div className="card-form">
        <CamposOficial form={form} setForm={setForm} />

        {error && <p className="err">{error}</p>}

        <div className="form-actions">
          {editando && (
            <button className="mbtn" type="button" onClick={() => setForm(VACIO)}>Cancelar</button>
          )}
          <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar al calendario'}
          </button>
        </div>
      </div>

      <div className="sec-head">
        <h2>Calendario oficial</h2>
        <span className="rule" />
      </div>

      <div className="field buscador">
        <label htmlFor="of-q">Buscar</label>
        <input
          id="of-q"
          type="search"
          placeholder="título o fecha (2026-10)"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {listados.length === 0 && <p className="empty-note">No hay eventos que coincidan.</p>}

      {listados.map(([mes, eventos]) => (
        <section key={mes} className="of-mes">
          <h3>{MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</h3>
          <ul className="of-list">
            {eventos.map((ev) => {
              const s = parse(ev.date);
              const en = ev.endDate ? parse(ev.endDate) : null;
              return (
                <li key={ev.id} className={form.id === ev.id ? 'editando' : undefined}>
                  <span className={`of-dot ${ev.level}`} aria-hidden="true" />
                  <span className="of-fecha">
                    {s.getDate()} {MES_AB[s.getMonth()]}
                    {en && ` al ${en.getDate()} ${MES_AB[en.getMonth()]}`}
                    {ev.time && <em>{textoHora(ev)}hs</em>}
                  </span>
                  <span className="of-titulo">
                    {ev.title}
                    {ev.groups.length > 0 && (
                      <span className="of-tags">{ev.groups.map(nombreTag).join(' · ')}</span>
                    )}
                  </span>
                  <span className="of-acciones">
                    <button type="button" className="edit" onClick={() => editar(ev)}>Editar</button>
                    <button type="button" className="del" aria-label={`Borrar ${ev.title}`} onClick={() => borrar(ev)}>×</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
