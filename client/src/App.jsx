import { Navigate, Route, Routes } from 'react-router-dom';
import Masthead from './components/Masthead';
import Calendario from './pages/Calendario';
import Oficial from './pages/Oficial';

// No hay gate de login en el routing: el calendario es público a propósito, el
// link se le pasa a las familias y tiene que abrir sin cuenta. Lo único que
// pide sesión es agregar eventos propios (dentro del modal) y /oficial, que se
// chequea en la propia pantalla y, sobre todo, en el server.
export default function App() {
  return (
    <>
      <Masthead />
      <Routes>
        <Route path="/" element={<Calendario />} />
        <Route path="/oficial" element={<Oficial />} />
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
