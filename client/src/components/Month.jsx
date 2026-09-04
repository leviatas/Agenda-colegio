import { useMemo } from 'react';
import { MESES, MES_AB, DIAS_AB, addDays, isoDow, key, parse, textoHora } from '../lib/agenda';

// Un mes: la grilla de celdas a la izquierda y la agenda de días con eventos a
// la derecha. `esPrimero` hace que el mes de arranque absorba los días de la
// semana anterior que caen en el mes previo (no dibujado), para que no queden
// eventos sin ninguna fila donde mostrarse.
export default function Month({ year, mon, byDay, visible, todayKey, esPrimero, onDayClick, onEventoClick, flash }) {
  const { celdas, filas, cuenta } = useMemo(() => {
    const first = new Date(year, mon, 1);
    const dias = new Date(year, mon + 1, 0).getDate();
    const lead = isoDow(first);
    const trail = (7 - ((lead + dias) % 7)) % 7;

    const celdas = [];
    const push = (dt, out) => {
      const kk = key(dt);
      const occs = (byDay[kk] || []).filter((o) => visible(o.ev));
      celdas.push({
        kk,
        dia: dt.getDate(),
        mesNombre: MESES[dt.getMonth()],
        out,
        hoy: kk === todayKey,
        // El feriado se pinta sólo si además queda algo visible: si los filtros
        // apagaron todo, la celda no tiene por qué destacarse.
        feriado: (byDay[kk] || []).some((o) => o.ev.level === 'fer') && occs.length > 0,
        niveles: [...new Set(occs.map((o) => o.ev.level))],
        tiene: occs.length > 0,
      });
    };

    for (let i = lead; i > 0; i--) push(addDays(first, -i), true);
    for (let d = 1; d <= dias; d++) push(new Date(year, mon, d), false);
    const last = new Date(year, mon, dias);
    for (let j = 1; j <= trail; j++) push(addDays(last, j), true);

    const filas = [];
    const uniq = new Set();
    let desde = new Date(year, mon, 1);
    if (esPrimero) desde = addDays(desde, -isoDow(desde));
    const hasta = new Date(year, mon, dias);

    for (let dt = new Date(desde); dt <= hasta; dt = addDays(dt, 1)) {
      const kk = key(dt);
      const occs = (byDay[kk] || []).filter((o) => visible(o.ev));
      if (!occs.length) continue;
      occs.forEach((o) => uniq.add(`${o.ev.level}-${o.ev.id}`));
      filas.push({
        kk,
        dia: dt.getDate(),
        dow: DIAS_AB[isoDow(dt)],
        otroMes: dt.getMonth() !== mon ? MES_AB[dt.getMonth()] : null,
        hoy: kk === todayKey,
        feriado: (byDay[kk] || []).some((o) => o.ev.level === 'fer'),
        occs,
      });
    }

    return { celdas, filas, cuenta: uniq.size };
  }, [year, mon, byDay, visible, todayKey, esPrimero]);

  return (
    <section className="month">
      <div className="month-title">
        <h2>{MESES[mon].charAt(0).toUpperCase() + MESES[mon].slice(1)}</h2>
        <span className="count">{cuenta} {cuenta === 1 ? 'actividad' : 'actividades'}</span>
      </div>

      <div className="month-body">
        <div className="cal">
          <div className="dow">
            {DIAS_AB.map((d) => (
              <span key={d}>{d.charAt(0).toUpperCase()}</span>
            ))}
          </div>
          <div className="grid">
            {celdas.map((c, i) => (
              <button
                key={`${c.kk}-${i}`}
                type="button"
                className={`cell${c.out ? ' out' : ''}${c.hoy ? ' today' : ''}${c.tiene ? ' has' : ''}${c.feriado ? ' feriado' : ''}`}
                aria-label={`${c.dia} de ${c.mesNombre}`}
                onClick={() => onDayClick(c.kk)}
              >
                <span className="num">{c.dia}</span>
                <span className="pips">
                  {c.niveles.map((l) => (
                    <span key={l} className={`pip ${l}`} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="agenda">
          {filas.length === 0 && <p className="empty-note">Nada en este mes con los filtros activos.</p>}
          {filas.map((f) => (
            <div
              key={f.kk}
              id={`d-${f.kk}`}
              className={`day-row${f.feriado ? ' is-feriado' : ''}${f.hoy ? ' is-today' : ''}${flash === f.kk ? ' flash' : ''}`}
            >
              <div className="day-key">
                <span className="d">{f.dia}</span>
                <span className="w">{f.dow}{f.otroMes ? ` ${f.otroMes}` : ''}</span>
              </div>
              <div className="ev-list">
                {f.occs.map((o) => (
                  <Evento key={`${o.ev.level}-${o.ev.id}-${o.idx}`} occ={o} onEventoClick={onEventoClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Evento({ occ, onEventoClick }) {
  const { ev } = occ;
  let range = '';
  if (occ.span) {
    const s = parse(ev.date);
    const en = parse(ev.endDate);
    range = occ.first
      ? `${s.getDate()} al ${en.getDate()} ${MES_AB[en.getMonth()]}`
      : `día ${occ.idx + 1} de ${occ.total}`;
  }

  // Sólo se puede editar/compartir/borrar lo propio: un oficial no es tuyo, y
  // uno compartido (trae `de`) es de sólo lectura para quien lo ve por
  // suscripción.
  const esPropio = ev.level === 'per' && !ev.de;
  // <button> y no un div con onClick: todo lo clickeable de la app ya es un
  // botón real (las celdas del calendario, acá arriba), por teclado y lector
  // de pantalla de una. Lo que no es propio sigue siendo un div sin más.
  const Tag = esPropio ? 'button' : 'div';

  return (
    <Tag
      type={esPropio ? 'button' : undefined}
      className={`ev ${ev.level}${occ.span ? ' span' : ''}${esPropio ? ' clickable' : ''}`}
      onClick={esPropio ? () => onEventoClick(ev) : undefined}
      aria-label={esPropio ? `Opciones de "${ev.title}"` : undefined}
    >
      <span className="dot" />
      <span className="h">{ev.time ? `${textoHora(ev)}hs` : ''}</span>
      <span className="t" data-range={range || undefined}>
        {ev.title}
        {/* Sólo los eventos que llegan por una suscripción traen `de`: son los
            únicos que se mezclan con el nivel 'per' de otra cuenta, así que
            hace falta decir de quién son. Los propios no llevan nada acá. */}
        {ev.de && <span className="de"> · {ev.de}</span>}
      </span>
    </Tag>
  );
}
