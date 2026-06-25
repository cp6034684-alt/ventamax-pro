-- Consecutivo de auditoría en el log de actividad.
ALTER TABLE "actividades" ADD COLUMN IF NOT EXISTS "consecutivo" SERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS "actividades_consecutivo_key" ON "actividades"("consecutivo");
