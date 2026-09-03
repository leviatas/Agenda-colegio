// El ícono típico de "compartir": una flecha saliendo de una bandeja hacia
// arriba, como en el botón nativo de iOS/Android. Mismas convenciones de trazo
// que los íconos de ThemeSwitch.jsx (viewBox 24, stroke currentColor). Aparte
// en su propio archivo porque lo usan tres lugares: el header de
// EditEventDialog (compartir un evento puntual), Masthead (compartir todos) y,
// antes, la lista de AdderDialog.
export default function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4M12 4 8.5 7.5M12 4l3.5 3.5" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}
