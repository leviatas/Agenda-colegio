import { useCallback, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Legend from '../components/Legend';
import Month from '../components/Month';
import Upcoming from '../components/Upcoming';
import PickerDialog from '../components/PickerDialog';
import AdderDialog from '../components/AdderDialog';
import EventoMenu from '../components/EventoMenu';
import EventosPersonales from '../components/EventosPersonales';
import EditEventDialog from '../components/EditEventDialog';
import EditOficialDialog from '../components/EditOficialDialog';
import AvisoNovedad from '../components/AvisoNovedad';
import { useCompartirTodo } from '../components/CompartirTodoDialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { CAT, DIAS, MESES, MONTHS, hoy, isoDow, key, matcher, ordenarPicks } from '../lib/agenda';

export default function Calendario() {
  const { user, picks, setPicks } = useAuth();
  const { todos, byDay, loading, error } = useEventos();

  // "Eventos Personales" (Masthead.jsx) es la misma pantalla, no una lista
  // aparte: sólo cambia el filtro de qué se ve y qué barra de arriba se
  // muestra. /personales existe como ruta (en vez de un simple toggle local)
  // para que el link y el botón de "atrás" del navegador funcionen.
  const { pathname } = useLocation();
  const soloPersonales = pathname.startsWith('/personales');
  // "Compartir todos mis eventos" es una acción sobre la cuenta, no sobre un
  // evento puntual: mismo modal (una única instancia) que el ícono al lado
  // de la cuenta en Masthead.jsx.
  const abrirCompartirTodo = useCompartirTodo();

  const [picker, setPicker] = useState(false);
  // "Agregar evento +" abre AdderDialog, que sólo carga eventos nuevos.
  const [adder, setAdder] = useState(false);
  // El evento propio sobre el que se hizo click en el calendario o en
  // "Próximas fechas": primero abre EventoMenu (Editar/Compartir/Eliminar);
  // "Editar" ahí adentro cierra ese menú y recién abre EditEventDialog sobre
  // el mismo evento. Los tres modales son independientes entre sí.
  const [eventoMenu, setEventoMenu] = useState(null);
  const [eventoEditar, setEventoEditar] = useState(null);
  // El admin puede tocar un evento oficial en "Próximas fechas" y editarlo
  // ahí mismo, sin ir a /oficial.
  const [oficialEditar, setOficialEditar] = useState(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  // hoy() lee el reloj: se calcula una vez por montaje y no en cada render,
  // para que todas las comparaciones de la pantalla usen la misma fecha.
  const today = useMemo(hoy, []);
  const todayKey = useMemo(() => key(today), [today]);

  // En "Eventos Personales" el picker de sala/grado no aplica: se ven todos
  // los propios (y los compartidos con vos), sin importar los picks guardados
  // para la vista general.
  const visible = useMemo(
    () => (soloPersonales ? (ev) => ev.level === 'per' : matcher(picks)),
    [soloPersonales, picks],
  );

  // La agenda arranca en el mes actual: los que ya pasaron quedan plegados
  // detrás de un botón cada uno. Si el ciclo todavía no empezó no hay nada que
  // plegar, y si ya terminó tampoco: se plegarían todos y quedaría la pantalla
  // vacía.
  const anteriores = useMemo(() => {
    const actual = today.getFullYear() * 12 + today.getMonth();
    const pasados = MONTHS.filter(([year, mon]) => year * 12 + mon < actual);
    return pasados.length === MONTHS.length ? [] : pasados;
  }, [today]);
  const [abiertos, setAbiertos] = useState(() => new Set());
  const alternarMes = useCallback((id) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const plegado = (year, mon) =>
    !abiertos.has(`${year}-${mon}`) && anteriores.some(([y, m]) => y === year && m === mon);

  // Click en una celda del calendario: lleva a la fila del día en la agenda y
  // la resalta un momento. El flash se limpia solo para que volver a tocar el
  // mismo día lo vuelva a disparar.
  const onDayClick = useCallback((kk) => {
    let row = document.getElementById(`d-${kk}`);
    if (!row && (byDay[kk] || []).some((o) => visible(o.ev))) {
      // La grilla del mes actual muestra también los últimos días del
      // anterior: si ese mes está plegado, se abre para que la fila exista.
      // Sólo si ese día tiene algo: un día vacío no tiene fila en ningún lado.
      const [y, m] = kk.split('-').map(Number);
      flushSync(() => setAbiertos((prev) => new Set(prev).add(`${y}-${m - 1}`)));
      row = document.getElementById(`d-${kk}`);
    }
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(flashTimer.current);
    setFlash(null);
    requestAnimationFrame(() => setFlash(kk));
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, [byDay, visible]);

  const guardarPicks = useCallback((lista) => {
    setPicks(ordenarPicks(lista));
    setPicker(false);
  }, [setPicks]);

  // Click en un evento propio (calendario o "Próximas fechas"): abre
  // EventoMenu sobre ESE evento. Cerrarlo limpia el estado, así la próxima
  // apertura no arranca con datos viejos.
  const cerrarMenu = useCallback(() => setEventoMenu(null), []);
  const cerrarEditar = useCallback(() => setEventoEditar(null), []);
  const cerrarOficial = useCallback(() => setOficialEditar(null), []);
  const editarDesdeMenu = useCallback((ev) => {
    setEventoMenu(null);
    setEventoEditar(ev);
  }, []);

  return (
    <>
      {/* wrap-bar: el padding de abajo de .wrap es el aire del FINAL de la
          página; acá abajo sigue el calendario, así que lleva el suyo. */}
      <div className="wrap wrap-bar">
        <div className="picker-bar">
          {soloPersonales ? (
            // Acá no hay picks que resumir (no aplica el filtro de sala/grado):
            // las dos acciones de esta barra son sobre la cuenta entera, no
            // sobre un evento puntual.
            <>
              <button className="btn ghost" type="button" onClick={() => setAdder(true)}>
                Agregar evento +
              </button>
              <button className="btn ghost" type="button" onClick={abrirCompartirTodo}>
                Compartir todos mis eventos
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="wrap">
        {/* Arriba de todo y en las dos vistas (`/` y `/personales`): el botón
            que anuncia está en las dos. Se queda hasta que lo cierren. */}
        <AvisoNovedad />

        {error && <p className="err banner">{error}</p>}
        {loading && <p className="empty-note">Cargando el calendario…</p>}

        {!loading && (
          soloPersonales ? (
            <EventosPersonales eventos={todos} visible={visible} onEditar={setEventoEditar} />
          ) : (
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
                <Upcoming
                  eventos={todos}
                  visible={visible}
                  today={today}
                  onEventoClick={setEventoMenu}
                  onOficialClick={user?.isAdmin ? setOficialEditar : undefined}
                />
              </section>

              {anteriores.length > 0 && (
                <div className="meses-ant">
                  <span className="lbl">Meses anteriores</span>
                  {anteriores.map(([year, mon]) => {
                    const id = `${year}-${mon}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="mes-ant"
                        aria-pressed={abiertos.has(id)}
                        onClick={() => alternarMes(id)}
                      >
                        {MESES[mon]}
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                {MONTHS.map(([year, mon], i) => plegado(year, mon) ? null : (
                  <Month
                    key={`${year}-${mon}`}
                    year={year}
                    mon={mon}
                    byDay={byDay}
                    visible={visible}
                    todayKey={todayKey}
                    esPrimero={i === 0}
                    onDayClick={onDayClick}
                    onEventoClick={setEventoMenu}
                    flash={flash}
                  />
                ))}
              </div>
            </>
          )
        )}
      </div>

      <PickerDialog open={picker} picks={picks} onClose={() => setPicker(false)} onSave={guardarPicks} />
      <AdderDialog open={adder} onClose={() => setAdder(false)} />
      <EventoMenu evento={eventoMenu} onClose={cerrarMenu} onEditar={editarDesdeMenu} />
      <EditEventDialog evento={eventoEditar} onClose={cerrarEditar} />
      <EditOficialDialog evento={oficialEditar} onClose={cerrarOficial} />
    </>
  );
}
