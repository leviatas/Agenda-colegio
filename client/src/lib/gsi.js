// Google Identity Services se carga como <script> en runtime, NO como paquete
// de npm. Lo usan el botón de login (GoogleLoginButton) y el pedido del permiso
// de Google Calendar (lib/calendarioGoogle.js).
export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// El <script> se pide una sola vez para toda la app: el botón vuelve a
// renderizar cuando cambia de forma (al pasar a celular) y sin esto cada
// re-render que llegue antes de que cargue agregaría otra copia al documento.
let cargando = null;

export function cargarGsi() {
  if (window.google && window.google.accounts) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise((listo, falla) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => listo();
    script.onerror = () => {
      cargando = null;
      falla(new Error('No se pudo cargar el login de Google.'));
    };
    document.body.appendChild(script);
  });
  return cargando;
}
