// Carga el calendario oficial 2026 desde calendario-2026.json.
//
// Es idempotente y NO pisa ediciones: sólo inserta los eventos que todavía no
// están. La identidad de un evento del seed es (date, level, title) — no el id,
// que lo asigna SQLite y cambiaría en cada base nueva. Así el entrypoint lo
// puede correr en cada arranque sin duplicar nada ni deshacer lo que el admin
// tocó desde la pantalla de gestión.
//
// Corolario: un evento que el admin BORRA vuelve a aparecer en el próximo
// arranque. Es a propósito mientras el JSON sea la fuente del calendario
// oficial; si algún día deja de serlo, sacar el seed del entrypoint.

const fs = require('node:fs');
const path = require('node:path');
const prisma = require('../src/lib/prisma');

async function main() {
  const file = path.join(__dirname, 'calendario-2026.json');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

  const existing = await prisma.event.findMany({
    select: { date: true, level: true, title: true },
  });
  const seen = new Set(existing.map((e) => `${e.date}|${e.level}|${e.title}`));

  const nuevos = rows
    .filter((r) => !seen.has(`${r.date}|${r.level}|${r.title}`))
    .map((r) => ({
      date: r.date,
      endDate: r.endDate || null,
      level: r.level,
      time: r.time || null,
      title: r.title,
      groups: JSON.stringify(r.groups || []),
    }));

  if (nuevos.length === 0) {
    console.log(`Calendario oficial al día: ${existing.length} eventos, nada que insertar.`);
    return;
  }

  // createMany en SQLite no acepta skipDuplicates, pero ya filtramos arriba.
  await prisma.event.createMany({ data: nuevos });
  console.log(`Calendario oficial: ${nuevos.length} eventos insertados (había ${existing.length}).`);
}

main()
  .catch((err) => {
    console.error('Falló el seed del calendario:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
