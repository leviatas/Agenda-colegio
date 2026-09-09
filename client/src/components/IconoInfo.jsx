// La "i" en un círculo: "hay algo para leer acá". La usa el botón de novedades
// del encabezado (Masthead.jsx) y el cartelito de arriba del calendario
// (AvisoNovedad.jsx). Mismas convenciones de trazo que IconoCompartir.jsx e
// IconoCerrar.jsx (viewBox 24, stroke currentColor).
export default function IconoInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.6" x2="12" y2="7.7" />
    </svg>
  );
}
