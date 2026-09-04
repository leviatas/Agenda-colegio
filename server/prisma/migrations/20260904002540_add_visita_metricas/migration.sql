-- CreateTable
CREATE TABLE "Visita" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Visita_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Visita_ip_idx" ON "Visita"("ip");

-- CreateIndex
CREATE INDEX "Visita_creadoEn_idx" ON "Visita"("creadoEn");
