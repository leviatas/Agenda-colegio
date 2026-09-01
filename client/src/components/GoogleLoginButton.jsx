import { useEffect, useRef } from 'react';

// Google Identity Services se carga como <script> en runtime, NO como paquete
// de npm. Google sólo valida el ORIGEN (no hay redirect URI), así que cada
// origen desde el que se sirva el cliente tiene que estar en "Authorized
// JavaScript origins" del Client ID.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleLoginButton({ onCredential }) {
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
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => cbRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
      });
    }

    if (window.google) {
      render();
      return () => { vivo = false; };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.body.appendChild(script);

    return () => {
      vivo = false;
      script.onload = null;
    };
  }, []);

  if (!CLIENT_ID) {
    return <p className="err">Falta configurar VITE_GOOGLE_CLIENT_ID en client/.env</p>;
  }

  return <div ref={buttonRef} />;
}
