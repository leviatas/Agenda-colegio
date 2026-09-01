# Arrancar un proyecto nuevo con este stack

> 🇬🇧 English version: [`en/nuevo-proyecto.md`](./en/nuevo-proyecto.md)

Guía para levantar **otra aplicación** con la misma base que `director-tools`:
Node + Express + Prisma/SQLite del lado del server, React + Vite del lado del
cliente, login con Google, todo empaquetado en Docker Compose detrás de nginx,
publicado con Cloudflare Tunnel y desplegado con `deploy.sh` desde un runner
self-hosted.

Está escrita para copiar y pegar. En todos lados aparece **`miapp`** como
nombre del proyecto: reemplazalo por el tuyo (afecta nombres de paquete, del
volumen de Docker y de la carpeta de deploy, nada más).

Lo que **no** entra acá es el dominio de `director-tools` (temas, reuniones,
créditos, planificación estratégica, WhatsApp, el import/export de Excel). Eso
es negocio, no stack — ver [`whatsapp-conexion.md`](./whatsapp-conexion.md) si
lo que querés portar es la conexión de WhatsApp.

---

## 1. Qué te llevás

| Pieza | Elección | Por qué |
|---|---|---|
| Backend | Node 20 + Express 4, CommonJS | Sin build step, sin transpilar. |
| Base de datos | SQLite vía Prisma 5 | Un archivo. Backup = copiar el archivo. Migra a Postgres cambiando el `datasource` si algún día hace falta. |
| Auth | Google Identity Services en el browser → verificación del ID token con `google-auth-library` en el server → JWT propio de 7 días | El server nunca confía en la identidad que manda el cliente. |
| Frontend | React 18 + Vite 5 + react-router-dom 6 | SPA estática, servida por nginx. |
| Empaquetado | Docker Compose: `server` (node) + `client` (nginx) + `cloudflared` opcional | El puerto del server **no** se publica al host; nginx proxea `/api/*`. |
| Persistencia | Un volumen nombrado (`miapp_data`) con la `.db` y los uploads | Sobrevive a `docker compose up --build`. |
| Publicación | Cloudflare Tunnel (profile `cloudflare`) | Sin abrir puertos ni IP pública. |
| Deploy | `deploy.sh` + GitHub Actions en runner self-hosted | Push a `main` → rebuild en el server. |

**Dos paquetes independientes**, sin monorepo ni workspaces: `server/` y
`client/` tienen su propio `package.json` y se instalan por separado. Es una
decisión, no una omisión — mantiene los Dockerfiles simples y hace que el build
del cliente no arrastre las dependencias del server.

---

## 2. Estructura a crear

```
miapp/
├── .env.example
├── .gitattributes
├── .gitignore
├── deploy.sh
├── docker-compose.yml
├── .github/workflows/deploy.yml
├── server/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── package.json
│   ├── .env.example
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.js
│       ├── lib/prisma.js
│       ├── middleware/auth.js
│       └── routes/auth.js
└── client/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── .env.example
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── context/AuthContext.jsx
        └── components/GoogleLoginButton.jsx
```

---

## 3. Backend (`server/`)

### 3.1 `server/package.json`

```json
{
  "name": "miapp-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "google-auth-library": "^9.14.1",
    "jsonwebtoken": "^9.0.2",
    "multer": "^2.2.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4",
    "prisma": "^5.20.0"
  }
}
```

`multer` sólo si vas a tener adjuntos; sacalo si no.

### 3.2 `server/prisma/schema.prisma`

```prisma
generator client {
  provider      = "prisma-client-js"
  // "native" cubre el dev local (Windows/macOS/Debian); el target musl es
  // obligatorio para la imagen node:20-alpine del Dockerfile.
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// SQLite no tiene enums: Role y MembershipStatus son strings y los valores
// válidos se validan en la capa de aplicación (middleware/auth.js, routes/*).
//   Role:             "ADMIN" | "DIRECTOR" | "READER"
//   MembershipStatus: "PENDING" | "APPROVED" | "REJECTED"

model User {
  id           Int      @id @default(autoincrement())
  googleId     String   @unique
  email        String   @unique
  name         String
  avatarUrl    String?
  // Se setea desde ADMIN_EMAILS en cada login. Es lo único global: habilita
  // crear empresas. Para operar dentro de una igual hace falta Membership.
  isSuperAdmin Boolean  @default(false)
  createdAt    DateTime @default(now())

  memberships Membership[]
}

model Company {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())

  memberships Membership[]
}

// El rol y el estado de aprobación son POR EMPRESA, no globales.
model Membership {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  companyId Int
  company   Company @relation(fields: [companyId], references: [id])

  role      String   @default("DIRECTOR")
  status    String   @default("PENDING")
  createdAt DateTime @default(now())

  @@unique([userId, companyId])
}
```

