#!/bin/sh
set -e

# migrate deploy y no migrate dev: aplica las migraciones ya generadas, no crea
# ninguna y no pregunta nada. La inicial hay que generarla una vez a mano con
# `npx prisma migrate dev --name init`.
echo "Applying database migrations..."
npx prisma migrate deploy

# El seed es idempotente: sólo inserta los eventos del calendario 2026 que
# todavía no están, comparando por (fecha, nivel, título). No pisa lo que el
# admin haya editado desde la pantalla de gestión.
echo "Seeding official calendar..."
node prisma/seed.js

echo "Starting server..."
exec node src/index.js
