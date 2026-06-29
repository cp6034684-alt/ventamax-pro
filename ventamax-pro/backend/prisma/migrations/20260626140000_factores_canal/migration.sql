-- Factores de precio por canal (relativos al precio General). El cliente define el General
-- y el sistema calcula los demas canales: precioCanal = General * factor.
CREATE TABLE IF NOT EXISTS "factores_canal" (
  "canal" TEXT PRIMARY KEY,
  "factor" DOUBLE PRECISION NOT NULL DEFAULT 1
);
INSERT INTO "factores_canal" ("canal","factor") VALUES
  ('GENERAL',1),('MAYORISTA',1),('TAT',1),('DROGUERIAS',1),('TAT_VIAJEROS',1),('ENTRE_SEDE',1)
ON CONFLICT ("canal") DO NOTHING;
