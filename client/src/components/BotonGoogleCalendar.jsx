import IconoCalendario from './IconoCalendario';
import { urlGoogleCalendar } from '../lib/googleCalendar';

// El botón de "agregar a Google Calendar" que va al lado de cada evento (la
// grilla de meses, "Próximas fechas", la lista de personales y la página de un
// evento compartido).
//
// Es un <a> y no un <button> con window.open: así se puede abrir en otra
// pestaña, copiar el link o compartirlo con el menú del navegador, que es lo
// que se espera de algo que lleva a otro sitio. Va en target="_blank" para no
// perder la agenda al volver.
//
// `etiqueta` lo pasa de ícono solo (el default, para las filas de una lista) a
// botón con texto (una pantalla que muestra UN evento y tiene lugar de sobra).
export default function BotonGoogleCalendar({ evento, etiqueta = null, className = '' }) {
  const clases = [etiqueta ? 'mbtn gcal-txt' : 'gcal', className].filter(Boolean).join(' ');

  return (
    <a
      className={clases}
      href={urlGoogleCalendar(evento)}
      target="_blank"
      rel="noopener noreferrer"
      title="Agregar a Google Calendar"
      aria-label={`Agregar "${evento.title}" a Google Calendar`}
    >
      <IconoCalendario />
      {etiqueta}
    </a>
  );
}