> **Si tu app nueva es de una sola organización**, borrá `Company`/`Membership`
> y poné `role`/`status` en `User`. Es mucho más barato empezar simple que
> desarmar multi-tenancy después — pero si sospechás que va a haber más de un
> cliente en la misma instancia, arrancá con `Membership`: el retrofit obliga a
> tocar **toda** consulta de todo modelo (ver el migration `multi_tenant` de
> este repo).

Después de escribir el schema:

```bash
cd server
npx prisma migrate dev --name init
```

### 3.3 `server/src/lib/prisma.js`

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
```

Un solo cliente compartido para todo el proceso. No instancies `PrismaClient`
por archivo: cada instancia abre su propio pool.

### 3.4 `server/src/middleware/auth.js`

```js
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// El cliente manda con qué empresa está operando en el header X-Company-Id.
// Acá se valida la Membership y se cuelga en req.membership / req.company:
// el resto de la cadena lee el rol y el estado de AHÍ, nunca de req.user.
async function requireCompany(req, res, next) {
  const companyId = Number(req.headers['x-company-id']);
  if (!companyId) return res.status(400).json({ error: 'Falta la empresa (header X-Company-Id)' });

  const membership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: req.user.id, companyId } },
    include: { company: true },
  });
  if (!membership) return res.status(403).json({ error: 'No tenés acceso a esa empresa' });

  req.membership = membership;
  req.company = membership.company;
  next();
}

function requireApproved(req, res, next) {
  if (req.membership.status !== 'APPROVED') {
    return res.status(403).json({ error: 'Tu cuenta todavía no fue aprobada' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.membership.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Se requiere perfil de administrador' });
  }
  next();
}

// Solo lectura. Se aplica INLINE en cada ruta que escribe (POST/PUT/DELETE),
// nunca en un router.use(...), para que los GET sigan abiertos a cualquier
// membresía aprobada.
function requireWriter(req, res, next) {
  if (req.membership.role === 'READER') {
    return res.status(403).json({ error: 'Tu perfil es de solo lectura' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Se requiere perfil de superadmin' });
  }
  next();
}

module.exports = {
  signToken, requireAuth, requireCompany,
  requireApproved, requireAdmin, requireWriter, requireSuperAdmin,
};
```

**Cómo se usa en un router de datos:**

```js
router.use(requireAuth, requireCompany, requireApproved);

router.get('/', async (req, res) => {
  // SIEMPRE filtrando por la empresa activa.
  const items = await prisma.item.findMany({ where: { companyId: req.company.id } });
  res.json({ items });
});

router.get('/:id', async (req, res) => {
  // findFirst con companyId, NO findUnique: un id de otra empresa tiene que
  // dar 404, no devolver la fila.
  const item = await prisma.item.findFirst({
    where: { id: Number(req.params.id), companyId: req.company.id },
  });
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json({ item });
});

router.post('/', requireWriter, async (req, res) => { /* ... */ });
```

### 3.5 `server/src/routes/auth.js`

```js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function serializeUser(user) {
  return {
    id: user.id, email: user.email, name: user.name,
    avatarUrl: user.avatarUrl, isSuperAdmin: user.isSuperAdmin,
  };
}

async function loadMemberships(userId) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { company: { name: 'asc' } },
  });
  return rows.map((m) => ({
    id: m.id, companyId: m.companyId, companyName: m.company.name,
    role: m.role, status: m.status,
  }));
}

// El cliente obtiene el ID token con Google Identity Services y lo manda acá.
// El login NO otorga acceso a ninguna empresa: sólo crea/actualiza el User.
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Falta el credential de Google' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Token de Google inválido' });
  }
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'No se pudo verificar la cuenta de Google' });
  }

  const email = payload.email.toLowerCase();
  const isSuperAdmin = ADMIN_EMAILS.includes(email);

  let user =
    (await prisma.user.findUnique({ where: { googleId: payload.sub } })) ||
    (await prisma.user.findUnique({ where: { email } }));

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: payload.sub, email, name: payload.name || email,
        avatarUrl: payload.picture, isSuperAdmin,
      },
    });
  } else if (isSuperAdmin !== user.isSuperAdmin || user.googleId !== payload.sub) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { isSuperAdmin, googleId: payload.sub, avatarUrl: payload.picture },
    });
  }

  res.json({
    token: signToken(user),
    user: serializeUser(user),
    memberships: await loadMemberships(user.id),
  });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: serializeUser(req.user),
    memberships: await loadMemberships(req.user.id),
  });
});

