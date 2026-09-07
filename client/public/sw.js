// Service worker mínimo, sólo para el aviso push de "mañana tenés eventos" (ver
// server/src/lib/push.js y client/src/lib/push.js). No cachea nada de la app
// —no es un service worker de "app offline"—: sin push activo, este archivo
// no hace nada.

self.addEventListener('install', () => {
  // Sin esto, el SW nuevo espera a que se cierren todas las pestañas viejas
  // antes de activarse — y hasta entonces el navegador no tiene con qué
  // recibir el push.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let datos = { title: 'Agenda escolar', body: 'Mañana tenés eventos en la agenda.', url: '/' };
  if (event.data) {
    try {
      datos = { ...datos, ...event.data.json() };
    } catch (err) {
      /* payload no era JSON: se usa el texto tal cual como body */
      datos.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      // Mismo ícono en las dos: no hay uno de mayor resolución en el repo
      // todavía. Ver index.html para el resto de los favicons.
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: datos.url || '/' },
    }),
  );
});

// Tocar la notificación enfoca una pestaña ya abierta de la agenda si hay
// una, en vez de abrir siempre una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const abierta = lista.find((c) => new URL(c.url).origin === self.location.origin);
      if (abierta) return abierta.focus();
      return self.clients.openWindow(url);
    }),
  );
});
