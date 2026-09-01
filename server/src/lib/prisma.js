// Un solo cliente compartido para todo el proceso: cada PrismaClient abre su
// propio pool, así que no instanciar uno por archivo.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
