import { DIAS, MES_AB, isoDow, parse, textoHora } from '../lib/agenda';

// Las próximas ocho fechas que quedan por delante con los filtros activos.
export default function Upcoming({ eventos, visible, today, onEventoClick }) {
  const seen = new Set();
  const lista = eventos
    .filter((ev) => {
      if (!visible(ev)) return false;
      // Un tramo sigue "por delante" hasta que termina, no hasta que empieza.
      if (parse(ev.endDate || ev.date) < today) return false;
      // El mismo acto puede estar cargado dos veces (un evento por turno, por
      // ejemplo); en la tira de próximas fechas alcanza con mostrarlo una vez.
      const k = `${ev.date}|${ev.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => parse(a.date) - parse(b.date))
    .slice(0, 8);

  if (!lista.length) {
    return (
      <div className="up-row">
        <p className="empty-note">No queda nada por delante con los filtros activos.</p>
      </div>
    );
  }

  return (
    <div className="up-row">
      {lista.map((ev) => {
        const s = parse(ev.date);
        const en = parse(ev.endDate || ev.date);
        const cuando = ev.endDate
          ? `${s.getDate()} al ${en.getDate()} ${MES_AB[en.getMonth()]}`
          : `${s.getDate()} ${MES_AB[s.getMonth()]}`;
        const diff = Math.round((s - today) / 86400000);
        const cd = diff > 1 ? `faltan ${diff} días`
          : diff === 1 ? 'mañana'
          : diff === 0 ? 'es hoy'
          : 'en curso';

        // El feriado se pinta entero de rojo, como la celda del calendario: es
        // el dato que hay que ver de lejos y con el borde de color del resto
        // quedaba igual que cualquier otra fecha. El cartelito va además del
        // color, que solo no alcanza para quien no lo distingue.
        const esFeriado = ev.level === 'fer';
        // Mismo criterio que en Month.jsx: sólo lo propio se puede tocar para
        // editar, compartir o borrar. Oficiales y compartidos quedan como antes.
        const esPropio = ev.level === 'per' && !ev.de;
        const Tag = esPropio ? 'button' : 'div';

        return (
          <Tag
            key={`${ev.level}-${ev.id}`}
            type={esPropio ? 'button' : undefined}
            className={`up-card${esFeriado ? ' feriado' : ''}${esPropio ? ' clickable' : ''}`}
            style={{ '--c': `var(--${ev.level})` }}
            onClick={esPropio ? () => onEventoClick(ev) : undefined}
            aria-label={esPropio ? `Opciones de "${ev.title}"` : undefined}
          >
            <span className="dt">{cuando}</span>
            <span className="cd">{DIAS[isoDow(s)]} · {cd}</span>
            {esFeriado && <span className="marca">Feriado</span>}
            <span className="tt">
              {ev.time && <><b>{textoHora(ev)}hs</b>{' · '}</>}
              {ev.title}
              {ev.de && <span className="de"> · {ev.de}</span>}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
