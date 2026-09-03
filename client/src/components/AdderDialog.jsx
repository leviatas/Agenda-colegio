import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useConfirm } from './ConfirmDialog';
import { api } from '../api';
import { esLocal } from '../lib/personales';
import { DESDE, HASTA, MES_AB, fmtHora, parse, textoHora, toInputHora } from '../lib/agenda';

const VACIO = { id: null, title: '', date: '', endDate: '', time: '', endTime: '' };

function Cuerpo({ onClose }) {
  const { user, token } = useAuth();
  const { personales, agregarMio, editarMio, borrarMio } = useEventos();
  const confirm = useConfirm();

  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Link recién generado para UN evento, para mostrar debajo de la lista en
  // vez de romper la grilla de cada fila con una segunda línea. Uno solo a la
  // vez: generar otro reemplaza al anterior.
  const [link, setLink] = useState(null); // { titulo, url }

  const editando = form.id !== null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    setError('');
    const title = form.title.trim();
    if (!title) return setError('Falta el título.');
    if (!form.date) return setError('Falta la fecha.');
    if (form.date < DESDE || form.date > HASTA) {
      return setError('Tiene que caer entre el 31/08 y el 31/12 de 2026.');
    }
    if (form.endDate && form.endDate < form.date) {
      return setError('La fecha de fin no puede ser anterior al inicio.');
    }
    if (form.endTime && !form.time) {
      return setError('Para poner una hora de fin hace falta la hora de inicio.');
    }
    // Sólo cuando empieza y termina el mismo día: en un tramo de varios días la
    // hora de fin es la del último día y puede ser más temprana que la de inicio.
    if (form.endTime && !form.endDate && form.endTime <= form.time) {
      return setError('La hora de fin tiene que ser posterior a la de inicio.');
    }

    const data = {
      title,
      date: form.date,
      endDate: form.endDate || null,
      // La hora se guarda en el formato de la agenda ('8.15'), no en el del
      // input ('08:15'), para que se muestre igual que los eventos oficiales.
      time: fmtHora(form.time),
      endTime: fmtHora(form.endTime),
    };

    setGuardando(true);
    try {
      if (editando) await editarMio(form.id, data);
      else await agregarMio(data);
      setForm(VACIO);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(ev) {
    const ok = await confirm({
      title: 'Borrar evento',
      message: `¿Borrar "${ev.title}"? No se puede deshacer.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarMio(ev.id);
      if (form.id === ev.id) setForm(VACIO);
      if (link && link.id === ev.id) setLink(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function editar(ev) {
    setError('');
    setForm({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      endDate: ev.endDate || '',
      time: toInputHora(ev.time),
      endTime: toInputHora(ev.endTime),
    });
  }

  // Genera el link y lo copia solo. Si el navegador no deja copiar (sin
  // permiso, o sin la API en un contexto no seguro), el link queda igual en el
  // input de abajo, seleccionable a mano — nunca es un error para la persona.
  async function compartir(ev) {
    setError('');
    try {
      const { token: evToken } = await api.mios.compartir(token, ev.id);
      const url = `${window.location.origin}/compartir/evento/${evToken}`;
      setLink({ id: ev.id, titulo: ev.title, url });
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        /* se copia a mano desde el input de abajo */
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const ordenados = [...personales].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <>
      <div className="modal-head">
        <h2 id="adder-title">{editando ? 'Editar evento' : 'Agregar evento'}</h2>
      </div>

      <div className="modal-body">
        <div className="field">
          <label htmlFor="ev-t">Título</label>
          <input id="ev-t" type="text" maxLength={90} autoComplete="off" value={form.title} onChange={set('title')} />
        </div>

        {/* Dos filas simétricas: arriba cuándo empieza, abajo cuándo termina.
            Las dos partes del final son independientes — un evento puede tener
            hora de fin sin durar varios días ("de 17 a 19"), o durar varios
            días sin hora ninguna. */}
        <div className="field-row">
          <div className="field">
            <label htmlFor="ev-d">Fecha</label>
            <input id="ev-d" type="date" min={DESDE} max={HASTA} value={form.date} onChange={set('date')} />
          </div>
          <div className="field">
            <label htmlFor="ev-h">Hora <span className="hint">(opcional)</span></label>
            <input id="ev-h" type="time" value={form.time} onChange={set('time')} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ev-e">Hasta <span className="hint">(opcional, si dura varios días)</span></label>
            <input id="ev-e" type="date" min={form.date || DESDE} max={HASTA} value={form.endDate} onChange={set('endDate')} />
          </div>
          <div className="field">
            <label htmlFor="ev-hh">Hora hasta <span className="hint">(opcional)</span></label>
            <input id="ev-hh" type="time" value={form.endTime} onChange={set('endTime')} />
          </div>
        </div>

        {error && <p className="err">{error}</p>}

        <div className="mine">
          {ordenados.length === 0 && <p className="none">Todavía no agregaste ninguno.</p>}
          {ordenados.length > 0 && (
            <ul>
              {ordenados.map((ev) => {
                const dt = parse(ev.date);
                return (
                  <li key={ev.id}>
                    <span className="md">
                      {dt.getDate()} {MES_AB[dt.getMonth()]}{ev.time ? ` · ${textoHora(ev)}` : ''}
                    </span>
                    <span className="mt">{ev.title}</span>
                    <button type="button" className="edit" aria-label={`Editar ${ev.title}`} onClick={() => editar(ev)}>
                      Editar
                    </button>
                    {/* Uno local (sin cuenta todavía) no tiene nada que
                        compartir: no existe en el server hasta que se migre.
                        Se deja un hueco vacío, no nada, porque la grilla de
                        acá abajo cuenta las columnas por fila. */}
                    {esLocal(ev.id) ? (
                      <span aria-hidden="true" />
                    ) : (
                      <button type="button" className="edit" aria-label={`Compartir ${ev.title}`} onClick={() => compartir(ev)}>
                        Compartir
                      </button>
                    )}
                    <button type="button" className="del" aria-label={`Borrar ${ev.title}`} onClick={() => borrar(ev)}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {link && (
          <div className="share-link">
            <p className="lede muted">
              Link de "{link.titulo}": se copió solo. Si no, pegalo a mano desde acá.
            </p>
            <div className="share-link-row">
              <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
              <button type="button" className="mbtn" onClick={() => setLink(null)}>Listo</button>
            </div>
          </div>
        )}

        {/* Sin cuenta los eventos quedan en este navegador, que alcanza para
            usar la agenda. El aviso cuenta lo que suma entrar —verlos en el
            celular y en la computadora—, no es una condición para cargarlos.
            El botón de Google vive arriba, en el encabezado, así que acá va el
            texto solo: dos botones de login en pantalla confunden. */}
        {!user && (
          <div className="nudge">
            <p className="lede muted">
              Tus eventos quedan guardados en este navegador. Si entrás con Google —el botón
              está arriba de todo— pasan a tu cuenta y los ves igual desde el celular y desde
              la computadora. Nadie más los ve, ni el colegio.
            </p>
          </div>
        )}

        {/* Compartir con otra cuenta hace falta login en los dos lados: sin
            eso no hay dónde guardar ni el código ni la copia que acepta la
            otra persona (ver CLAUDE.md, "Compartir eventos personales"). */}
        {user && <SeccionCompartir token={token} />}
      </div>

      <div className="modal-foot">
        <button className="mbtn" type="button" onClick={editando ? () => setForm(VACIO) : onClose}>
          {editando ? 'Cancelar' : 'Cerrar'}
        </button>
        <button className="mbtn primary" type="button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar'}
        </button>
      </div>
    </>
  );
}

// Compartir TODOS los eventos propios, en vivo, por código: quien lo canjea
// ve mezclados en su calendario los que ya tenías y los que cargues después,
// hasta que uno de los dos lo corte. Va aparte del resto de Cuerpo porque
// junta tres listas propias (código, quién me suscribió, a quién suscribí) que
// no le hacen falta a nada más del modal.
function SeccionCompartir({ token }) {
  const { cargar } = useEventos();
  const confirm = useConfirm();

  const [codigo, setCodigo] = useState(null); // null = todavía no se sabe
  const [suscriptores, setSuscriptores] = useState([]);
  const [suscripciones, setSuscripciones] = useState([]);
  const [ingreso, setIngreso] = useState('');
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

  // Todavía no contestaron las tres llamadas: nada que mostrar. No vale la
  // pena un "Cargando…" acá, el modal entero ya viene con eventos propios
  // arriba a la vista.
  if (codigo === null) return null;

  return (
    <div className="mine compartir">
      <h3>Compartir todos tus eventos</h3>
      <p className="lede muted">
        Generá un código y pasáselo a otra persona: mientras esté activo, tus eventos aparecen
        mezclados en su calendario (ella no puede editarlos ni borrarlos), y los que cargues de
        ahora en más también, sin compartir nada de nuevo.
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

      {error && <p className="err">{error}</p>}
      {aviso && <p className="lede muted">{aviso}</p>}
    </div>
  );
}

export default function AdderDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} id="adder" labelledBy="adder-title">
      <Cuerpo onClose={onClose} />
    </Dialog>
  );
}
