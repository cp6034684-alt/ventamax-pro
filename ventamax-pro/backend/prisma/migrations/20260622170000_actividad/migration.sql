-- Log de actividad (eventos de usuario)
CREATE TABLE IF NOT EXISTS "actividades" (
  "id" TEXT PRIMARY KEY,
  "usuarioId" TEXT,
  "tipo" TEXT NOT NULL,
  "detalle" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "actividades_creadoEn_idx" ON "actividades"("creadoEn");
CREATE INDEX IF NOT EXISTS "actividades_usuarioId_idx" ON "actividades"("usuarioId");
DO $$ BEGIN
  ALTER TABLE "actividades" ADD CONSTRAINT "actividades_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
