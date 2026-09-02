-- Hora de fin, opcional e independiente de la fecha de fin: un evento puede ser
-- "de 8.15 a 12.30" el mismo día.
--
-- Columna nueva, anulable y sin default: SQLite la agrega con un ALTER TABLE
-- que no reescribe la tabla, así que todo lo ya cargado queda igual (endTime
-- NULL = evento sin hora de fin, que es como se venía mostrando).
ALTER TABLE "Event" ADD COLUMN "endTime" TEXT;
ALTER TABLE "PersonalEvent" ADD COLUMN "endTime" TEXT;
