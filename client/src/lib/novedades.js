// Las novedades que este navegador ya cerró, para no volver a mostrárselas.
//
// Con cuenta la marca vive en la base (NovedadCierre), que es lo que hace que
// cerrar el aviso en el celular lo cierre también en la compu. Pero acá se
// anota SIEMPRE, con cuenta o sin ella, por dos razones: sin sesión es el único
// lugar donde guardarla (mismo criterio que los eventos personales), y con
// sesión hace que la X se sienta instantánea sin esperar a la red. Lo que se
// muestra es la unión de las dos listas, así que una marca de más nunca hace
// reaparecer un aviso cerrado.
//
// Se guardan ids, no objetos: una novedad borrada por el admin deja acá un id
// que ya no matchea con nada y no molesta a nadie.

const KEY = 'sg-novedades-cerradas-v1';

// En modo privado localStorage tira tanto al leer como al escribir, y el JSON
// guardado puede estar roto. Sin almacenamiento la app funciona igual: los
// avisos se pueden cerrar y vuelven en la próxima carga, que es mucho mejor
// que una pantalla rota.
export function cerradasLocales() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    // Los ids del server son números; se filtra por las dudas de que haya
    // quedado basura de una versión anterior.
    return Array.isArray(v) ? v.filter((id) => typeof id === 'number') : [];
  } catch (err) {
    return [];
  }
}

export function marcarCerradaLocal(id) {
  const actuales = cerradasLocales();
  if (actuales.includes(id)) return actuales;
  const nuevas = [...actuales, id];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(nuevas));
  } catch (err) {
    /* sin almacenamiento: el aviso se cierra igual y vuelve en la próxima carga */
  }
  return nuevas;
}
