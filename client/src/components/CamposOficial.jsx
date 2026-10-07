import { ANIOS, CAT, DESDE, GRADOS, GRUPOS, HASTA, NIVELES, SALAS, fmtHora } from '../lib/agenda';

// Los campos de un evento oficial, compartidos entre la pantalla /oficial
// (alta y edición en la tarjeta de arriba) y EditOficialDialog (editar directo
// desde "Próximas fechas"). Un solo formulario para que las dos puertas no
// terminen guardando cosas distintas.

export const VACIO_OFICIAL = {
  id: null, title: '', date: '', endDate: '', time: '', endTime: '', level: 'ins', groups: [],
};

// Qué tags tiene sentido marcar según el nivel. Un feriado o un evento
// institucional son de todo el colegio: no llevan tags, y por eso no se
// muestran (el server igual acepta la lista vacía).
export function tagsDeNivel(level) {
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

export function nombreTag(id) {
  const o = CAT[id];
  if (o) return o.c ? `Sala ${o.n}` : o.n;
  const grupo = GRUPOS.find((g) => g.k === id);
  if (grupo) return grupo.lbl;
  if (id === 'maternal') return 'Maternal';
  if (id === 'infantes') return 'Infantes';
  return id;
}

export function formularioOficial(ev) {
  return {
    id: ev.id,
    title: ev.title,
    date: ev.date,
    endDate: ev.endDate || '',
    // Tal cual está guardada ("8.10", "8 a 15"): el campo es de texto libre,
    // así que mostrarla en formato de <input type="time"> ("08:10") sólo
    // confundiría. fmtHora la deja igual al guardar.
    time: ev.time || '',
    endTime: ev.endTime || '',
    level: ev.level,
    groups: ev.groups || [],
  };
}

// Devuelve { error } o { data } listo para api.oficial.create/update.
export function datosOficial(form) {
  if (!form.title.trim()) return { error: 'Falta el título.' };
  if (!form.date) return { error: 'Falta la fecha.' };
  return {
    data: {
      title: form.title.trim(),
      date: form.date,
      endDate: form.endDate || null,
      time: fmtHora(form.time),
      endTime: fmtHora(form.endTime),
      level: form.level,
      groups: form.groups,
    },
  };
}

export default function CamposOficial({ form, setForm, idPrefix = 'of' }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const id = (s) => `${idPrefix}-${s}`;

  function cambiarNivel(e) {
    const level = e.target.value;
    // Los tags que ya no aplican al nivel nuevo se descartan: dejar un 'g3' en
    // un evento de secundaria lo haría invisible para todo el mundo.
    const validos = new Set(tagsDeNivel(level).map((t) => t.id));
    setForm((f) => ({ ...f, level, groups: f.groups.filter((g) => validos.has(g)) }));
  }

  function toggleTag(tag) {
    setForm((f) => ({
      ...f,
      groups: f.groups.includes(tag) ? f.groups.filter((g) => g !== tag) : [...f.groups, tag],
    }));
  }

  const tags = tagsDeNivel(form.level);

  return (
    <div className="campos-oficial">
      <div className="field">
        <label htmlFor={id('t')}>Título</label>
        <input id={id('t')} type="text" maxLength={90} value={form.title} onChange={set('title')} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={id('n')}>Nivel</label>
          <select id={id('n')} value={form.level} onChange={cambiarNivel}>
            {['ini', 'pri', 'sec', 'ins', 'fer'].map((l) => (
              <option key={l} value={l}>{NIVELES[l]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={id('d')}>Fecha</label>
          <input id={id('d')} type="date" min={DESDE} max={HASTA} value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor={id('e')}>Hasta <span className="hint">(opcional)</span></label>
          <input id={id('e')} type="date" min={form.date || DESDE} max={HASTA} value={form.endDate} onChange={set('endDate')} />
        </div>
        <div className="field">
          {/* Texto libre y no <input type="time">: el calendario del colegio
              tiene horarios como "8 a 15" que el input nativo no acepta. */}
          <label htmlFor={id('h')}>Hora <span className="hint">(8.15, 8 a 15…)</span></label>
          <input id={id('h')} type="text" maxLength={20} value={form.time} onChange={set('time')} />
        </div>
        <div className="field">
          {/* Independiente de "Hasta": un acto puede ser de 8.15 a 12.30 el
              mismo día. Sin hora de inicio el server la rechaza. */}
          <label htmlFor={id('hh')}>Hora hasta <span className="hint">(opcional)</span></label>
          <input id={id('hh')} type="text" maxLength={20} value={form.endTime} onChange={set('endTime')} />
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
    </div>
  );
}
