-- Inventario por bodega (aditivo)

-- CreateTable
CREATE TABLE "stock_bodega" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stock_bodega_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_bodega_productoId_bodegaId_key" ON "stock_bodega"("productoId", "bodegaId");
CREATE INDEX "stock_bodega_bodegaId_idx" ON "stock_bodega"("bodegaId");

-- CreateTable
CREATE TABLE "cargas_inventario" (
    "id" TEXT NOT NULL,
    "bodegaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "archivo" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "revertida" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cargas_inventario_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cargas_inventario_bodegaId_creadoEn_idx" ON "cargas_inventario"("bodegaId", "creadoEn");

-- CreateTable
CREATE TABLE "cargas_inventario_items" (
    "id" TEXT NOT NULL,
    "cargaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidadAnterior" INTEGER NOT NULL,
    "cantidadNueva" INTEGER NOT NULL,
    CONSTRAINT "cargas_inventario_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cargas_inventario_items_cargaId_idx" ON "cargas_inventario_items"("cargaId");

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "regionId" TEXT;
CREATE INDEX "usuarios_regionId_idx" ON "usuarios"("regionId");

-- AlterTable
ALTER TABLE "regiones" ADD COLUMN "bodegaPrincipalId" TEXT;

-- AddForeignKey
ALTER TABLE "stock_bodega" ADD CONSTRAINT "stock_bodega_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_bodega" ADD CONSTRAINT "stock_bodega_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "bodegas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cargas_inventario" ADD CONSTRAINT "cargas_inventario_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "bodegas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cargas_inventario_items" ADD CONSTRAINT "cargas_inventario_items_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "cargas_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
