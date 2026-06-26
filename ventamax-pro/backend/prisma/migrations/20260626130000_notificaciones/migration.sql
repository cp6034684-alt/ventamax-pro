-- Notificaciones (inicio de ruta auditado al supervisor)
CREATE TABLE IF NOT EXISTS "notificaciones" (
  "id" TEXT PRIMARY KEY,
  "usuarioId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "detalle" TEXT,
  "leida" BOOLEAN NOT NULL DEFAULT false,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "notificaciones_usuarioId_leida_idx" ON "notificaciones"("usuarioId","leida");
CREATE INDEX IF NOT EXISTS "notificaciones_creadoEn_idx" ON "notificaciones"("creadoEn");
DO $$ BEGIN
  ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
