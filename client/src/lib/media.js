import { useEffect, useState } from 'react';

// El mismo 720px que usa styles.css para el modo celular. Está acá y no
// suelto en cada componente porque si se corre el breakpoint del CSS hay que
// correr también el de los componentes que cambian de forma (el selector de
// tema y el botón de Google), y con dos números sueltos eso se olvida.
export const ANGOSTO = '(max-width: 720px)';

// El estado inicial se lee del propio matchMedia, no de un `false` que después
// corrige un efecto: así el primer render ya sale con la forma correcta y no
// se ve el switch de tres botones un instante antes de achicarse.
export function useMedia(query) {
  const [match, setMatch] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch (err) {
      return false;
    }
  });

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(query);
    } catch (err) {
      return undefined;
    }
    const onChange = (e) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return match;
}

export const useAngosto = () => useMedia(ANGOSTO);
