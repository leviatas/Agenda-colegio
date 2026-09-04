import { createContext, useContext, useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';

// Compartir TODOS los eventos propios, en vivo, por código: quien lo canjea
// ve mezclados en su calendario los que ya tenías y los que cargues después,
// hasta que uno de los dos lo corte. Nada que ver con un evento puntual, que
// es EditEventDialog.jsx.
//
// Provider + hook (mismo patrón que ConfirmDialog.jsx) y no un simple
// open/onClose por prop: se abre desde dos lugares que no son parientes en el
// árbol —el ícono al lado de la cuenta en Masthead.jsx y el botón al pie de
// la lista de EventosPersonales.jsx—, así que hace falta una única instancia
// del modal en vez de una por cada lugar que lo abre (dos `<dialog>` con el
// mismo id sería HTML inválido, y en cualquier momento sólo puede haber uno
// abierto).
const CompartirTodoContext = createContext(null);

export function CompartirTodoProvider({ children }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <CompartirTodoContext.Provider value={() => setAbierto(true)}>
      {children}
      <Dialog open={abierto} onClose={() => setAbierto(false)} id="compartir-todo" labelledBy="compartir-todo-title">
        <Cuerpo onClose={() => setAbierto(false)} />
      </Dialog>
    </CompartirTodoContext.Provider>
  );
}

export function useCompartirTodo() {
  return useContext(CompartirTodoContext);
}

function Cuerpo({ onClose }) {
  const { token } = useAuth();
  const { cargar } = useEventos();
  const confirm = useConfirm();

  const [codigo, setCodigo] = useState(null); // null = todavía no se sabe
  const [suscriptores, setSuscriptores] = useState([]);
  const [suscripciones, setSuscripciones] = useState([]);
  const [ingreso, setIngreso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    Promise.all([
      api.compartir.codigo.get(token),
      api.compartir.suscriptores(token),
      api.compartir.suscripciones(token),
    ])
      .then(([c, s1, s2]) => {
        if (!vivo) return;
        setCodigo(c.codigo || '');
        setSuscriptores(s1.suscriptores);
        setSuscripciones(s2.suscripciones);
      })
      .catch((err) => {
        if (vivo) setError(err.message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  async function generar() {
    setError('');
    try {
      const { codigo: nuevo } = await api.compartir.codigo.generar(token);
      setCodigo(nuevo);
    } catch (err) {
      setError(err.message);
    }
  }

  async function apagar() {
    const ok = await confirm({
      title: 'Dejar de compartir',
      message: 'El código deja de servir para gente nueva. A quien ya lo usó no se le corta el '
        + 'acceso solo: para eso está "Quitar" al lado de su nombre.',
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await api.compartir.codigo.apagar(token);
      setCodigo('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitarSuscriptor(persona) {
    const ok = await confirm({
      title: 'Quitar acceso',
      message: `¿Dejar de compartirle tus eventos a ${persona.name}?`,
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await api.compartir.quitarSuscriptor(token, persona.id);
      setSuscriptores((prev) => prev.filter((p) => p.id !== persona.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function canjear() {
    setError('');
    setAviso('');
    const valor = ingreso.trim();
    if (!valor) return;
    try {
      const { owner } = await api.compartir.canjear(token, valor);
      setIngreso('');
      setAviso(`Ahora ves también los eventos de ${owner.name}.`);
      setSuscripciones((prev) => [...prev, owner]);
      await cargar(); // trae sus eventos al calendario ya mismo
    } catch (err) {
      setError(err.message);
    }
  }

  async function dejarDeVer(persona) {
    const ok = await confirm({
      title: 'Dejar de ver',
      message: `¿Dejar de ver los eventos de ${persona.name}?`,
      confirmLabel: 'Dejar de ver',
    });
    if (!ok) return;
    try {
      await api.compartir.dejarDeVer(token, persona.id);
      setSuscripciones((prev) => prev.filter((p) => p.id !== persona.id));
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="modal-head">
        <h2 id="compartir-todo-title">Compartir tus eventos</h2>
      </div>

      <div className="modal-body">
        {cargando && <p className="empty-note">Cargando…</p>}

        {!cargando && (
          <>
            <div className="mine">
              <h3>Compartir todos tus eventos</h3>
              <p className="lede muted">
                Generá un código y pasáselo a otra persona: mientras esté activo, tus eventos
                aparecen mezclados en su calendario (ella no puede editarlos ni borrarlos), y los
                que cargues de ahora en más también, sin compartir nada de nuevo.
              </p>

              {codigo ? (
                <div className="codigo-activo">
                  <code>{codigo}</code>
                  <button type="button" className="mbtn" onClick={apagar}>Dejar de compartir</button>
                </div>
              ) : (
                <button type="button" className="mbtn" onClick={generar}>Generar código</button>
              )}

              {suscriptores.length > 0 && (
                <ul className="compartir-lista">
                  <li className="compartir-lista-titulo">Ya lo usaron:</li>
                  {suscriptores.map((p) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <button type="button" className="edit" onClick={() => quitarSuscriptor(p)}>Quitar</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mine">
              <h3>Ver los eventos de otra persona</h3>
              <p className="lede muted">Pedile el código a quien te quiera compartir los suyos.</p>
              <div className="share-link-row">
                <input
                  type="text"
                  maxLength={16}
                  autoComplete="off"
                  placeholder="Código"
                  value={ingreso}
                  onChange={(e) => setIngreso(e.target.value.toUpperCase())}
                />
                <button type="button" className="mbtn" onClick={canjear}>Usar código</button>
              </div>

              {suscripciones.length > 0 && (
                <ul className="compartir-lista">
                  <li className="compartir-lista-titulo">Viendo también los eventos de:</li>
                  {suscripciones.map((p) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <button type="button" className="edit" onClick={() => dejarDeVer(p)}>Dejar de ver</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {error && <p className="err">{error}</p>}
        {aviso && <p className="lede muted">{aviso}</p>}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cerrar</button>
      </div>
    </>
  );
}
