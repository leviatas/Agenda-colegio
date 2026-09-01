import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { buildIndex } from '../lib/agenda';
import { borrarLocal, crearLocal, editarLocal, esLocal, leerLocales } from '../lib/personales';

const EventosContext = createContext(null);

// Una sola carga para toda la app: el calendario y la pantalla de gestión leen
// de acá, así que editar un evento oficial se ve reflejado en el calendario sin
// volver a pedir nada al server.
//
// Los eventos propios salen de dos lados a la vez: `remotos` son los de la
// cuenta (los trae el server) y `locales` los que se cargaron sin sesión, que
// viven en el localStorage de este navegador. Se muestran juntos y se editan
// igual; lo que decide a dónde va cada escritura es el id (ver lib/personales).
export function EventosProvider({ children }) {
  const { token, loading: cargandoSesion } = useAuth();
  const [oficiales, setOficiales] = useState([]);
  const [remotos, setRemotos] = useState([]);
  const [locales, setLocales] = useState(leerLocales);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Con sesión los eventos propios tienen que estar en la cuenta, así que los
  // que quedaron en el navegador se suben y se van de acá. Corre en cada carga
  // con token, no sólo justo después del login: si la subida se cortó por red,
  // lo que quedó se reintenta en el próximo arranque.
  const migrar = useCallback(async (jwt) => {
    const pendientes = leerLocales();
    if (pendientes.length === 0) return;

    for (const ev of pendientes) {
      try {
        await api.mios.create(jwt, {
          title: ev.title, date: ev.date, endDate: ev.endDate, time: ev.time,
        });
        // Se saca uno por uno apenas el server lo confirma: si el siguiente
        // falla, los ya subidos no se vuelven a mandar y no quedan duplicados.
        borrarLocal(ev.id);
      } catch (err) {
        // Sin status es que no llegó a la red: cortamos y seguimos en la
        // próxima carga. Un 400 no va a andar nunca (una fecha que se fue del
        // ciclo lectivo), pero tampoco se descarta: el evento sigue visible y
        // editable como local, que es mejor que borrarle algo sin avisar.
        if (!err.status) break;
      }
    }
    setLocales(leerLocales());
  }, []);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      if (token) await migrar(token);
      const data = await api.eventos(token);
      setOficiales(data.oficiales);
      setRemotos(data.personales);
    } catch (err) {
      setError('No se pudo cargar el calendario. Probá recargar la página.');
    } finally {
      setLoading(false);
    }
  }, [token, migrar]);

  // Se espera a que la sesión resuelva antes de pedir: si no, la primera carga
  // saldría sin token y volvería sin los eventos personales, y habría que
  // pedirla de nuevo apenas /auth/me contesta.
  useEffect(() => {
    if (cargandoSesion) return;
    cargar();
  }, [cargandoSesion, cargar]);

  // Los personales de la cuenta se actualizan en el estado con lo que devuelve
  // el server, no con lo que se mandó: la fecha de fin se normaliza del lado
  // del server (endDate == date se guarda como null) y queremos ver exactamente
  // lo que quedó guardado.
  const agregarMio = useCallback(async (data) => {
    if (!token) {
      setLocales(crearLocal(data));
      return;
    }
    const { evento } = await api.mios.create(token, data);
    setRemotos((prev) => [...prev, evento]);
  }, [token]);

  const editarMio = useCallback(async (id, data) => {
    if (esLocal(id)) {
      setLocales(editarLocal(id, data));
      return;
    }
    const { evento } = await api.mios.update(token, id, data);
    setRemotos((prev) => prev.map((e) => (e.id === id ? evento : e)));
  }, [token]);

  const borrarMio = useCallback(async (id) => {
    if (esLocal(id)) {
      setLocales(borrarLocal(id));
      return;
    }
    await api.mios.remove(token, id);
    setRemotos((prev) => prev.filter((e) => e.id !== id));
  }, [token]);

  const reemplazarOficial = useCallback((evento) => {
    setOficiales((prev) => {
      const i = prev.findIndex((e) => e.id === evento.id);
      if (i < 0) return [...prev, evento];
      const next = prev.slice();
      next[i] = evento;
      return next;
    });
  }, []);

  const quitarOficial = useCallback((id) => {
    setOficiales((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const personales = useMemo(() => [...remotos, ...locales], [remotos, locales]);
  const todos = useMemo(() => [...oficiales, ...personales], [oficiales, personales]);
  const byDay = useMemo(() => buildIndex(todos), [todos]);

  const value = {
    oficiales, personales, todos, byDay, loading, error, cargar,
    agregarMio, editarMio, borrarMio, reemplazarOficial, quitarOficial,
  };

  return <EventosContext.Provider value={value}>{children}</EventosContext.Provider>;
}

export const useEventos = () => useContext(EventosContext);
