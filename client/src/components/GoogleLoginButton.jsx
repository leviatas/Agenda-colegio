import { useEffect, useRef } from 'react';

// Google Identity Services se carga como <script> en runtime, NO como paquete
// de npm. Google sólo valida el ORIGEN (no hay redirect URI), así que cada
// origen desde el que se sirva el cliente tiene que estar en "Authorized
// JavaScript origins" del Client ID.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// El <script> se pide una sola vez para toda la app: el efecto vuelve a correr
// cuando cambia la forma del botón (al pasar a celular) y sin esto cada
// re-render que llegue antes de que cargue agregaría otra copia al documento.
let cargando = null;

function cargarGsi() {
  if (window.google) return Promise.resolve();
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

export default function GoogleLoginButton({ onCredential, tipo = 'standard', tema = 'outline', tamano = 'large' }) {
  const buttonRef = useRef(null);

  // El callback se guarda en una ref y el efecto no lo tiene como dependencia:
  // el padre lo redefine en cada render, y con [onCredential] el efecto volvía
  // a correr y renderButton dibujaba OTRO botón encima del anterior.
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let vivo = true;

    function render() {
      if (!vivo || !window.google || !buttonRef.current) return;
      // renderButton AGREGA un botón, no reemplaza el que hubiera: al cambiar
      // de forma (pasar a celular) sin vaciar el contenedor quedan los dos,
      // uno arriba del otro.
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => cbRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: tema,
        size: tamano,
        type: tipo,
        text: 'signin_with',
        shape: 'pill',
      });
    }

    cargarGsi().then(render).catch(() => {
      /* sin red no hay botón: la agenda se usa igual sin cuenta */
    });

    return () => { vivo = false; };
  }, [tipo, tema, tamano]);

  if (!CLIENT_ID) {
    return <p className="err">Falta configurar VITE_GOOGLE_CLIENT_ID en client/.env</p>;
  }

  return <div ref={buttonRef} />;
}
