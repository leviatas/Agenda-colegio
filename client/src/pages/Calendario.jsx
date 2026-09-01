import { useCallback, useMemo, useRef, useState } from 'react';
import Legend from '../components/Legend';
import Month from '../components/Month';
import Upcoming from '../components/Upcoming';
import PickerDialog from '../components/PickerDialog';
import AdderDialog from '../components/AdderDialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { CAT, DIAS, MESES, MONTHS, hoy, isoDow, key, matcher, ordenarPicks } from '../lib/agenda';

export default function Calendario() {
  const { picks, setPicks } = useAuth();
  const { todos, byDay, loading, error } = useEventos();

  const [picker, setPicker] = useState(false);
  const [adder, setAdder] = useState(false);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  // hoy() lee el reloj: se calcula una vez por montaje y no en cada render,
  // para que todas las comparaciones de la pantalla usen la misma fecha.
  const today = useMemo(hoy, []);
  const todayKey = useMemo(() => key(today), [today]);

  const visible = useMemo(() => matcher(picks), [picks]);

  // Click en una celda del calendario: lleva a la fila del día en la agenda y
  // la resalta un momento. El flash se limpia solo para que volver a tocar el
  // mismo día lo vuelva a disparar.
  const onDayClick = useCallback((kk) => {
    const row = document.getElementById(`d-${kk}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(flashTimer.current);
    setFlash(null);
    requestAnimationFrame(() => setFlash(kk));
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, []);

  const guardarPicks = useCallback((lista) => {
    setPicks(ordenarPicks(lista));
    setPicker(false);
  }, [setPicks]);

  return (
    <>
      <div className="wrap">
        <div className="picker-bar">
          <div className="picker-sum">
            <span className="lbl">Viendo</span>
            {picks.length === 0 ? (
              <span className="none">todo</span>
            ) : (
              picks.map((id) => {
                const o = CAT[id];
                if (!o) return null;
                return (
                  <span key={id} className="tag">
                    {o.c && <span className="sw" style={{ background: o.c }} />}
                    {o.c ? `Sala ${o.n}` : o.n}
                  </span>
                );
              })
            )}
          </div>
          <button className="btn" type="button" onClick={() => setPicker(true)}>
            {picks.length ? 'Cambiar' : 'Elegir sala y grado'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setAdder(true)}>
            Agregar evento +
          </button>
        </div>
      </div>

      <div className="wrap">
        {error && <p className="err banner">{error}</p>}
        {loading && <p className="empty-note">Cargando el calendario…</p>}

        {!loading && (
          <>
            <Legend eventos={todos} visible={visible} />

            <section className="upcoming">
              <div className="sec-head">
                <h2>Próximas fechas</h2>
                <span className="rule" />
                <span className="meta">
                  hoy es {DIAS[isoDow(today)]} {today.getDate()} de {MESES[today.getMonth()]}
                </span>
              </div>
              <Upcoming eventos={todos} visible={visible} today={today} />
            </section>

            <div>
              {MONTHS.map(([year, mon], i) => (
                <Month
                  key={`${year}-${mon}`}
                  year={year}
                  mon={mon}
                  byDay={byDay}
                  visible={visible}
                  todayKey={todayKey}
                  esPrimero={i === 0}
                  onDayClick={onDayClick}
                  flash={flash}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <PickerDialog open={picker} picks={picks} onClose={() => setPicker(false)} onSave={guardarPicks} />
      <AdderDialog open={adder} onClose={() => setAdder(false)} />
    </>
  );
}
