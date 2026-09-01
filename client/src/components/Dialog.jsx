import { useEffect, useRef } from 'react';

// Envoltorio del <dialog> nativo: da el backdrop, el trap de foco y el Escape
// sin escribir nada de eso a mano. React no tiene una prop para `open` en modo
// modal, así que showModal()/close() se llaman por ref desde un efecto.
//
// El contenido se monta sólo cuando `open` es true a propósito: cada apertura
// arranca con los campos en su estado inicial, sin tener que resetearlos.
export default function Dialog({ open, onClose, id, labelledBy, className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // 'cancel' es Escape y el botón de cerrar del navegador. Sin esto el <dialog>
  // se cierra solo y el estado de React queda creyendo que sigue abierto, así
  // que la próxima apertura no hace nada.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cerrar = (e) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', cerrar);
    return () => el.removeEventListener('cancel', cerrar);
  }, [onClose]);

  return (
    <dialog ref={ref} id={id} aria-labelledby={labelledBy} className={className}>
      {open && (
        <div className="modal-in" tabIndex={-1}>
          {children}
        </div>
      )}
    </dialog>
  );
}
