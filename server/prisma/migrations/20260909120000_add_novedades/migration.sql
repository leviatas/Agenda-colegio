-- CreateTable
CREATE TABLE "Novedad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NovedadCierre" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "novedadId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NovedadCierre_novedadId_fkey" FOREIGN KEY ("novedadId") REFERENCES "Novedad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NovedadCierre_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Novedad_desde_hasta_idx" ON "Novedad"("desde", "hasta");

-- CreateIndex
CREATE INDEX "NovedadCierre_userId_idx" ON "NovedadCierre"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NovedadCierre_novedadId_userId_key" ON "NovedadCierre"("novedadId", "userId");
