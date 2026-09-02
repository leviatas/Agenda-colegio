import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Dialog from './Dialog';

// Confirmación propia para toda acción destructiva. NO usar window.confirm: el
// diálogo nativo depende del navegador —Chrome de Android lo silencia después
// de varios seguidos, y dentro de un WebView puede no mostrarse nunca y
// devolver un valor por defecto—, así que un borrado podía salir sin que nadie
// viera la pregunta.
//
// Va en un <dialog> con showModal() y NO en un div con z-index: un <dialog>
// modal se dibuja en el top layer del browser, arriba de TODO z-index, así que
// la pregunta de "¿borro este evento?" quedaba tapada por el modal de agregar
// evento, que es justo desde donde se borra. Entre dos <dialog> modales manda
// el orden de apertura, y este se abre último.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    setState({
      title: 'Confirmar',
      message: typeof options === 'string' ? options : '',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      ...(typeof options === 'object' ? options : {}),
    });
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((value) => {
    setState(null);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* cerrarAfuera y el `cancel` del <dialog> (Escape) resuelven que no,
          igual que el botón de Cancelar: nunca se resuelve solo en `true`. */}
      <Dialog
        open={Boolean(state)}
        onClose={() => close(false)}
        id="confirm"
        className="confirm-dialog"
        role="alertdialog"
        labelledBy="confirm-title"
        cerrarAfuera
      >
        {state && (
          <div className="confirm-modal">
            <h3 id="confirm-title">{state.title}</h3>
            <p>{state.message}</p>
            <div className="modal-actions">
              {/* El foco arranca en Cancelar a propósito. */}
              <button type="button" autoFocus onClick={() => close(false)}>
                {state.cancelLabel}
              </button>
              <button type="button" className="btn-danger" onClick={() => close(true)}>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
