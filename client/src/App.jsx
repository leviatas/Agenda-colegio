import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Masthead from './components/Masthead';
import Calendario from './pages/Calendario';
import Oficial from './pages/Oficial';
import Usuarios from './pages/Usuarios';
import CompartirEvento from './pages/CompartirEvento';
import { useAuth } from './context/AuthContext';
import { registrarVisita } from './lib/telemetria';

// No hay gate de login en el routing: el calendario es público a propósito, el
// link se le pasa a las familias y tiene que abrir sin cuenta. Lo único que
// pide sesión es agregar eventos propios (dentro del modal); /oficial y
// /usuarios son del admin, y se chequean en la propia pantalla y, sobre todo,
// en el server.
export default function App() {
  const { token, loading } = useAuth();

  // Telemetría: una visita por carga, para saber cuántas personas distintas
  // abren la agenda. Se espera a que la sesión resuelva —si no, toda visita
  // saldría como anónima aunque haya cuenta— y se manda de nuevo si aparece un
  // token, así el ingreso con Google queda asociado al mismo navegador. El
  // propio `registrarVisita` no repite el aviso.
  useEffect(() => {
    if (loading) return;
    registrarVisita(token);
  }, [loading, token]);

  return (
    <>
      <Masthead />
      <Routes>
        <Route path="/" element={<Calendario />} />
        <Route path="/oficial" element={<Oficial />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/compartir/evento/:token" element={<CompartirEvento />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="wrap">
        <footer>
          <span>Calendario del Colegio San Gabriel · septiembre a diciembre de 2026</span>
          <span className="version">v{__APP_VERSION__}</span>
        </footer>
      </div>
    </>
  );
}
