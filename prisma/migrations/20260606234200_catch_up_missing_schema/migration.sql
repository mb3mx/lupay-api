-- CreateEnum
CREATE TYPE "LiquidacionStatus" AS ENUM ('CALCULADA', 'APROBADA', 'PAGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DevolucionStatus" AS ENUM ('PENDIENTE', 'DESCONTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "ContracargoStatus" AS ENUM ('ABIERTO', 'DOCUMENTADO', 'RESUELTO', 'PERDIDO');

-- AlterEnum
ALTER TYPE "FileType" ADD VALUE 'AMEX';

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "afiliacion" TEXT,
ADD COLUMN     "liquidadora_id" BIGINT,
ADD COLUMN     "sindicato_id" BIGINT;

-- AlterTable
ALTER TABLE "file_control" ADD COLUMN     "conflict_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duplicate_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inserted_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settlement" ADD COLUMN     "afiliacion" TEXT,
ADD COLUMN     "monto_pagar" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "adquiriente" TEXT,
ADD COLUMN     "afiliacion" TEXT,
ADD COLUMN     "eci" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fiid" TEXT,
ADD COLUMN     "hora" TEXT,
ADD COLUMN     "importe_lupay" DOUBLE PRECISION,
ADD COLUMN     "iva_sobretasa" DOUBLE PRECISION,
ADD COLUMN     "merchant_name" TEXT,
ADD COLUMN     "metodo_autenticacion" TEXT,
ADD COLUMN     "modo_entrada" TEXT,
ADD COLUMN     "monto_sobretasa" DOUBLE PRECISION,
ADD COLUMN     "producto" TEXT,
ADD COLUMN     "propina" DOUBLE PRECISION,
ADD COLUMN     "sucursal" TEXT,
ADD COLUMN     "tasa_comision" TEXT,
ADD COLUMN     "tasa_sobretasa" TEXT,
ADD COLUMN     "terminal_serial" TEXT,
ADD COLUMN     "tipo_pago" TEXT,
ADD COLUMN     "tipo_tarjeta" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "provider" TEXT DEFAULT 'local',
ADD COLUMN     "provider_id" TEXT,
ALTER COLUMN "password" DROP NOT NULL,
ALTER COLUMN "active" SET DEFAULT false;

-- CreateTable
CREATE TABLE "sindicato" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "clabe" TEXT NOT NULL,

    CONSTRAINT "sindicato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidadora" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "clabe" TEXT NOT NULL,

    CONSTRAINT "liquidadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "status" "LiquidacionStatus" NOT NULL DEFAULT 'CALCULADA',
    "total_bruto" DOUBLE PRECISION NOT NULL,
    "total_comision" DOUBLE PRECISION NOT NULL,
    "total_neto" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_item" (
    "id" BIGSERIAL NOT NULL,
    "monto_bruto" DOUBLE PRECISION NOT NULL,
    "monto_settlement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pct_comision" DOUBLE PRECISION NOT NULL,
    "comision" DOUBLE PRECISION NOT NULL,
    "pago_neto" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liquidacion_id" BIGINT NOT NULL,
    "client_id" BIGINT NOT NULL,
    "liquidadora_id" BIGINT NOT NULL,

    CONSTRAINT "liquidacion_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion" (
    "id" BIGSERIAL NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "status" "DevolucionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_descuento" TIMESTAMP(3),
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "transaction_id" BIGINT NOT NULL,

    CONSTRAINT "devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracargo" (
    "id" BIGSERIAL NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "status" "ContracargoStatus" NOT NULL DEFAULT 'ABIERTO',
    "motivo" TEXT,
    "fecha_envio_doc" TIMESTAMP(3),
    "fecha_contestacion" TIMESTAMP(3),
    "correo_contacto" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "transaction_id" BIGINT NOT NULL,

    CONSTRAINT "contracargo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sindicato_nombre_key" ON "sindicato"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sindicato_clabe_key" ON "sindicato"("clabe");

-- CreateIndex
CREATE UNIQUE INDEX "liquidadora_nombre_key" ON "liquidadora"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "liquidadora_clabe_key" ON "liquidadora"("clabe");

-- CreateIndex
CREATE INDEX "liquidacion_fecha_idx" ON "liquidacion"("fecha");

-- CreateIndex
CREATE INDEX "liquidacion_status_idx" ON "liquidacion"("status");

-- CreateIndex
CREATE INDEX "liquidacion_item_liquidacion_id_idx" ON "liquidacion_item"("liquidacion_id");

-- CreateIndex
CREATE INDEX "liquidacion_item_client_id_idx" ON "liquidacion_item"("client_id");

-- CreateIndex
CREATE INDEX "liquidacion_item_liquidadora_id_idx" ON "liquidacion_item"("liquidadora_id");

-- CreateIndex
CREATE INDEX "devolucion_transaction_id_idx" ON "devolucion"("transaction_id");

-- CreateIndex
CREATE INDEX "devolucion_status_idx" ON "devolucion"("status");

-- CreateIndex
CREATE INDEX "contracargo_transaction_id_idx" ON "contracargo"("transaction_id");

-- CreateIndex
CREATE INDEX "contracargo_status_idx" ON "contracargo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_afiliacion_key" ON "client"("afiliacion");

-- CreateIndex
CREATE INDEX "client_afiliacion_idx" ON "client"("afiliacion");

-- CreateIndex
CREATE INDEX "client_sindicato_id_idx" ON "client"("sindicato_id");

-- CreateIndex
CREATE INDEX "client_liquidadora_id_idx" ON "client"("liquidadora_id");

-- CreateIndex
CREATE INDEX "settlement_afiliacion_idx" ON "settlement"("afiliacion");

-- CreateIndex
CREATE INDEX "transaction_afiliacion_idx" ON "transaction"("afiliacion");

-- CreateIndex
CREATE UNIQUE INDEX "user_provider_provider_id_key" ON "user"("provider", "provider_id");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_sindicato_id_fkey" FOREIGN KEY ("sindicato_id") REFERENCES "sindicato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_liquidadora_id_fkey" FOREIGN KEY ("liquidadora_id") REFERENCES "liquidadora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_item" ADD CONSTRAINT "liquidacion_item_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_item" ADD CONSTRAINT "liquidacion_item_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_item" ADD CONSTRAINT "liquidacion_item_liquidadora_id_fkey" FOREIGN KEY ("liquidadora_id") REFERENCES "liquidadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion" ADD CONSTRAINT "devolucion_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracargo" ADD CONSTRAINT "contracargo_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

