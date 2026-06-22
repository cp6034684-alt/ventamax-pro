-- Supervisor a cargo de vendedores (auto-relación).
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "supervisorId" TEXT;
DO $$ BEGIN
  ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_supervisorId_fkey"
    FOREIGN KEY ("supervisorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
