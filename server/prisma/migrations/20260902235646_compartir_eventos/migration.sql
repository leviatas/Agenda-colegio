-- AlterTable
ALTER TABLE "User" ADD COLUMN "shareCode" TEXT;

-- CreateTable
CREATE TABLE "EventSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "subscriberId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSubscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventSubscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventSubscription_subscriberId_idx" ON "EventSubscription"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSubscription_ownerId_subscriberId_key" ON "EventSubscription"("ownerId", "subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "User_shareCode_key" ON "User"("shareCode");

