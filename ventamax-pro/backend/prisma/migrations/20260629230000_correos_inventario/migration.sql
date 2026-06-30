-- Correos autorizados para actualizar inventario por correo.
-- Los administradores manejan esta lista desde la app (Mas -> Correos de inventario).
CREATE TABLE IF NOT EXISTS "correos_inventario" (
  "email" TEXT PRIMARY KEY,
  "creado_en" TIMESTAMPTZ NOT NULL DEFAULT now()
);
