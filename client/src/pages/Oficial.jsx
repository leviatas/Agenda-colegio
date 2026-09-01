import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from '../components/ConfirmDialog';
import { api } from '../api';
import {
  ANIOS, CAT, DESDE, GRADOS, GRUPOS, HASTA, MESES, MES_AB, NIVELES, SALAS,
  fmtHora, parse,
} from '../lib/agenda';

const VACIO = { id: null, title: '', date: '', endDate: '', time: '', level: 'ins', groups: [] };

// Qué tags tiene sentido marcar según el nivel. Un feriado o un evento
// institucional son de todo el colegio: no llevan tags, y por eso no se
// muestran (el server igual acepta la lista vacía).
function tagsDeNivel(level) {
  if (level === 'ini') {
    return [
      ...GRUPOS.map((g) => ({ id: g.k, n: g.lbl })),
      ...SALAS.map((s) => ({ id: s.id, n: `Sala ${s.n}`, c: s.c })),
      { id: 'maternal', n: 'Todo maternal' },
      { id: 'infantes', n: 'Todo infantes' },
    ];
  }
  if (level === 'pri') return GRADOS;
  if (level === 'sec') return ANIOS;
  return [];
}

function nombreTag(id) {
  const o = CAT[id];
  if (o) return o.c ? `Sala ${o.n}` : o.n;
  const grupo = GRUPOS.find((g) => g.k === id);
  if (grupo) return grupo.lbl;
  if (id === 'maternal') return 'Maternal';
  if (id === 'infantes') return 'Infantes';
  return id;
}

export default function Oficial() {
  const { user, token } = useAuth();
  const { oficiales, reemplazarOficial, quitarOficial } = useEventos();
  const confirm = useConfirm();

  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const editando = form.id !== null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

  function cambiarNivel(e) {
    const level = e.target.value;
    // Los tags que ya no aplican al nivel nuevo se descartan: dejar un 'g3' en
    // un evento de secundaria lo haría invisible para todo el mundo.
    const validos = new Set(tagsDeNivel(level).map((t) => t.id));
    setForm((f) => ({ ...f, level, groups: f.groups.filter((g) => validos.has(g)) }));
  }

  function toggleTag(id) {
    setForm((f) => ({
      ...f,
      groups: f.groups.includes(id) ? f.groups.filter((g) => g !== id) : [...f.groups, id],
    }));
  }

  async function guardar() {
    setError('');
    if (!form.title.trim()) return setError('Falta el título.');
    if (!form.date) return setError('Falta la fecha.');

    const data = {
      title: form.title.trim(),
      date: form.date,
      endDate: form.endDate || null,
      time: fmtHora(form.time),
      level: form.level,
      groups: form.groups,
    };

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
    setForm({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      endDate: ev.endDate || '',
      // Tal cual está guardada ("8.10", "8 a 15"): el campo es de texto libre,
      // así que mostrarla en formato de <input type="time"> ("08:10") sólo
      // confundiría. fmtHora la deja igual al guardar.
      time: ev.time || '',
      level: ev.level,
      groups: ev.groups,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const tags = tagsDeNivel(form.level);

  return (
    <div className="wrap">
      <div className="sec-head">
        <h2>{editando ? 'Editar evento oficial' : 'Nuevo evento oficial'}</h2>
        <span className="rule" />
        <span className="meta">{oficiales.length} en el calendario</span>
      </div>

      <div className="card-form">
        <div className="field">
          <label htmlFor="of-t">Título</label>
          <input id="of-t" type="text" maxLength={90} value={form.title} onChange={set('title')} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="of-n">Nivel</label>
            <select id="of-n" value={form.level} onChange={cambiarNivel}>
              {['ini', 'pri', 'sec', 'ins', 'fer'].map((l) => (
                <option key={l} value={l}>{NIVELES[l]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="of-d">Fecha</label>
            <input id="of-d" type="date" min={DESDE} max={HASTA} value={form.date} onChange={set('date')} />
          </div>
          <div className="field">
            <label htmlFor="of-e">Hasta <span className="hint">(opcional)</span></label>
            <input id="of-e" type="date" min={form.date || DESDE} max={HASTA} value={form.endDate} onChange={set('endDate')} />
          </div>
          <div className="field">
            {/* Texto libre y no <input type="time">: el calendario del colegio
                tiene horarios como "8 a 15" que el input nativo no acepta. */}
            <label htmlFor="of-h">Hora <span className="hint">(8.15, 8 a 15…)</span></label>
            <input id="of-h" type="text" maxLength={20} value={form.time} onChange={set('time')} />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="field">
            <label>
              A quiénes les toca <span className="hint">(sin marcar nada: a todo el nivel)</span>
            </label>
            {/* --lv es lo que pinta el estado "elegido" de .opt, y en el CSS de
                origen sólo lo definen los .grp del picker. Acá se setea con el
                color del nivel elegido, así los tags se ven del mismo color que
                los eventos que van a filtrar. */}
            <div className="opts" style={{ '--lv': `var(--${form.level})` }}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="opt"
                  aria-pressed={form.groups.includes(t.id)}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.c && <span className="sw" style={{ background: t.c }} />}
                  {t.n}
                </button>
              ))}
            </div>
          </div>
        )}

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
                    {ev.time && <em>{ev.time}hs</em>}
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
