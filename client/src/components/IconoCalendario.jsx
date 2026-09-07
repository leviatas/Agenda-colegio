// Un calendario con un "+": el botón de agregar el evento a Google Calendar.
// Mismas convenciones de trazo que IconoCompartir.jsx e IconoEditar.jsx
// (viewBox 24, stroke currentColor), y no el logo de Google a propósito: al
// lado de cada renglón del calendario tiene que leerse como un ícono más de la
// agenda, no como una marca de otro producto.
export default function IconoCalendario() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <line x1="12" y1="13" x2="12" y2="18" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
    </svg>
  );
}
