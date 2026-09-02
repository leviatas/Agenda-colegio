import { useCallback, useEffect, useRef, useState } from 'react';
import { useAngosto } from '../lib/media';

const THEME_KEY = 'sg-tema';

function leerTema() {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch (err) {
    return 'system';
  }
}

function aplicar(v) {
  const r = document.documentElement;
  // 'system' quita el atributo en vez de calcular el modo: así el CSS resuelve
  // solo con prefers-color-scheme y sigue al sistema si la persona lo cambia
  // con la página abierta, sin listeners.
  if (v === 'light' || v === 'dark') r.setAttribute('data-theme', v);
  else r.removeAttribute('data-theme');
}

const OPCIONES = [
  { v: 'light', label: 'Tema claro', title: 'Claro' },
  { v: 'dark', label: 'Tema oscuro', title: 'Oscuro' },
  { v: 'system', label: 'Según el sistema', title: 'Según el sistema' },
];

function Icono({ v }) {
  const comun = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    'aria-hidden': true,
  };
  if (v === 'light') {
    return (
      <svg {...comun}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1.8v2.1M12 20.1v2.1M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M1.8 12h2.1M20.1 12h2.1M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" />
      </svg>
    );
  }
  if (v === 'dark') {
    return (
      <svg {...comun} strokeLinejoin="round">
        <path d="M20.8 13.4A8.6 8.6 0 1 1 10.6 3.2a6.7 6.7 0 0 0 10.2 10.2z" />
      </svg>
    );
  }
  return (
    <svg {...comun} strokeLinejoin="round">
      <rect x="2.8" y="4.2" width="18.4" height="12.4" rx="2" />
      <path d="M8.5 20.4h7M12 16.6v3.8" />
    </svg>
  );
}

export default function ThemeSwitch() {
  const [tema, setTema] = useState(leerTema);
  const angosto = useAngosto();
  const boxRef = useRef(null);

  useEffect(() => {
    aplicar(tema);
  }, [tema]);

  const cambiar = useCallback((v) => {
    try {
      if (v === 'system') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, v);
    } catch (err) {
      /* sin almacenamiento: vale para esta visita */
    }
    setTema(v);
  }, []);

  // Flechas para moverse dentro del grupo, como espera un radiogroup.
  function onKeyDown(e) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const btns = Array.from(boxRef.current.querySelectorAll('button'));
    const i = btns.indexOf(document.activeElement);
    const next = btns[((i < 0 ? 0 : i) + step + btns.length) % btns.length];
    cambiar(next.getAttribute('data-set'));
    next.focus();
  }

  // En celular el ancho del header es lo escaso —hay que compartirlo con el
  // botón de Google— así que en vez de los tres botones va uno solo con el
  // tema actual, y tocarlo pasa al siguiente. Deja de ser un radiogroup: es
  // un botón común que cicla, y como tal se anuncia.
  if (angosto) {
    const i = OPCIONES.findIndex((o) => o.v === tema);
    const actual = OPCIONES[i < 0 ? 2 : i];
    const siguiente = OPCIONES[((i < 0 ? 2 : i) + 1) % OPCIONES.length];
    return (
      <div className="theme">
        <button
          type="button"
          className="theme-ciclo"
          aria-label={`Tema: ${actual.title}. Tocá para pasar a: ${siguiente.title}`}
          title={actual.title}
          onClick={() => cambiar(siguiente.v)}
        >
          <Icono v={actual.v} />
        </button>
      </div>
    );
  }

  return (
    <div className="theme" ref={boxRef} role="radiogroup" aria-label="Tema de la página" onKeyDown={onKeyDown}>
      {OPCIONES.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          data-set={o.v}
          aria-checked={tema === o.v}
          aria-label={o.label}
          title={o.title}
          tabIndex={tema === o.v ? 0 : -1}
          onClick={() => cambiar(o.v)}
        >
          <Icono v={o.v} />
        </button>
      ))}
    </div>
  );
}
