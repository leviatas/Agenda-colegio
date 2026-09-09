import { useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { parse } from '../lib/agenda';

// El formulario de una novedad, alta y edición (pantalla /novedades). Vive en
// un modal y no arriba de la lista: lo que se mira casi siempre es qué avisos
// hay, no cargar uno nuevo, así que la pantalla abre con la lista y el
// formulario aparece cuando se lo pide.
//
// `novedad` en null es un alta; con una adentro, la edición de esa. Como
// Dialog desmonta el contenido al cerrar, cada apertura arranca con los
// campos de la novedad que corresponde sin ningún efecto de sincronización.
const MAX_TITULO = 60;
const MAX_TEXTO = 300;

// `dias` días después de `iso`, en el mismo formato 'YYYY-MM-DD'. Sólo sirve
// para proponer un vencimiento por default; el corte real lo hace el server
// con su propia fecha (lib/fechas.js).
function masDias(iso, dias) {
  const d = parse(iso);
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Una novedad nueva arranca vigente hoy y con un mes de vida: es lo que se
// quiere casi siempre, y las dos fechas se pueden cambiar. `hoy` es el del
// server (Argentina), no el del reloj de esta máquina.
function inicial(novedad, hoy) {
  if (novedad) {
    return { titulo: novedad.titulo, texto: novedad.texto, desde: novedad.desde, hasta: novedad.hasta };
  }
  return { titulo: 'Novedad', texto: '', desde: hoy, hasta: hoy ? masDias(hoy, 30) : '' };
}

function Cuerpo({ novedad, hoy, onClose, onGuardada }) {
  const { token } = useAuth();
  const [form, setForm] = useState(() => inicial(novedad, hoy));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const editando = Boolean(novedad);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    setError('');
    if (!form.titulo.trim()) return setError('Falta el título.');
    if (!form.texto.trim()) return setError('Falta el texto de la novedad.');
    if (!form.desde) return setError('Falta la fecha de inicio.');
    if (!form.hasta) return setError('Falta la fecha de vencimiento.');

    const data = {
      titulo: form.titulo.trim(),
      texto: form.texto.trim(),
      desde: form.desde,
      hasta: form.hasta,
    };

    setGuardando(true);
    try {
      const res = editando
        ? await api.novedades.admin.update(token, novedad.id, data)
        : await api.novedades.admin.create(token, data);
      onGuardada(res.novedad);
      // Cierra al guardar, igual que AdderDialog: es un formulario de "cargar
      // una novedad", no una lista abierta para seguir cargando de a una.
      onClose();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <h2 id="novedad-title">{editando ? 'Editar la novedad' : 'Nueva novedad'}</h2>
      </div>

      <div className="modal-body">
        <div className="field">
          {/* Es un prefijo corto, no una oración: se lee pegado al texto
              ("Novedad: ahora podés…"). */}
          <label htmlFor="nv-t">Título <span className="hint">(Novedad, Aviso…)</span></label>
          <input id="nv-t" type="text" maxLength={MAX_TITULO} autoComplete="off" value={form.titulo} onChange={set('titulo')} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="nv-d">Desde</label>
            <input id="nv-d" type="date" value={form.desde} onChange={set('desde')} />
          </div>
          <div className="field">
            {/* Este es el corte que no depende de nadie: pasada esta fecha la
                novedad no aparece más, la haya cerrado la familia o no. */}
            <label htmlFor="nv-h">Vence</label>
            <input id="nv-h" type="date" min={form.desde || undefined} value={form.hasta} onChange={set('hasta')} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="nv-x">Texto</label>
          <textarea id="nv-x" rows={3} maxLength={MAX_TEXTO} value={form.texto} onChange={set('texto')} />
          <span className="hint contador">{form.texto.length}/{MAX_TEXTO}</span>
        </div>

        {error && <p className="err">{error}</p>}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={onClose}>Cancelar</button>
        <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Publicar la novedad'}
        </button>
      </div>
    </>
  );
}

export default function NovedadDialog({ open, novedad, hoy, onClose, onGuardada }) {
  return (
    <Dialog open={open} onClose={onClose} id="novedad" labelledBy="novedad-title">
      <Cuerpo novedad={novedad} hoy={hoy} onClose={onClose} onGuardada={onGuardada} />
    </Dialog>
  );
}
