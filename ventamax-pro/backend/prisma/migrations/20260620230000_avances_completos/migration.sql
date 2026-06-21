-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'SUPERVISOR';

-- AlterEnum
ALTER TYPE "EstadoFactura" ADD VALUE 'DEVUELTA';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "documento" TEXT,
ADD COLUMN     "listasPrecios" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meta" INTEGER NOT NULL DEFAULT 10000000;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "codigo" INTEGER,
ADD COLUMN     "correo" TEXT,
ADD COLUMN     "listaPrecio" TEXT,
ADD COLUMN     "nit" TEXT,
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "segmento" TEXT,
ADD COLUMN     "tipologia" TEXT,
ADD COLUMN     "zona" TEXT;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "iva" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "linea" TEXT,
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "precioDroguerias" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioEntreSede" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioGeneral" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioMayorista" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioTat" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioTatViajeros" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "segmento" TEXT,
ADD COLUMN     "subsegmento" TEXT,
ADD COLUMN     "unidad" TEXT;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "causal" TEXT,
ADD COLUMN     "devuelta" TEXT NOT NULL DEFAULT 'NO',
ADD COLUMN     "facturaOrigenId" TEXT,
ADD COLUMN     "listaPrecio" TEXT,
ADD COLUMN     "montoDevuelto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "obsDevolucion" TEXT,
ADD COLUMN     "revivirSolicitado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tareaId" TEXT,
ADD COLUMN     "tipoDoc" TEXT NOT NULL DEFAULT 'VENTA';

-- CreateTable
CREATE TABLE "tareas_entrega" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tareas_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "causal" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regiones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodegas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "ciudad" TEXT,
    "direccion" TEXT,
    "regionId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodegas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tareas_entrega_entregadorId_estado_idx" ON "tareas_entrega"("entregadorId", "estado");

-- CreateIndex
CREATE INDEX "visitas_clienteId_creadoEn_idx" ON "visitas"("clienteId", "creadoEn");

-- CreateIndex
CREATE INDEX "visitas_vendedorId_creadoEn_idx" ON "visitas"("vendedorId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "regiones_nombre_key" ON "regiones"("nombre");

-- CreateIndex
CREATE INDEX "bodegas_regionId_idx" ON "bodegas"("regionId");

-- CreateIndex
CREATE INDEX "ubicaciones_vendedorId_creadoEn_idx" ON "ubicaciones"("vendedorId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_key" ON "clientes"("codigo");

-- CreateIndex
CREATE INDEX "clientes_ciudad_idx" ON "clientes"("ciudad");

-- CreateIndex
CREATE INDEX "facturas_facturaOrigenId_idx" ON "facturas"("facturaOrigenId");

-- CreateIndex
CREATE INDEX "facturas_tareaId_idx" ON "facturas"("tareaId");

-- AddForeignKey
ALTER TABLE "tareas_entrega" ADD CONSTRAINT "tareas_entrega_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodegas" ADD CONSTRAINT "bodegas_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_facturaOrigenId_fkey" FOREIGN KEY ("facturaOrigenId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "tareas_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

