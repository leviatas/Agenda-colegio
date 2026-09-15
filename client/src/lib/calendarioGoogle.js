// El permiso OPCIONAL para que la agenda mantenga un calendario "San Gabriel"
// en el Google Calendar de la cuenta (el trabajo real lo hace el server, ver
// server/src/lib/calendarioGoogle.js). Acá sólo se pide el permiso con el
// popup de Google —y únicamente cuando la persona toca "Dar permiso"— y se le
// pasa el código al server, que es quien lo canjea: el cliente nunca ve ni
// guarda un token de Google.
import { CLIENT_ID, cargarGsi } from './gsi';

// Se llama al abrir Configuración: sólo carga el script, no muestra ni pide
// nada. Hace falta porque el popup de Google tiene que abrirse en el mismo
// click, sin un await de por medio, o el navegador lo bloquea.
export function precargarGoogle() {
  return cargarGsi().catch(() => {
    /* sin red no hay botón que funcione; pedirPermisoCalendario lo dice */
  });
}

// Resuelve con el código, o con null si la persona cerró la ventana sin dar
// el permiso: no darlo es una opción válida, no un error.
export function pedirPermisoCalendario({ scope, email }) {
  return new Promise((resolver, rechazar) => {
    const oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
    if (!oauth2 || !CLIENT_ID) {
      rechazar(new Error('No se pudo cargar Google. Revisá la conexión y volvé a intentar.'));
      return;
    }

    const cliente = oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope,
      ux_mode: 'popup',
      // Que el popup arranque en la misma cuenta con la que se entró a la
      // agenda: si hay varias en el navegador, es la que corresponde.
      login_hint: email,
      callback: (r) => {
        // access_denied = tocó "Cancelar" en la pantalla de Google.
        if (r.error === 'access_denied') {
          resolver(null);
          return;
        }
        if (r.error || !r.code) {
          rechazar(new Error('Google no dio el permiso.'));
          return;
        }
        resolver(r.code);
      },
      error_callback: (e) => {
        if (e && e.type === 'popup_closed') {
          resolver(null);
          return;
        }
        if (e && e.type === 'popup_failed_to_open') {
          rechazar(new Error('El navegador bloqueó la ventana de Google. Habilitá las ventanas emergentes para este sitio.'));
          return;
        }
        rechazar(new Error('No se pudo pedir el permiso a Google.'));
      },
    });
    cliente.requestCode();
  });
}
