import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { CAT, ordenarPicks } from '../lib/agenda';

const AuthContext = createContext(null);

const TOKEN_KEY = 'sg-token';
// Mismo nombre que usaba la versión de un solo HTML: quien ya tenía elegida su
// sala en este navegador no la pierde al pasar a la app.
const PICKS_KEY = 'sg-seleccion-v1';

// En modo privado localStorage puede tirar al leer y al escribir, así que todo
// acceso va envuelto. Sin almacenamiento la app funciona igual: los filtros
// valen para la visita, y si hay cuenta viajan por la base de todos modos.
function leer(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function escribir(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (err) {
    /* sin almacenamiento */
  }
}

// Los picks guardados se filtran contra el catálogo: un id viejo de una sala
// que ya no existe se descarta en vez de quedar filtrando en el vacío.
function limpiarPicks(lista) {
  if (!Array.isArray(lista)) return [];
  return ordenarPicks(lista.filter((id) => typeof id === 'string' && CAT[id]));
}

function picksLocales() {
  try {
    const raw = leer(PICKS_KEY);
    if (!raw) return [];
    return limpiarPicks(JSON.parse(raw).picks);
  } catch (err) {
    return [];
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => leer(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [picks, setPicksState] = useState(picksLocales);
  const [loading, setLoading] = useState(() => Boolean(leer(TOKEN_KEY)));

  // Con cuenta manda lo que está en la base — es lo que hace que la selección
  // aparezca igual en otro dispositivo. La excepción es la primera vez: si la
  // cuenta todavía no tiene nada guardado y en este navegador sí había algo, se
  // sube lo local en vez de borrarlo.
  const adoptarPicks = useCallback(async (remotos, jwt) => {
    const delServidor = limpiarPicks(remotos);
    const locales = picksLocales();

    if (delServidor.length === 0 && locales.length > 0) {
      setPicksState(locales);
      try {
        await api.savePicks(jwt, locales);
      } catch (err) {
        /* si falla queda para el próximo cambio de filtros */
      }
      return;
    }

    setPicksState(delServidor);
    escribir(PICKS_KEY, JSON.stringify({ picks: delServidor }));
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let vivo = true;
    api
      .me(token)
      .then(({ user: u }) => {
        if (!vivo) return;
        setUser(u);
        return adoptarPicks(u.picks, token);
      })
      .catch(() => {
        // Token vencido o inválido: se vuelve a anónimo en silencio. El
        // calendario oficial sigue viéndose, que es lo que importa.
        if (!vivo) return;
        escribir(TOKEN_KEY, null);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [token, adoptarPicks]);

  const loginWithCredential = useCallback(
    async (credential) => {
      const { token: nuevo, user: u } = await api.loginWithGoogle(credential);
      escribir(TOKEN_KEY, nuevo);
      setUser(u);
      await adoptarPicks(u.picks, nuevo);
      // Último: setear el token dispara el efecto de /auth/me, y para entonces
      // los picks ya quedaron resueltos.
      setToken(nuevo);
    },
    [adoptarPicks]
  );

  const logout = useCallback(() => {
    escribir(TOKEN_KEY, null);
    setToken(null);
    setUser(null);
    // Los filtros NO se borran: son una preferencia de visualización, no un
    // dato de la sesión, y cerrar sesión no debería dejar el calendario en
    // "ver todo" de golpe.
  }, []);

  // Se guarda siempre en localStorage (para pintar rápido y para quien no tiene
  // cuenta) y además en la base si hay sesión. El estado se actualiza sin
  // esperar a la red: la selección tiene que sentirse instantánea.
  const setPicks = useCallback(
    (lista) => {
      const limpios = limpiarPicks(lista);
      setPicksState(limpios);
      escribir(PICKS_KEY, JSON.stringify({ picks: limpios }));
      if (token) {
        api.savePicks(token, limpios).catch(() => {
          /* queda guardado local; se reintenta con el próximo cambio */
        });
      }
    },
    [token]
  );

  return (
    <AuthContext.Provider value={{ token, user, picks, setPicks, loading, loginWithCredential, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
