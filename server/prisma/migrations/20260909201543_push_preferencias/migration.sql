-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PushSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" INTEGER,
    "picks" TEXT NOT NULL DEFAULT '[]',
    "hora" INTEGER NOT NULL DEFAULT 17,
    "dia" TEXT NOT NULL DEFAULT 'siguiente',
    "detalle" TEXT NOT NULL DEFAULT 'cantidad',
    "ultimoAviso" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PushSubscription" ("auth", "createdAt", "endpoint", "id", "p256dh", "picks", "userId") SELECT "auth", "createdAt", "endpoint", "id", "p256dh", "picks", "userId" FROM "PushSubscription";
DROP TABLE "PushSubscription";
ALTER TABLE "new_PushSubscription" RENAME TO "PushSubscription";
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