module.exports = router;
```

**El deadlock del bootstrap.** Si el superadmin pide acceso a una empresa que
todavía no tiene ningún admin aprobado, queda `PENDING` esperando una
aprobación que nadie puede dar. Dos formas de evitarlo, poné las dos:

- que `POST /companies/:id/join` cree la membresía directamente
  `ADMIN`/`APPROVED` cuando `user.isSuperAdmin`, y
- una función `ensureSuperAdminMemberships(user)` llamada desde `/auth/google`
  y `/auth/me` que ascienda a `ADMIN`/`APPROVED` toda membresía `PENDING` de un
  superadmin (así una que ya quedó trabada se destraba sola en el próximo
  request, sin tocar la base a mano). **Sólo las `PENDING`**: una `REJECTED` es
  una decisión explícita de un admin de esa empresa y no se pisa.

### 3.6 `server/src/index.js`

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');

// Fallar temprano y con un mensaje claro: sin estas dos variables la app
// arranca igual y recién falla en el primer login, que es mucho peor de
// diagnosticar.
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en las variables de entorno. Revisá server/.env');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('Falta GOOGLE_CLIENT_ID en las variables de entorno. Revisá server/.env');
  process.exit(1);
}

const app = express();

// Un solo origen, no un wildcard. Tiene que coincidir exactamente con la URL
// desde la que el browser carga el cliente.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Lo usa el HEALTHCHECK del Dockerfile.
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
```

### 3.7 `server/.env.example`

```bash
DATABASE_URL="file:./dev.db"

# OAuth client ID de Google Cloud Console (Credentials > OAuth 2.0 Client IDs)
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"

# String largo al azar para firmar los JWT. Generalo con: openssl rand -hex 32
JWT_SECRET="change-me"

# Emails separados por coma que quedan como superadmin en el primer login.
ADMIN_EMAILS="vos@gmail.com"

PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

### 3.8 `server/docker-entrypoint.sh`

```sh
#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node src/index.js
```

`migrate deploy` (no `migrate dev`): aplica las migraciones ya generadas, no
crea ninguna y no pregunta nada. Es lo correcto en un contenedor.

### 3.9 `server/Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# El musl de Alpine ubica OpenSSL con un nombre/layout que el engine de Prisma
# no autodetecta; sin esto Prisma cae a un binario que no corresponde y
# revienta al arrancar ("Could not parse schema engine response").
RUN apk add --no-cache openssl

# tzdata: sin la base de zonas horarias la variable TZ no resuelve y el
# proceso queda en UTC.
RUN apk add --no-cache tzdata

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY docker-entrypoint.sh ./
# Normaliza los finales de línea por si el archivo se checkouteó con CRLF
# (Windows): un shebang con \r hace que el shell busque "/bin/sh\r" y Docker
# lo reporta como "no such file or directory".
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
```

El orden de los `COPY` importa: `package*.json` primero para que la capa del
`npm ci` se cachee y no se reinstale con cada cambio de código.

---

## 4. Frontend (`client/`)

### 4.1 `client/package.json`

```json
{
  "name": "miapp-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.6"
  }
}
```

### 4.2 `client/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

