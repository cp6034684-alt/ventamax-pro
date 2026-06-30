-- Catalogo de ciudades por region. El "codigo" (3 letras) es el prefijo del ticket del vendedor
-- (CIU-NN-CANAL). Los administradores crean ciudades nuevas desde Bodegas/Regiones.
CREATE TABLE IF NOT EXISTS "ciudades" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "nombre" TEXT NOT NULL UNIQUE,
  "codigo" TEXT NOT NULL,
  "regionId" TEXT,
  "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT now()
);
