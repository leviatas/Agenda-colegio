// Nullish coalescing (NO ||): el build de Docker pasa VITE_API_URL="" a
// propósito para que el cliente llame same-origin /api/* (nginx lo proxea al
// server). "" es falsy, así que || volvería al default localhost:4000, que no
// es alcanzable desde afuera de la red de Docker. Este bug exacto rompe el
// login en Docker mientras anda bien con `npm run dev`. Si tocás este archivo,
// dejá el ??.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  loginWithGoogle: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  me: (token) => request('/auth/me', { token }),
  savePicks: (token, picks) => request('/auth/me/picks', { method: 'PUT', body: { picks }, token }),

  // El token es opcional a propósito: sin cuenta devuelve sólo el calendario
  // oficial, con cuenta suma los eventos personales de esa persona.
  eventos: (token) => request('/eventos', { token }),

  mios: {
    create: (token, data) => request('/eventos/mios', { method: 'POST', body: data, token }),
    update: (token, id, data) => request(`/eventos/mios/${id}`, { method: 'PUT', body: data, token }),
    remove: (token, id) => request(`/eventos/mios/${id}`, { method: 'DELETE', token }),
  },

  oficial: {
    list: (token) => request('/oficial', { token }),
    create: (token, data) => request('/oficial', { method: 'POST', body: data, token }),
    update: (token, id, data) => request(`/oficial/${id}`, { method: 'PUT', body: data, token }),
    remove: (token, id) => request(`/oficial/${id}`, { method: 'DELETE', token }),
  },
};