// createRequire en vez de `import ... with { type: 'json' }`: los import
// attributes necesitan Node 20.10+, y este archivo lo corre el Node que haya
// en la imagen del build.
const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [react()],
  // La versión sale del package.json en tiempo de build: no hay endpoint que
  // la devuelva ni configuración de runtime para la SPA.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { port: 5173 },
});
```

### 4.3 `client/src/api.js`

```js
// Nullish coalescing (NO ||): el build de Docker pasa VITE_API_URL="" a
// propósito para que el cliente llame same-origin /api/* (nginx lo proxea al
// server). "" es falsy, así que `||` volvería al default localhost:4000, que
// no es alcanzable desde afuera de la red de Docker. Este bug exacto rompía
// el login en Docker mientras andaba bien con `npm run dev`.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Multi-empresa: en vez de agregar companyId a la firma de cada función (y
// tocar cada llamador), AuthContext avisa acá cuál es la empresa activa y
// todas las requests mandan el header.
let activeCompanyId = null;
function setActiveCompanyId(id) {
  activeCompanyId = id || null;
}
function companyHeaders() {
  return activeCompanyId ? { 'X-Company-Id': String(activeCompanyId) } : {};
}

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...companyHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// Los uploads no pasan por request(): no llevan Content-Type JSON. Igual
// necesitan el Authorization, así que tampoco alcanza un <form> común.
async function upload(path, file, token) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...companyHeaders() },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  setActiveCompanyId,
  loginWithGoogle: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  me: (token) => request('/auth/me', { token }),
  upload,
};
```

### 4.4 `client/src/components/GoogleLoginButton.jsx`

Google Identity Services se carga como `<script>` en runtime, **no** como
paquete de npm.

```jsx
import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleLoginButton({ onCredential }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    function render() {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill',
      });
    }

    if (window.google) { render(); return; }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.body.appendChild(script);
    return () => { script.onload = null; };
  }, [onCredential]);

  if (!CLIENT_ID) {
    return <p className="error-text">Falta configurar VITE_GOOGLE_CLIENT_ID en client/.env</p>;
  }
  return <div ref={buttonRef} />;
}
```

### 4.5 `client/src/context/AuthContext.jsx` (lo esencial)

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'miapp_token';
const COMPANY_KEY = 'miapp_company_id';

function pickCompanyId(memberships, storedId) {
  if (memberships.length === 0) return null;
  if (storedId && memberships.some((m) => m.companyId === storedId)) return storedId;
  const approved = memberships.find((m) => m.status === 'APPROVED');
  return (approved || memberships[0]).companyId;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [companyId, setCompanyId] = useState(() => {
    const initial = Number(localStorage.getItem(COMPANY_KEY)) || null;
    // Sincrónico a propósito (no en un useEffect): api.js necesita saber la
    // empresa activa ANTES de que se monten los hijos. Los efectos de los
    // hijos corren antes que los del padre, así que su primera carga de datos
    // saldría sin X-Company-Id.
    api.setActiveCompanyId(initial);
    return initial;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) localStorage.setItem(COMPANY_KEY, String(companyId));
    else localStorage.removeItem(COMPANY_KEY);
  }, [companyId]);

  const applyMemberships = useCallback((next) => {
    setMemberships(next);
    setCompanyId((current) => {
      const picked = pickCompanyId(next, current);
      api.setActiveCompanyId(picked);
      return picked;
    });
  }, []);

  useEffect(() => {
    if (!token) { setUser(null); setMemberships([]); setLoading(false); return; }
    api.me(token)
      .then(({ user, memberships }) => { setUser(user); applyMemberships(memberships); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, [token, applyMemberships]);

  const loginWithCredential = useCallback(async (credential) => {
    const { token: newToken, user: newUser, memberships: next } = await api.loginWithGoogle(credential);
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken); setUser(newUser); applyMemberships(next);
  }, [applyMemberships]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null); setUser(null); setMemberships([]);
  }, []);

  const activeMembership = memberships.find((m) => m.companyId === companyId) || null;

  return (
    <AuthContext.Provider
      value={{ token, user, memberships, activeMembership, companyId, setCompanyId, loading, loginWithCredential, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

Las lecturas de `localStorage` conviene envolverlas en `try/catch`: en modo
privado pueden tirar.

### 4.6 `client/src/App.jsx` — el gate de routing

Tres estados, en este orden:

```jsx
export default function App() {
  const { user, activeMembership, loading } = useAuth();

  if (loading) return <p>Cargando…</p>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  // Cubre "sin ninguna empresa todavía" y "pendiente/rechazado en la activa".
  if (!activeMembership || activeMembership.status !== 'APPROVED') {
    return <Routes><Route path="*" element={<AccountStatus />} /></Routes>;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/admin"
          element={activeMembership.role === 'ADMIN' ? <Admin /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

Este gate es **UI, no seguridad**. Todo lo que esconde tiene que estar además
cerrado del lado del server con la cadena de middleware.

### 4.7 `client/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Proxy al backend: desde el browser es same-origin, así que no hay
    # preflight de CORS.
    location /api/ {
        proxy_pass http://server:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Fallback de SPA para el routing del lado del cliente.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`http://server:4000` es el nombre del servicio en la red de Compose, no
`localhost`. Si vas a subir archivos grandes, agregá
`client_max_body_size 25m;` — el default de nginx es 1 MB y un upload más
grande muere con un 413 antes de llegar al server.

### 4.8 `client/Dockerfile`

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Se hornean en el bundle estático en tiempo de build. VITE_API_URL va vacío
# para que la app llame same-origin /api/*, que nginx proxea al servicio
# server — sin CORS y sin hardcodear host/puerto del backend.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL=""
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1
```

**No hay configuración de runtime para la SPA.** Todo `VITE_*` queda fijo en el
bundle: cambiar el Client ID o el origen es rebuildear la imagen del cliente.

### 4.9 `client/.env.example`

```bash
VITE_GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
VITE_API_URL="http://localhost:4000"
```

Sólo para `npm run dev`. En Docker los valores llegan por `build.args`.

---

## 5. Raíz del repo

### 5.1 `docker-compose.yml`

```yaml
services:
  server:
    build: ./server
    environment:
      DATABASE_URL: file:/app/data/prod.db
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in .env}
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env}
      ADMIN_EMAILS: ${ADMIN_EMAILS:-vos@gmail.com}
      CLIENT_ORIGIN: ${CLIENT_ORIGIN:-http://localhost:8099}
      PORT: 4000
      TZ: ${TZ:-America/Argentina/Buenos_Aires}
    volumes:
      - miapp_data:/app/data
    restart: unless-stopped

  client:
    build:
      context: ./client
      args:
        VITE_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in .env}
    ports:
      - "${CLIENT_PORT:-8099}:80"
    depends_on:
      - server
    restart: unless-stopped

  # Opcional: expone la app a internet por un Cloudflare Tunnel, sin abrir
  # puertos ni hacer port-forwarding en el host. Deshabilitado salvo que
  # pidas el profile explícitamente:
  #   docker compose --profile cloudflare up -d --build
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?Set CLOUDFLARE_TUNNEL_TOKEN in .env}
    depends_on:
      - client
    restart: unless-stopped
    profiles:
      - cloudflare

volumes:
  miapp_data:
```

Cuatro cosas que valen la pena mirar dos veces:

1. **El server no publica ningún puerto.** Sólo es alcanzable desde la red de
   Compose, o sea desde nginx. La única puerta al host es `CLIENT_PORT`.
2. **`${VAR:?mensaje}`** hace que `docker compose up` falle con ese mensaje si
   la variable falta, en vez de arrancar con un valor vacío y romper en el
   primer login.
3. **`DATABASE_URL` apunta al volumen** (`/app/data/prod.db`), no al `dev.db`
   del repo. Lo que quede fuera de `/app/data` se pierde en cada rebuild —
   incluidos los uploads, así que guardalos ahí (`/app/data/uploads/...`).
4. **`TZ`** es la zona del proceso. Si vas a agendar cosas a una hora de pared
   ("a las 9:00") para clientes en husos distintos, `TZ` no alcanza: es una
   sola para toda la instancia. Guardá un offset por organización y calculá con
   eso (en este repo, `Company.utcOffset` + `server/src/lib/timezone.js`).

### 5.2 `.env.example`

```bash
# Lo usa `docker compose` para buildear y correr ambos servicios.
# Copialo a .env antes de arrancar: cp .env.example .env

# OAuth client ID de Google Cloud Console. Lo usan el backend (para verificar
# los ID token) y el build del frontend (para el botón de login).
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"

# String largo al azar para firmar los JWT. Generalo con: openssl rand -hex 32
JWT_SECRET="change-me"

# Emails separados por coma que quedan como superadmin en el primer login.
ADMIN_EMAILS="vos@gmail.com"

# Origen público desde el que se sirve el cliente (para el CORS del backend).
CLIENT_ORIGIN="http://localhost:8099"

# Puerto del host donde se publica el cliente (nginx).
CLIENT_PORT=8099

# Zona horaria del proceso del backend.
TZ="America/Argentina/Buenos_Aires"

# Sólo si corrés el profile "cloudflare". Creá el túnel en
# https://one.dash.cloudflare.com/ -> Networks -> Tunnels -> Create a tunnel
# -> connector "Docker", y copiá el token del comando que te muestra (la
# cadena larga después de --token).
CLOUDFLARE_TUNNEL_TOKEN=

# Para no pasar --profile en cada comando, descomentá:
# COMPOSE_PROFILES=cloudflare
```

### 5.3 `.gitignore`

```gitignore
node_modules/
dist/
build/

# Variables de entorno
.env
.env.local

# Base SQLite de desarrollo
server/prisma/dev.db
server/prisma/dev.db-journal

# Uploads del dev local (en Docker esto vive en el volumen miapp_data)
server/data/

# Logs
npm-debug.log*
*.log

.DS_Store
```

Chequeá que no se te cuele el JSON del client secret de Google si lo bajaste a
la carpeta del repo.

### 5.4 `.gitattributes`

```gitattributes
* text=auto eol=lf

*.sh text eol=lf
```

Sin esto, un checkout en Windows convierte `docker-entrypoint.sh` y `deploy.sh`
a CRLF y el contenedor falla con un "no such file or directory" que apunta al
shebang y no dice nada útil. El `sed -i 's/\r$//'` del Dockerfile es el
cinturón; esto son los tiradores.

### 5.5 `deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Fetching latest changes..."
git fetch origin main

echo "==> Checking out main..."
git checkout main

echo "==> Resetting to origin/main..."
git reset --hard origin/main

echo "==> Rebuilding and restarting containers..."
docker compose up -d --build

echo "==> Done."
```

```bash
chmod +x deploy.sh
```

> ⚠️ **`git reset --hard` descarta commits locales y trabajo sin commitear** en
> el checkout de producción. Es el camino de actualización, no un atajo para
> rebuildear: para eso alcanza con `docker compose up -d --build`.

### 5.6 `.github/workflows/deploy.yml`

Push a `main` → el runner self-hosted que corre **en el mismo server** ejecuta
`deploy.sh`. No hay SSH ni credenciales de servidor guardadas en GitHub.

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: self-hosted
    timeout-minutes: 40 # los builds en ARM son lentos
    steps:
      - name: Deploy con deploy.sh
        run: |
          DEPLOY_DIR="${{ vars.DEPLOY_DIR }}"
          DEPLOY_DIR="${DEPLOY_DIR:-$HOME/miapp}"
          if [ ! -d "$DEPLOY_DIR/.git" ]; then
            echo "::error::No existe un repo git en $DEPLOY_DIR. Configurá la variable DEPLOY_DIR en GitHub (Settings → Secrets and variables → Actions → Variables)."
            exit 1
          fi
          cd "$DEPLOY_DIR"
          chmod +x ./deploy.sh
          ./deploy.sh
```

- **`concurrency` con `cancel-in-progress: false`**: dos pushes seguidos hacen
  dos deploys en fila, nunca dos `docker compose up --build` pisándose.
- **El job no hace `checkout`**: trabaja sobre el clon que ya vive en
  `DEPLOY_DIR`, que es el que tiene el `.env` con los secretos. Ese `.env`
  **no** está en el repo y hay que crearlo a mano la primera vez.

**Instalar el runner** (una vez, en el server): GitHub → repo → Settings →
Actions → Runners → *New self-hosted runner*, seguí los comandos que muestra y
después instalalo como servicio (`sudo ./svc.sh install && sudo ./svc.sh start`)
para que sobreviva a los reinicios. Definí la variable `DEPLOY_DIR` en
Settings → Secrets and variables → Actions → **Variables**.

---

## 6. Credenciales de Google OAuth

Viven **fuera del repo**, en Google Cloud Console.

1. [console.cloud.google.com](https://console.cloud.google.com/) → selector de
   proyectos → **New Project**.
2. **APIs & Services → OAuth consent screen**: User Type `External` (o
   `Internal` si tenés Workspace y lo querés limitar a tu organización).
   Completá nombre de app, email de soporte y email del desarrollador. En
   "Scopes" no hace falta agregar nada: email y perfil básico ya vienen. En
   "Test users" agregá las cuentas que van a probar mientras la app esté en
   modo *Testing*, o hacé **Publish App** — no necesitás pasar la revisión de
   Google porque sólo pedís email y perfil.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - **Application type**: `Web application`.
   - **Authorized JavaScript origins**: **todos** los orígenes desde los que se
     va a servir el cliente. Típicamente los tres:
     - `http://localhost:5173` (`npm run dev`)
     - `http://localhost:8099` (Docker Compose)
     - `https://miapp.tudominio.com` (el túnel de Cloudflare)
   - **Authorized redirect URIs**: ninguno. Google Identity Services valida el
     **origen**, no un redirect.
4. Copiá el Client ID a `GOOGLE_CLIENT_ID` (raíz y `server/.env`) y a
   `VITE_GOOGLE_CLIENT_ID` (`client/.env`).

Un origen que falte en esa lista se manifiesta como un botón de Google que no
renderiza o un login que falla sin error claro en la app — el mensaje real está
en la consola del browser.

---

## 7. Publicar con Cloudflare Tunnel

Necesitás un dominio agregado a Cloudflare (el plan gratis alcanza).

1. **Creá el túnel.** [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
   → **Networks → Tunnels → Create a tunnel** → conector **Cloudflared** →
   nombre (ej. `miapp`) → entorno **Docker**. Del comando que te muestra copiá
   sólo el token (la cadena larga después de `--token`).
2. **Public Hostname.** En la pestaña del túnel, agregá un hostname
   (`miapp.tudominio.com`) con servicio **`http://client:80`** — el nombre del
   servicio en la red interna de Compose, **no** `localhost` ni una IP.
3. **Completá `.env`:**
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="el-token-que-copiaste"
   CLIENT_ORIGIN="https://miapp.tudominio.com"
   ```
   `CLIENT_ORIGIN` tiene que ser la URL pública o el CORS del backend rechaza
   las requests.
4. **Agregá ese mismo origen** a "Authorized JavaScript origins" en Google
   Cloud Console (sección 6).
5. **Levantá con el profile:**
   ```bash
   docker compose --profile cloudflare up -d --build
   ```

El contenedor `cloudflared` abre una conexión **saliente** hacia Cloudflare: no
hace falta publicar ningún puerto en el host ni tener IP pública. Sin
`--profile cloudflare` el servicio ni siquiera se crea, así que podés dejar el
token vacío mientras no lo uses.

Con el túnel andando podés dejar de publicar `CLIENT_PORT` al host (sacá el
bloque `ports:` del servicio `client`) y la app queda accesible **sólo** por
Cloudflare.

---

## 8. Primer arranque

```bash
# En el server (o en tu máquina)
git clone <repo> miapp && cd miapp
cp .env.example .env
# Completá GOOGLE_CLIENT_ID y JWT_SECRET (openssl rand -hex 32)

docker compose up -d --build
docker compose ps          # los dos servicios en "healthy"
docker compose logs -f server
```

Cliente en `http://localhost:8099`. Entrá con la cuenta que pusiste en
`ADMIN_EMAILS`: queda como superadmin, crea la primera empresa y desde ahí
aprueba al resto.

Comandos que vas a usar seguido:

```bash
docker compose up -d --build        # rebuild + restart
docker compose logs -f server       # logs del backend
docker compose exec server sh       # shell adentro del contenedor
docker compose down                 # bajar (el volumen NO se toca)
docker compose down -v              # ⚠️ borra el volumen: se pierde la base
```

Desarrollo sin Docker:

```bash
cd server && cp .env.example .env && npm install && npx prisma migrate dev --name init && npm run dev
cd client && cp .env.example .env && npm install && npm run dev
```

---

## 9. Trampas conocidas

Cada una de éstas costó una sesión de debugging en `director-tools`.

| Trampa | Síntoma | Qué hacer |
|---|---|---|
| `\|\|` en vez de `??` en `API_URL` | "Failed to fetch" en el login, sólo en Docker; anda bien con `npm run dev` | `import.meta.env.VITE_API_URL ?? 'http://localhost:4000'`. El `""` del build de Docker es falsy. |
| `binaryTargets` de Prisma sin el target musl | El contenedor muere al arrancar con un error de engine | `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` **y** `apk add openssl`. Las dos cosas. |
| `CLIENT_ORIGIN` distinto de la URL real | Errores de CORS después de poner el túnel | Un solo origen exacto, sin barra final, actualizado cuando cambia la URL pública. |
| Entrypoint con CRLF | `exec ./docker-entrypoint.sh: no such file or directory` | `.gitattributes` con `eol=lf` + el `sed -i 's/\r$//'` del Dockerfile. |
| Datos fuera del volumen | Todo se pierde en cada `--build` | La `.db` y los uploads en `/app/data`, mapeado a un volumen nombrado. |
| Origen faltante en Google Cloud | El botón de Google no renderiza, o el login falla en silencio | Los tres orígenes (dev, docker, público) en "Authorized JavaScript origins". |
| Confiar en el gate de routing del cliente | Un usuario puede pedir cualquier endpoint con `curl` y el token | Middleware server-side en toda ruta protegida. El gate del cliente es sólo UI. |
| `findUnique` por id sin `companyId` | Un id de otra empresa devuelve la fila | `findFirst({ where: { id, companyId } })` para que dé 404. |
| `requireWriter` en un `router.use(...)` | Un `READER` no puede ni leer | Va **inline** en cada POST/PUT/DELETE. |
| `orderBy` sobre un "enum" string de SQLite | El orden es alfabético: `HIGH, LOW, MEDIUM` | Mapeá el valor a un rank y ordená por eso. |
| `migrate dev` en producción | Se cuelga esperando una confirmación interactiva | `migrate deploy` en el entrypoint. Siempre. |
| Migración que agrega una columna requerida a una tabla con datos | `migrate dev` se planta por pérdida de datos | `prisma migrate dev --create-only`, editás el SQL a mano para backfillear, y recién ahí aplicás. |
| `client_max_body_size` de nginx en el default | Upload > 1 MB devuelve 413 sin llegar al server | Subilo en `nginx.conf` si la app maneja archivos. |
| Estado en memoria del proceso | Se rompe con más de una réplica | Este stack asume **una sola instancia** del backend. Si eso deja de valer, ese estado tiene que ir a la base. |

---

## 10. Convenciones que conviene copiar

No son técnicas, pero es lo que mantiene el repo mantenible.

- **Versionado en cada cambio.** `MAJOR.MINOR.PATCH` en `client/package.json`
  **y** `server/package.json`, siempre en el mismo número (no hay script que
  los sincronice: se editan los dos a mano). El del cliente se inyecta como
  `__APP_VERSION__` y se muestra en el footer; el del server va en los nombres
  de archivo de backup. MAJOR = rompe compatibilidad (migración no reversible,
  cambio de API o de `.env`); MINOR = funcionalidad nueva compatible; PATCH =
  bugs, estilos, refactors. Los cambios sólo de documentación no suben nada.
- **Un `CLAUDE.md` en la raíz** que explique **por qué** están tomadas las
  decisiones no obvias, no qué hace cada archivo. Es lo que evita que la
  próxima sesión (humana o no) "arregle" el `??` de `api.js`.
- **`docs/` en dos idiomas**, mismo nombre de archivo en `docs/` (español) y
  `docs/en/` (inglés). Si tocás uno, tocá el otro.
- **Idioma de la UI.** Acá todo lo que ve el usuario está en castellano
  rioplatense, rutas incluidas (`/reuniones`, `/proyectos`), y los
  identificadores del código quedan en inglés. Elegí una convención y anotala.
- **Confirmación propia para acciones destructivas**, no `window.confirm`: el
  diálogo nativo lo silencia Chrome de Android después de varios seguidos y
  dentro de un WebView puede no mostrarse nunca, devolviendo un default — o
  sea, un borrado que sale sin que nadie haya visto la pregunta.

---

## 11. Checklist

```
[ ] Estructura de carpetas creada
[ ] server/: package.json, schema.prisma, .env.example, src/{index,lib,middleware,routes}
[ ] npx prisma migrate dev --name init corrido
[ ] client/: package.json, vite.config.js, index.html, nginx.conf, src/{api,App,main,context,components}
[ ] Dockerfiles de server y client
[ ] docker-entrypoint.sh con migrate deploy + chmod +x
[ ] docker-compose.yml con el volumen nombrado y SIN publicar el puerto del server
[ ] .env.example, .gitignore, .gitattributes (eol=lf)
[ ] deploy.sh + chmod +x
[ ] .github/workflows/deploy.yml + runner self-hosted instalado + variable DEPLOY_DIR
[ ] Client ID de Google creado, con los tres orígenes autorizados
[ ] .env completo en el server de producción (NO está en el repo)
[ ] Túnel de Cloudflare creado, hostname apuntando a http://client:80
[ ] CLIENT_ORIGIN = URL pública
[ ] docker compose --profile cloudflare up -d --build
[ ] Login probado con la cuenta de ADMIN_EMAILS
[ ] CLAUDE.md escrito con las decisiones no obvias
```
