// El típico tacho de basura: tapa, cuerpo y dos rayitas adentro. Mismas
// convenciones de trazo que IconoCompartir.jsx (viewBox 24, stroke
// currentColor). Sólo lo usa el botón de "Borrar" de EditEventDialog, pero
// va en su propio archivo por la misma razón que ese ícono: si en algún
// momento hace falta en otro lado (por ejemplo un borrado desde
// CompartirTodoDialog), ya está listo para importar sin duplicar el SVG.
export default function IconoBorrar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
