import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { cerradasLocales, marcarCerradaLocal } from '../lib/novedades';

const NovedadesContext = createContext(null);

// Una sola carga de novedades para toda la app, por el mismo motivo que
// EventosProvider: las lee el aviso de arriba del calendario (AvisoNovedad) y
// la "i" del encabezado (Masthead → NovedadesDialog), que no son parientes en
// el árbol de componentes.
//
// El server ya devuelve SÓLO las vigentes de hoy (ver routes/novedades.js): el
// corte por fecha lo hace él, con la fecha de Argentina, y no el reloj del
// navegador. Acá adentro sólo se decide qué se cerró y qué no.
export function NovedadesProvider({ children }) {
  const { token, loading: cargandoSesion } = useAuth();
  const [novedades, setNovedades] = useState([]);
  // Ids cerrados: la unión de lo que dice la cuenta y lo que quedó marcado en
  // este navegador (ver lib/novedades.js). Se arranca con lo local para que un
  // aviso ya cerrado no parpadee mientras carga la lista.
  const [cerradas, setCerradas] = useState(() => new Set(cerradasLocales()));

  useEffect(() => {
    // Se espera a que la sesión resuelva: si no, la primera carga saldría sin
    // token y volvería sin las marcas de la cuenta, y los avisos ya cerrados
    // desde otro dispositivo aparecerían un momento.
    if (cargandoSesion) return undefined;

    let vivo = true;
    api
      .novedades
      .list(token)
      .then(({ novedades: lista, cerradas: delServidor }) => {
        if (!vivo) return;
        setNovedades(lista);

        const locales = cerradasLocales();
        setCerradas(new Set([...delServidor, ...locales]));

        // Lo que se cerró sin cuenta (o antes de que la red anduviera) se sube
        // en cuanto hay sesión, así la marca viaja al resto de los
        // dispositivos. Mismo espíritu que `migrar` en EventosContext: corre en
        // cada carga con token, no sólo después del login. Sin await ni
        // reintento: si falla, la marca local sigue tapando el aviso acá y se
        // vuelve a intentar en la próxima carga.
        if (token) {
          const vigentes = new Set(lista.map((n) => n.id));
          const enServidor = new Set(delServidor);
          locales
            .filter((id) => vigentes.has(id) && !enServidor.has(id))
            .forEach((id) => {
              api.novedades.cerrar(token, id).catch(() => {});
            });
        }
      })
      .catch(() => {
        // Que no se puedan traer las novedades no es algo que haya que
        // mostrarle a nadie: el calendario, que es a lo que se viene, ya se
        // dibuja igual. Se queda sin avisos y listo.
        if (vivo) setNovedades([]);
      });

    return () => {
      vivo = false;
    };
  }, [token, cargandoSesion]);

  // La X de un aviso. El estado se actualiza sin esperar a la red —cerrar algo
  // tiene que sentirse instantáneo— y la marca queda en el navegador aunque
  // haya cuenta, así no reaparece si el POST no llega.
  const cerrar = useCallback(
    (id) => {
      marcarCerradaLocal(id);
      setCerradas((previas) => new Set(previas).add(id));
      if (token) {
        api.novedades.cerrar(token, id).catch(() => {
          /* queda la marca local; se reintenta en la próxima carga */
        });
      }
    },
    [token],
  );

  // Las que todavía tiene sentido mostrar arriba del calendario. La lista
  // completa (`novedades`) es la de la "i", que muestra también las cerradas:
  // para eso está, para poder volver a leer algo que se cerró de más.
  const sinCerrar = useMemo(
    () => novedades.filter((n) => !cerradas.has(n.id)),
    [novedades, cerradas],
  );

  const valor = useMemo(
    () => ({ novedades, sinCerrar, cerradas, cerrar }),
    [novedades, sinCerrar, cerradas, cerrar],
  );

  return <NovedadesContext.Provider value={valor}>{children}</NovedadesContext.Provider>;
}

export const useNovedades = () => useContext(NovedadesContext);
