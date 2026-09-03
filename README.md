# Agenda San Gabriel

Calendario escolar del Colegio San Gabriel, ciclo lectivo 2026.

- **El calendario se ve sin cuenta.** El link se le pasa a las familias y abre
  directo. Se filtra por sala, grado o año, y la selección queda guardada.
- **Cada familia suma sus propias fechas, con cuenta o sin cuenta.** Sin entrar
  quedan guardadas en ese navegador; al entrar con Google pasan a la cuenta y
  aparecen igual en el celular y en la computadora. **Nadie más las ve**, salvo
  que la propia cuenta decida compartir un evento por link o todos por código
  (ver "Compartir eventos personales" en [`CLAUDE.md`](CLAUDE.md)).
- **Los emails de `ADMIN_EMAILS`** editan el calendario oficial desde
  `/oficial`. Nadie más.

Node + Express + Prisma/SQLite del lado del server, React + Vite del lado del
cliente, todo en Docker Compose detrás de nginx. El stack está documentado en
[`docs/nuevo-proyecto.md`](docs/nuevo-proyecto.md); las decisiones propias de
este repo, en [`CLAUDE.md`](CLAUDE.md).

## Puesta en marcha

### 1. Client ID de Google

En [Google Cloud Console](https://console.cloud.google.com/) → **APIs &
Services**:

1. **OAuth consent screen**: User Type `External`, completar nombre de app y
   emails. No hace falta agregar scopes (email y perfil ya vienen) ni pasar la
   revisión de Google. Mientras esté en modo *Testing*, agregá las cuentas de
   prueba; si no, **Publish App**.
2. **Credentials → + Create Credentials → OAuth client ID**, tipo `Web
   application`. En **Authorized JavaScript origins** van **todos** los orígenes
   desde los que se sirve el cliente:
   - `http://localhost:5173` (`npm run dev`)
   - `http://localhost:8099` (Docker Compose)
   - `https://agenda.tudominio.com` (el túnel de Cloudflare, si lo usás)

   **Authorized redirect URIs: ninguno.** Google Identity Services valida el
   origen, no un redirect.

Un origen que falte se manifiesta como un botón de Google que no renderiza o un
login que falla sin error visible; el mensaje real está en la consola del
browser.

### 2. Configuración

```bash
cp .env.example .env
```

Completá:

- `GOOGLE_CLIENT_ID` — el Client ID del paso anterior.
- `JWT_SECRET` — `openssl rand -hex 32`.
- `ADMIN_EMAILS` — quién puede editar el calendario oficial, separados por coma.

### 3. Migración inicial

Una sola vez, antes del primer build: el entrypoint del contenedor corre
`prisma migrate deploy`, que **aplica** migraciones pero no crea ninguna.

```bash
cd server && npm install && npx prisma migrate dev --name init && cd ..
```

(Este repo ya la trae generada en `server/prisma/migrations/`; el paso hace
falta sólo si cambiaste el schema.)

### 4. Arrancar

```bash
docker compose up -d --build
docker compose ps          # los dos servicios en "healthy"
docker compose logs -f server
```

Cliente en `http://localhost:8099`. Al arrancar, el server carga el calendario
oficial 2026 (152 eventos) desde `server/prisma/calendario-2026.json`. Entrá con
la cuenta de `ADMIN_EMAILS` y vas a ver el link **Editar el calendario**.

### Desarrollo sin Docker

```bash
cd server && cp .env.example .env && npm install && npx prisma migrate dev && npm run seed && npm run dev
cd client && cp .env.example .env && npm install && npm run dev
```

Completá `GOOGLE_CLIENT_ID` en `server/.env` y `VITE_GOOGLE_CLIENT_ID` en
`client/.env`.

## Publicar con Cloudflare Tunnel

Sin abrir puertos ni IP pública. Necesitás un dominio en Cloudflare (el plan
gratis alcanza).

1. [Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels →
   Create a tunnel** → conector **Cloudflared** → entorno **Docker**. Copiá el
   token (la cadena larga después de `--token`).
2. **Public Hostname** → `agenda.tudominio.com`, servicio **`http://client:80`**
   — el nombre del servicio en la red de Compose, **no** `localhost`.
3. En `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="el-token-que-copiaste"
   CLIENT_ORIGIN="https://agenda.tudominio.com"
   ```
   `CLIENT_ORIGIN` tiene que ser la URL pública exacta o el CORS del backend
   rechaza las requests.
4. Agregá ese mismo origen a "Authorized JavaScript origins" en Google Cloud.
5. `docker compose --profile cloudflare up -d --build`

Con el túnel andando podés sacar el bloque `ports:` del servicio `client` y la
app queda accesible **sólo** por Cloudflare.

## Deploy automático

Push a `main` → el runner self-hosted que corre en el mismo server ejecuta
`./deploy.sh`. Sin SSH ni credenciales guardadas en GitHub.

Instalación (una vez): GitHub → repo → Settings → Actions → Runners → *New
self-hosted runner*; después `sudo ./svc.sh install && sudo ./svc.sh start` para
que sobreviva a los reinicios. Definí la variable `DEPLOY_DIR` en Settings →
Secrets and variables → Actions → **Variables**, apuntando al clon del repo en
el server (ese clon tiene el `.env` con los secretos, que **no** está versionado
y hay que crear a mano la primera vez).

> ⚠️ `deploy.sh` hace `git reset --hard origin/main`: descarta commits locales y
> trabajo sin commitear en el checkout de producción. Para sólo rebuildear
> alcanza con `docker compose up -d --build`.

## Telemetría

Cuánta gente entra a la agenda se lee **en los logs del server**: cada carga de
la página deja una línea JSON con el prefijo `[telemetria]`. No hay base de
datos de visitas ni servicio externo, y **no se guarda ni el mail, ni la IP, ni
el user-agent**: cada navegador manda un id random propio, que sirve para no
contar diez veces a quien entra diez veces y no identifica a nadie.

```bash
# Todo lo que registró la telemetría
docker compose logs server | grep '\[telemetria\]'

# Visitantes distintos de hoy (la última línea del día ya trae el total)
docker compose logs server | grep '"evento":"visita"' | tail -1

# Visitantes distintos de toda la vida del log
docker compose logs --no-log-prefix server | sed -n 's/^\[telemetria\] //p' \
  | jq -r 'select(.evento == "visita") | .vid' | sort -u | wc -l

# Visitantes por día
docker compose logs --no-log-prefix server | sed -n 's/^\[telemetria\] //p' \
  | jq -r 'select(.evento == "visita") | "\(.dia) \(.vid)"' | sort -u \
  | cut -d' ' -f1 | uniq -c
```

Las líneas son de tres tipos:

| `evento` | Cuándo | Campos propios |
| --- | --- | --- |
| `visita` | Cada carga de la agenda | `vid` (navegador), `user` (cuenta o `null`), `nuevo` (primera vez del día), `visitasHoy`, `visitantesHoy`, `cuentasHoy` |
| `login` | Ingreso con Google | `user`, `nueva` (primer ingreso de esa cuenta), `admin` |
| `resumen` | Al cerrarse un día | `visitas`, `visitantes`, `cuentas` |

El día se corta a la medianoche de Argentina. Los acumulados viven en memoria
del proceso, así que un reinicio los reinicia: las líneas de `visita` son la
fuente de verdad, y `docker compose logs` sólo llega hasta donde llegue la
retención de logs de Docker. Para conservarlas más tiempo, redirigirlas a un
archivo (`docker compose logs -f server | grep '\[telemetria\]' >> visitas.log`).

## Comandos frecuentes

```bash
docker compose up -d --build        # rebuild + restart
docker compose logs -f server       # logs del backend
docker compose exec server sh       # shell adentro del contenedor
docker compose down                 # bajar (el volumen NO se toca)
docker compose down -v              # ⚠️ borra el volumen: se pierde la base
```

## Sobre `agenda-escolar-san-gabriel.html`

Es el prototipo del que salió el diseño: un solo archivo, sin backend, con los
eventos hardcodeados y todo en `localStorage`. Se conserva como referencia
visual — **no es la app**. Para cambiar estilos se toca
`client/src/styles.css`, y los eventos viven en la base.
