-- Vendedora dueña del cliente que ella crea (solo ella lo ve).
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "creadoPorId" TEXT;
CREATE INDEX IF NOT EXISTS "clientes_creadoPorId_idx" ON "clientes"("creadoPorId");
