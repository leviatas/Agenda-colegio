FROM node:20-alpine

WORKDIR /app

# El musl de Alpine ubica OpenSSL con un nombre/layout que el engine de Prisma
# no autodetecta; sin esto Prisma cae a un binario que no corresponde y
# revienta al arrancar ("Could not parse schema engine response"). Va junto con
# el binaryTargets de schema.prisma: las dos cosas o ninguna.
RUN apk add --no-cache openssl

# tzdata: sin la base de zonas horarias la variable TZ no resuelve y el proceso
# queda en UTC.
RUN apk add --no-cache tzdata

# package*.json primero para que la capa del npm ci se cachee y no se
# reinstale con cada cambio de código.
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY docker-entrypoint.sh ./
# Normaliza los finales de línea por si el archivo se checkouteó con CRLF: un
# shebang con \r hace que el shell busque "/bin/sh\r" y Docker lo reporta como
# "no such file or directory".
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
