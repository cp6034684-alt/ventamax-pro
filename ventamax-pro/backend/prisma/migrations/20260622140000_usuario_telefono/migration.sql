-- Teléfono del vendedor (para el recordatorio al cliente).
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "telefono" TEXT;
