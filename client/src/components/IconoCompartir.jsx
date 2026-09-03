// El ícono universal de "compartir": tres puntos unidos por dos palos (el de
// Android/Material, "nodos"), no la flecha-y-bandeja de iOS. Mismas
// convenciones de trazo que los íconos de ThemeSwitch.jsx (viewBox 24, stroke
// currentColor). Aparte en su propio archivo porque lo usan tres lugares: el
// header de EditEventDialog (compartir un evento puntual), Masthead
// (compartir todos) y, antes, la lista de AdderDialog.
export default function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <line x1="8.2" y1="10.6" x2="15.8" y2="6.4" />
      <line x1="8.2" y1="13.4" x2="15.8" y2="17.6" />
    </svg>
  );
}
