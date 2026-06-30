-- Tokens de dispositivos (para push con Firebase Cloud Messaging)
CREATE TABLE IF NOT EXISTS "dispositivos" (
  "id" TEXT PRIMARY KEY,
  "usuarioId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "plataforma" TEXT,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "dispositivos_token_key" ON "dispositivos"("token");
CREATE INDEX IF NOT EXISTS "dispositivos_usuarioId_idx" ON "dispositivos"("usuarioId");
DO $$ BEGIN
  ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
