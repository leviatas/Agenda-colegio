# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repo.

## Qué es esto

Agenda escolar del Colegio San Gabriel, ciclo lectivo 2026 (septiembre a
diciembre). El calendario oficial se ve **sin cuenta**: el link se le pasa a las
familias y tiene que abrir directo. **Sumar eventos propios ("cumple de la
abuela") tampoco pide cuenta**: sin sesión quedan en el `localStorage` de ese
navegador. Entrar con Google sirve para dos cosas:

- **cualquier cuenta** pasa sus eventos propios a la base, así aparecen igual en
  el celular y en la computadora y no se pierden si se limpia el navegador. Los
  que ya estaban en el navegador se suben solos en el primer ingreso (ver
  "Eventos personales: navegador o cuenta"). **Nadie más los ve**, ni el
  colegio, salvo que la propia cuenta decida compartirlos (ver "Compartir
  eventos personales") — eso es opt-in y explícito, no cambia el default;
- **los emails de `ADMIN_EMAILS`** (hoy `leviatas@gmail.com`) además pueden
  editar el calendario oficial en `/oficial` y ver en `/usuarios` la lista de
  cuentas que entraron con Google (nombre, mail, si es admin y desde cuándo).
  Esa lista **no** muestra los eventos personales de nadie, ni cuántos tiene
  cada uno: son privados también para el admin.

No hay aprobación ni alta manual: la primera vez que alguien entra con Google
queda habilitado. `isAdmin` sale siempre de `ADMIN_EMAILS` y se recalcula en
cada login, así que sacar un mail de la variable le baja el permiso en el
siguiente ingreso.

**Una sola organización**, a diferencia del stack genérico de
[`docs/nuevo-proyecto.md`](docs/nuevo-proyecto.md): no hay `Company` ni
`Membership`, y el único rol es `User.isAdmin`. Si algún día entra otro colegio
en la misma instancia hay que retrofitear multi-tenancy, que obliga a tocar
**toda** consulta de todo modelo — ver la sección 3.2 de ese documento antes de
empezar.

Dos servicios, sin monorepo — cada uno con su `package.json`, instalados y
corridos por separado:

- `server/` — Node.js + Express, SQLite vía Prisma, login con Google (verifica
  el ID token en el server con `google-auth-library`, nunca confía en la
  identidad que manda el cliente), sesión por JWT propio de 7 días.
- `client/` — React + Vite, "Sign in with Google" vía Google Identity Services
  (cargado como `<script>` en runtime, no como paquete npm).

`agenda-escolar-san-gabriel.html` es el prototipo del que salió el diseño: un
solo archivo, sin backend, con los eventos hardcodeados y todo en
`localStorage`. Se conserva como referencia visual. **No es la app** y no hay
que editarlo para cambiar algo: el CSS vive en `client/src/styles.css` y los
eventos, en la base.

## Versionado (obligatorio en cada cambio)

**Toda modificación del código sube la versión**, en el mismo cambio que la
introduce y sin esperar a que la pidan. La versión vive **en dos archivos que
tienen que quedar siempre en el mismo número**: `client/package.json` y
`server/package.json`. No hay script que los sincronice: se editan los dos a
mano.

- **MAJOR** — algo deja de ser compatible: una migración que no se puede volver
  atrás, un cambio de API o de configuración (`.env`, Docker) que obliga a
  tocar algo afuera del repo.
- **MINOR** — funcionalidad nueva compatible: una pantalla, un campo, una ruta,
  una migración que se aplica sola.
- **PATCH** — arreglo de un bug, ajuste de estilos o de textos, refactor sin
  cambio visible.

Cambios sólo de documentación o de comentarios no suben la versión.

`client/package.json` es la que Vite inyecta como `__APP_VERSION__` en el
footer. Si se desincronizan, el pie de página y el server dicen versiones
distintas de la misma instancia.

## Comandos

Backend (`server/`):
```bash
npm install
npx prisma migrate dev --name <desc>   # crear+aplicar migración tras editar schema.prisma
npm run seed                           # cargar el calendario oficial 2026 (idempotente)
npm run dev                            # nodemon, http://localhost:4000
npm run prisma:studio                  # inspeccionar la base
```

Frontend (`client/`):
```bash
npm install
npm run dev       # vite, http://localhost:5173
npm run build
```

No hay lint ni tests configurados — no asumir que existen `npm test` /
`npm run lint`.

Docker (desde la raíz):
```bash
cp .env.example .env   # completar GOOGLE_CLIENT_ID y JWT_SECRET
docker compose up -d --build
```

`./deploy.sh` es el camino de actualización de producción: hace
`git reset --hard origin/main` y rebuildea. **Descarta commits locales y trabajo
sin commitear**, así que nunca correrlo como atajo para rebuildear.

**Después de cualquier cambio de código, correr `docker compose up -d --build`**
para que el usuario lo vea en su Docker local — este proyecto se prueba por
Docker, no por `npm run dev`.

Cliente en `http://localhost:8099` (nginx, `CLIENT_PORT` del `.env`), que
proxea `/api/*` al servicio `server` (puerto 4000, **no** publicado al host). El
server corre `prisma migrate deploy` y después el seed al arrancar el contenedor
(`server/docker-entrypoint.sh`). La base persiste en el volumen
`agenda_sg_data`.

El servicio `cloudflared` (profile `cloudflare`) expone el cliente por un
Cloudflare Tunnel; sólo arranca con `docker compose --profile cloudflare up` o
`COMPOSE_PROFILES=cloudflare` en el `.env`.

## Arquitectura

### Modelo de datos (`server/prisma/schema.prisma`)

Cuatro modelos: `User`, `Event` (el calendario oficial), `PersonalEvent` (los
eventos de cada familia) y `EventSubscription` (quién suscribió el código de
quién, ver "Compartir eventos personales" — el link de un solo evento no
tiene modelo propio, es un JWT que apunta a un `PersonalEvent` existente).

**Las fechas son `String 'YYYY-MM-DD'`, no `DateTime`.** Son fechas de
calendario sin hora, y un `DateTime` en SQLite se guarda en UTC: un
`2026-09-01` local vuelve como `2026-08-31T21:00Z` y el evento se corre un día
según el huso de quien lo lea. Con `String` la fecha es la que se cargó,
siempre. Por la misma razón el cliente nunca hace `new Date('2026-09-01')`
—parsearía como UTC— sino `parse()` de `client/src/lib/agenda.js`, que arma la
`Date` con los tres números por separado.

`time` y `endTime` son texto libre en el formato de la agenda (`'8.15'`, pero
también `'8 a 15'`, que es como viene el calendario del colegio). `endTime` es
**independiente de `endDate`**: un acto puede ser "de 8.15 a 12.30" el mismo
día. Sólo tiene sentido con `time` cargada —sin hora de inicio la API la
rechaza— y el orden entre las dos se exige sólo cuando las dos son del formato
`H.MM` y el evento empieza y termina el mismo día: en un tramo de varios días la
hora de fin es la del último día y puede ser más temprana.

`Event.groups` y `User.picks` son **JSON guardado como texto**: siempre se leen
y se escriben enteros, y el catálogo de salas/grados es del cliente, así que la
base no tiene por qué conocer esos ids. Todo `JSON.parse` de esas columnas va
envuelto en `try/catch` y cae a `[]`: una fila corrupta no puede tumbar el login
ni el calendario.

`level` es un string sin enum (SQLite no tiene): los valores válidos se validan
en la aplicación (`LEVELS` en `server/src/lib/catalogo.js`). Ordenar por esa
columna sería **alfabético** y no significa nada — el orden de precedencia real
está en `ORDER` de `client/src/lib/agenda.js`, que mapea el nivel a un rank.

Cualquier migración que agregue una columna requerida y sin default a una tabla
con datos necesita `prisma migrate dev --create-only` y editar el SQL a mano
para backfillear antes de aplicar: `migrate dev` se planta apenas ve un paso con
pérdida de datos sobre una tabla no vacía.

### El catálogo está duplicado a propósito

`server/src/lib/catalogo.js` y `client/src/lib/agenda.js` tienen la **misma**
lista de salas, grupos, grados y años. **Si agregás una, tocá los dos.**

Está duplicado y no compartido porque el build de Docker del cliente sólo copia
`client/`: un archivo común fuera de esa carpeta no entraría en la imagen. Y
está duplicado en vez de simplemente no validar porque el modo de falla del otro
camino es el peor posible para un calendario: un tag mal escrito guarda el
evento sin error y lo deja **invisible para todo el mundo**, porque no matchea
con ningún filtro. Mejor un 400 al cargarlo.

### El seed

`server/prisma/seed.js` carga `calendario-2026.json` (los 152 eventos del
calendario del colegio, extraídos del HTML original) y lo corre el entrypoint en
**cada** arranque del contenedor. Es idempotente: la identidad de un evento del
seed es `(date, level, title)` —no el id, que lo asigna SQLite y cambia con cada
base nueva—, así que sólo inserta lo que falta y no pisa lo que el admin editó.

**Corolario a tener presente: un evento que el admin borra vuelve a aparecer en
el próximo arranque.** Es lo que se quiere mientras el JSON sea la fuente del
calendario oficial; si deja de serlo, hay que sacar el seed del entrypoint.

### Telemetría de visitas

Para saber cuánta gente usa la agenda **no hay tabla ni servicio externo: son
líneas de log**. El cliente manda un ping por carga
(`POST /api/telemetria/visita`, `optionalAuth`) y el server escribe una línea
JSON con el prefijo `[telemetria]` en stdout — en Docker, el log del contenedor
`server` (`server/src/lib/telemetria.js`).

La persona se identifica con un **id random que genera el navegador** y queda en
`localStorage` bajo `sg-visitante-v1`. **No se loguea ni el mail, ni la IP, ni
el user-agent**: para contar visitantes distintos alcanza un número que no
identifica a nadie, y de las cuentas sale sólo el `id` numérico (el mail ya está
en `/usuarios`, que es del admin). Como el id es del navegador, la misma familia
desde el celular y desde la compu cuenta dos, y quien limpia el navegador vuelve
a contar como visita nueva: es un piso, no un padrón.

Tres tipos de línea: `visita` (una por carga), `login` (ingreso con Google, con
`nueva: true` si es el primero de esa cuenta) y `resumen` (los totales de un día
cerrado). Cada `visita` lleva además los totales corridos del día
(`visitantesHoy`), así la última línea de la jornada ya dice cuántos fueron sin
tener que deduplicar nada.

Dos cosas a tener presentes:

- **El día se corta a la medianoche de Argentina** (`-03:00` fijo, que no tiene
  horario de verano), no a la UTC del contenedor: si no, una visita de las 22 de
  acá caería en el día siguiente.
- **Los acumulados viven en memoria del proceso** y se pierden en cada reinicio;
  el `resumen` de un día lo dispara la primera visita del día siguiente, no un
  timer. Por eso las líneas de `visita` son la fuente de verdad y el resumen es
  una comodidad. Los `Set` del día están topeados en 20.000 ids para que nadie
  pueda hacer crecer el proceso mandando un id distinto por request; pasado el
  tope la línea sale con `tope: true` y los únicos son un piso.

Cómo se leen los números está en el README ("Telemetría").

### Auth y permisos

El cliente saca el ID token con Google Identity Services →
`POST /api/auth/google` → el backend lo verifica con `google-auth-library`
(audience = `GOOGLE_CLIENT_ID`) → crea/actualiza el `User` seteando `isAdmin`
desde `ADMIN_EMAILS` → firma y devuelve su propio JWT → el cliente lo guarda en
`localStorage` y manda `Authorization: Bearer <token>` en cada request.

Se rechaza el login si Google devuelve `email_verified === false`: como el admin
se decide por mail, una cuenta creada con la dirección de otra persona
alcanzaría para hacerse pasar por la del colegio.

Tres middlewares en `server/src/middleware/auth.js`:

- `requireAuth` — 401 sin token válido.
- `optionalAuth` — cuelga `req.user` si hay token válido y **sigue igual si no
  lo hay**. Lo usa `GET /api/eventos`, que sin cuenta devuelve sólo el
  calendario oficial y con cuenta le suma los eventos personales. Un token
  vencido acá **no es un 401**: se ignora y se sigue como anónimo, porque cortar
  dejaría el calendario público en blanco por una sesión vencida.
- `requireAdmin` — 403 si `!req.user.isAdmin`. Va en el `router.use` de
  `routes/oficial.js` (a diferencia del `requireWriter` del stack genérico)
  porque **todo** ese router escribe: la lectura del calendario es pública y
  sale por otra ruta. También cierra entero `routes/usuarios.js`, que es de
  lectura pero no es de nadie más que del admin.

**Los lookups de eventos personales usan `findFirst({ where: { id, userId } })`,
nunca `findUnique`**: el id de otra persona tiene que dar 404, no devolver ni
dejar borrar su fila. Ni siquiera un admin puede tocar los eventos personales de
otra cuenta.

El gate de `/oficial` en el cliente (`client/src/pages/Oficial.jsx`) es **UI, no
seguridad**: cualquiera puede pegarle a la API con `curl` y su token. Lo que lo
cierra es `requireAdmin`. Ese `return` temprano va **después de todos los
hooks**, si no React se rompe cuando cambia la cantidad de hooks entre renders.

### Estado del cliente

Dos contextos, en este orden (`main.jsx`): `AuthProvider` → `EventosProvider` →
`ConfirmProvider`. `EventosProvider` va adentro de `AuthProvider` porque la
carga del calendario necesita saber si hay sesión, y espera a que la sesión
resuelva antes de pedir: si no, la primera carga saldría sin token y volvería
sin los eventos personales.

`EventosProvider` es la **única** carga de eventos de la app. El calendario y la
pantalla de gestión leen del mismo estado, así que editar un evento oficial se
ve reflejado en el calendario sin volver a pedirle nada al server.

**Los filtros (`picks`) viven en los dos lados**: en `localStorage` (clave
`sg-seleccion-v1`, la misma que usaba el HTML original, para no perder la
selección de quien ya lo usaba) y en la base cuando hay sesión. Con cuenta manda
la base — es lo que hace que la selección aparezca en otro dispositivo—, con una
excepción: si la cuenta todavía no tiene nada guardado y en este navegador sí
había algo, se sube lo local en vez de borrarlo (`adoptarPicks`). Al cerrar
sesión los filtros **no** se borran: son una preferencia de visualización, no un
dato de la sesión.

Todo acceso a `localStorage` va envuelto en `try/catch`: en modo privado puede
tirar tanto al leer como al escribir, y sin almacenamiento la app tiene que
funcionar igual.

### Eventos personales: navegador o cuenta

Los eventos propios salen de dos lados a la vez y `EventosProvider` los muestra
juntos: `remotos` son los de la cuenta (los trae el server) y `locales` los que
se cargaron sin sesión, guardados en `localStorage` bajo `sg-eventos-locales-v1`
(`client/src/lib/personales.js`). Un evento local tiene **la misma forma** que
el que serializa el server, así que el calendario no sabe de dónde salió cada
uno.

**Lo que decide a dónde va una escritura es el tipo del id**: los locales llevan
un string `'loc-…'` y los de la base, el número de SQLite, así que no pueden
chocar. `editarMio`/`borrarMio` miran eso (`esLocal`) y no si hay sesión: un
evento local que todavía no se pudo subir se sigue editando en el navegador aun
con la sesión abierta.

`migrar()` sube los locales a la cuenta y **corre en cada carga con token**, no
sólo justo después del login: si la subida se cortó por red, lo que quedó se
reintenta en el próximo arranque. Cada evento se borra del `localStorage`
**apenas el server lo confirma**, uno por uno — si el siguiente falla, los ya
subidos no se vuelven a mandar y no aparecen duplicados. Un error sin `status`
(no llegó a la red) corta el lazo; un 400 no se descarta: ese evento se queda
como local, visible y editable, en vez de desaparecer sin aviso.

Al cerrar sesión los eventos de la cuenta dejan de verse —quedan en la base, no
se copian al navegador— y los locales que hubiera siguen ahí.

### Compartir eventos personales

Dos mecanismos independientes, los dos exigen cuenta en las dos puntas —sin
eso no hay dónde guardar ni el código ni la copia que acepta la otra
persona—, y los dos son opt-in: nada de esto cambia lo que dice más arriba
("Nadie más los ve, ni el colegio") salvo que la propia cuenta decida
generar un link o un código.

**Link de UN evento** (`server/src/routes/eventos.js`, `POST /mios/:id/compartir`
y el par `GET/POST /compartir/evento/:token`): el token es un JWT firmado que
sólo guarda el id del `PersonalEvent` (`server/src/lib/compartir.js`), **sin
tabla propia** — no hace falta persistir nada porque el evento ya está
guardado, el token sólo prueba que quien lo tiene puede verlo. Sin
`expiresIn`: compartir un cumpleaños no debería vencer. Se invalida solo si
el evento se borra, porque la vista previa y la aceptación vuelven a buscarlo
en la base en cada uso en vez de confiar en algo que viajó en el token.

La vista previa (`GET /compartir/evento/:token`) es **pública a propósito**,
igual que el calendario oficial: hace falta poder ver de qué evento se trata
antes de que se pida entrar con Google, no para mirar. Aceptar
(`POST .../aceptar`) sí pide cuenta, y crea una **copia independiente** en
la cuenta de quien acepta — no queda vinculada al original, así que editar o
borrar uno no le toca nada al otro. El mismo link se puede aceptar más de
una vez y por gente distinta: no hay nada que marcar como "usado".

**Código de "compartir todos mis eventos"** (`User.shareCode`, modelo
`EventSubscription` en `schema.prisma`): es una **suscripción en vivo** y de
**un solo sentido** — mientras exista la fila, quien canjeó el código ve los
eventos personales del dueño mezclados en su propio calendario (nivel
`per`, de sólo lectura, con `de` diciendo de quién son porque acá sí hace
falta distinguirlos), incluidos los que el dueño cargue **después** de
compartir, sin que haga falta volver a compartir nada. Nunca al revés:
compartir tus eventos no hace que veas los de quien canjeó tu código.

El código y el acceso son cosas separadas a propósito: **apagar el código
(`DELETE /compartir/codigo`) sólo cierra la puerta a canjes nuevos**, no le
toca nada a quien ya lo usó — para eso está sacarlo puntualmente de la lista
de suscriptores (`DELETE /compartir/suscriptores/:userId`, del lado del
dueño) o que se autodesuscriba (`DELETE /compartir/suscripciones/:ownerId`,
del lado de quien mira). Si no fuera así, regenerar el código para compartírselo
a alguien nuevo le cortaría el acceso a todos los que ya lo tenían, que no es
lo que nadie espera de "generar un código nuevo".

En el cliente esto vive repartido en tres modales, cada uno con un solo
trabajo, no uno solo que hace de todo:

- **`AdderDialog.jsx`** — sólo carga un evento nuevo. Guardar limpia el
  formulario y lo deja abierto (para cargar varios seguidos); no sabe nada
  de editar, borrar ni compartir.
- **`EditEventDialog.jsx`** — editar, borrar o compartir UN evento
  puntual. No hay ninguna lista de "mis eventos" en ningún lado: se abre
  clickeando el evento directo en el calendario o en "Próximas fechas", con
  el ícono de compartir al lado del título y "Borrar" en el pie. Guardar
  (o borrar) cierra el modal, a diferencia de `AdderDialog`, porque acá no
  tiene sentido dejarlo abierto para "el próximo": es de un evento solo.
  Lo que decide si un evento es clickeable es `level === 'per' && !de`
  (`Month.jsx`, `Upcoming.jsx`) — un compartido también es `'per'` pero
  trae `de`, así que queda como un `<div>` sin más, de sólo lectura como
  corresponde. Ese renglón clickeable es un `<button>` real, no un `<div
  onClick>`: todo lo interactivo de la app ya lo es (las celdas del
  calendario, por ejemplo), para que funcione con teclado y lector de
  pantalla sin nada extra.
- **`CompartirTodoDialog.jsx`** — código propio, lista de quién te
  suscribió y a quién suscribiste vos. Se abre desde el ícono de compartir
  al lado de la cuenta en `Masthead.jsx` (junto al avatar, no en el
  calendario): compartir TODOS tus eventos no es una acción sobre un
  evento puntual, así que no vive ahí.

El ícono de compartir —una flecha saliendo de una bandeja, no un botón de
texto— es el mismo componente (`IconoCompartir.jsx`) en los dos lugares
donde aparece (`EditEventDialog` y `Masthead`), con distinto color de fondo
según si está sobre una tarjeta clara o el header verde oscuro. Tocarlo
abre el panel nativo del sistema (`navigator.share`) cuando el navegador lo
tiene —así la persona elige WhatsApp, Mail, lo que tenga— y si no existe
(la mayoría de los navegadores de escritorio) cae al link copiado solo en
un input, que sigue ahí para pegarlo a mano. Cancelar el panel nativo tira
`AbortError`, que no se trata como error. La página del link
(`/compartir/evento/:token`, `CompartirEvento.jsx`) es una ruta aparte
porque la abre alguien que capaz nunca usó la agenda.

### Resolución de la URL del server

`client/src/api.js`: `API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'`
— `??` y **no** `||`, a propósito. El build de Docker pasa `VITE_API_URL=""`
para que el bundle llame same-origin `/api/*` (nginx lo proxea al contenedor
`server`, cuyo puerto nunca se publica al host). `||` trataría ese string vacío
como falsy y caería al default `http://localhost:4000`, que no es alcanzable
desde afuera de la red de Docker — ese bug exacto rompe el login en Docker
mientras anda bien con `npm run dev`. **Si tocás este archivo, dejá el `??`.**

### Otras trampas del stack

**CORS**: el backend permite exactamente un origen, `CLIENT_ORIGIN`, no un
wildcard. Tiene que coincidir con la URL desde la que el browser carga el
cliente.

**La configuración del cliente OAuth vive fuera del repo**, en Google Cloud
Console: la lista "Authorized JavaScript origins" del Client ID tiene que
incluir todos los orígenes desde los que se sirve el cliente
(`http://localhost:5173` para `npm run dev`, `http://localhost:8099` para
Docker, el dominio del túnel si se usa). No hace falta redirect URI: Google
Identity Services valida el origen, no un redirect. Un origen que falte se
manifiesta como un botón de Google que no renderiza o un login que falla sin
error claro en la app; el mensaje real está en la consola del browser.

**Prisma + Alpine**: el Dockerfile del server instala `openssl` explícitamente y
`schema.prisma` declara `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`
— el layout de OpenSSL de musl no lo autodetecta Prisma, y falla al arrancar el
contenedor. Conservar las dos cosas.

**Persistencia**: la base va adentro de `/app/data`, mapeado al volumen
`agenda_sg_data`. Lo que quede afuera se pierde en cada rebuild.

**Finales de línea**: `.gitattributes` fuerza `eol=lf` y los Dockerfiles hacen
`sed -i 's/\r$//'` sobre los `.sh`. Sin eso, un checkout en Windows convierte el
entrypoint a CRLF y el contenedor muere con un `no such file or directory` que
apunta al shebang y no dice nada útil.

**Una sola instancia del backend.** No hay estado compartido fuera de SQLite,
pero tampoco hay nada que coordine dos réplicas: este stack asume un solo
proceso.

## Interfaz

**El diseño es el del HTML original** y no hay framework de CSS: `styles.css`
son tokens (`--paper`, `--forest`, `--ini`/`--pri`/`--sec`/`--ins`/`--fer`/
`--per`) más clases propias. Los tres estados de tema —claro, oscuro, sistema—
se resuelven con `data-theme` en `<html>` y `prefers-color-scheme`; `system`
**quita** el atributo en vez de calcular el modo, así sigue al sistema si la
persona lo cambia con la página abierta, sin listeners.

**Idioma**: todo lo que ve el usuario va en **castellano rioplatense** ("andá",
"hacé"), incluidas las rutas (`/oficial`) y los mensajes de error que devuelve
la API. Los identificadores del código quedan en inglés; los de las funciones de
UI de este repo están mezclados y no vale la pena unificarlos ahora.

**Estilo de los campos** (sección "Campos" de `styles.css`): ningún
`input`/`select`/`textarea` puede quedar con el estilo por defecto del
navegador — se ve despareja la app y el default ignora el tema oscuro. Hay
**una** regla base sobre el elemento, con el `:not()` de checkbox/radio/range/
file envuelto en `:where()` para que el selector siga pesando 0,0,1 y cualquier
regla con clase lo pise sin `!important`. Un campo nuevo ya sale bien: al
estilar uno puntual tocar sólo tamaño/ancho/alto, nunca repetir borde, fondo,
tipografía ni foco.

**`--lv` es lo que pinta el estado elegido de `.opt`** y el CSS original sólo lo
define dentro de los `.grp` del picker. Cualquier grilla de `.opt` fuera de ahí
tiene que setearlo (ver el `style` del contenedor de tags en `Oficial.jsx`), o
los botones marcados se ven más apagados que los sin marcar.

**Confirmación de acciones destructivas**
(`client/src/components/ConfirmDialog.jsx`): toda acción que borra o reemplaza
datos tiene que pasar por `useConfirm()` y esperar un `true` antes de llamar a
la API. **No usar `window.confirm`**: el diálogo nativo depende del navegador
—Chrome de Android lo silencia después de varios seguidos, y dentro de un
WebView puede no mostrarse nunca y devolver un valor por defecto—, así que un
borrado podía salir sin que nadie viera la pregunta. El foco arranca en
"Cancelar" a propósito.

Va en un `<dialog>` con `showModal()`, **no** en un div con `z-index`: un
`<dialog>` modal se dibuja en el *top layer* del browser, que está arriba de
todo `z-index` por alto que sea. Como la confirmación se dispara casi siempre
desde adentro de otro modal (borrar un evento propio, en el de agregar
evento), un div quedaba **tapado** por el modal desde el que se lo llamó.
Entre dos `<dialog>` modales manda el orden de apertura. Su regla de CSS lleva
`height: max-content` porque el UA le pone `inset: 0`: con alto automático la
caja se estira de arriba abajo y el texto queda flotando en un vacío.

**Los modales usan `<dialog>` nativo** vía `components/Dialog.jsx`, que llama
`showModal()`/`close()` por ref. Dos cosas que ese envoltorio resuelve y no hay
que deshacer: escucha el evento `cancel` (Escape y el botón de cerrar del
navegador) para avisarle a React —sin eso el diálogo se cierra solo, el estado
queda creyendo que sigue abierto y la próxima apertura no hace nada—, y
**desmonta el contenido cuando está cerrado**, así cada apertura arranca con los
campos limpios sin un efecto de sincronización que se olvide de correr. Por eso
el cuerpo de cada modal va en su propio componente.

**Nada puede desbordar el ancho del viewport**: una fila que no entra empuja el
`scrollWidth` de la página, saca de cuadro al header y deja la app scrolleando
de costado entera. Para verificarlo, lo que importa es
`document.documentElement.scrollWidth` contra `clientWidth` en la pantalla real,
no que se vea bien en una captura.

**Mobile**: el breakpoint es 720 px, y está **en dos lados**: la media query
de `styles.css` y la constante `ANGOSTO` de `client/src/lib/media.js`, que usan
los componentes que no sólo se reacomodan sino que **cambian de forma** en
celular (el selector de tema pasa de tres botones a uno que cicla; el botón de
Google pasa a su versión de sólo ícono). Si se corre el número hay que correrlo
en los dos: si quedan distintos, el header se dibuja con la forma de escritorio
en un ancho donde el CSS ya no le da lugar. Los modales van a pantalla completa
(`height` y `max-height: 100dvh` — `dvh` y no `vh` porque la barra de
direcciones se esconde al scrollear; con un alto *exacto* y no un `min-height`
suelto, porque el `<dialog>` es fijo al viewport y lo que se pase del borde de
abajo queda fuera de alcance), con la excepción del diálogo de confirmación,
que queda centrado y del tamaño de su texto. Ojo: en
celular el fondo deja de estar a la vista, así que **todo modal nuevo tiene que
tener su propio botón de Cancelar/Cerrar** — tocar afuera ya no es una salida
posible.

**Tipografía en `rem`/`em`**: no hay un solo `font-size` en px, así que una sola
regla sobre `:root` escala toda la app. Los breakpoints sí van en px a
propósito: al agrandar la letra crece el texto, no se reacomoda el layout.
