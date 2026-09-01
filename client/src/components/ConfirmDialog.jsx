import { createContext, useCallback, useContext, useRef, useState } from 'react';

// Confirmación propia para toda acción destructiva. NO usar window.confirm: el
// diálogo nativo depende del navegador —Chrome de Android lo silencia después
// de varios seguidos, y dentro de un WebView puede no mostrarse nunca y
// devolver un valor por defecto—, así que un borrado podía salir sin que nadie
// viera la pregunta.
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
      {state && (
        <div
          className="confirm-backdrop"
          onClick={() => close(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close(false);
          }}
        >
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{state.title}</h3>
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
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
