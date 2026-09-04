import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { EventosProvider } from './context/EventosContext.jsx';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import { CompartirTodoProvider } from './components/CompartirTodoDialog.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* EventosProvider adentro de AuthProvider: la carga del calendario
            necesita saber si hay sesión para traer también los eventos
            personales. */}
        <EventosProvider>
          {/* Provider de confirmaciones: envuelve toda la app porque el diálogo
              se usa desde páginas y desde modales por igual. */}
          <ConfirmProvider>
            {/* Mismo motivo que ConfirmProvider: "compartir todos mis eventos"
                se abre desde Masthead y desde EventosPersonales.jsx, que no son
                parientes en el árbol. */}
            <CompartirTodoProvider>
              <App />
            </CompartirTodoProvider>
          </ConfirmProvider>
        </EventosProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
