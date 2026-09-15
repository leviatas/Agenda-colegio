import { useEffect, useRef } from 'react';
import { CLIENT_ID, cargarGsi } from '../lib/gsi';

// Google sólo valida el ORIGEN (no hay redirect URI), así que cada origen desde
// el que se sirva el cliente tiene que estar en "Authorized JavaScript origins"
// del Client ID. El login pide sólo la identidad: el permiso de Google Calendar
// es aparte y opcional (lib/calendarioGoogle.js).

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
