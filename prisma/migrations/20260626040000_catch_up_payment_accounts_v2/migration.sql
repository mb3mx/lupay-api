-- CreateEnum
CREATE TYPE "PaymentAccountType" AS ENUM ('KUSPIT', 'INNTEC', 'BANK');

-- CreateTable
CREATE TABLE "client_payment_account" (
    "id" BIGSERIAL NOT NULL,
    "client_id" BIGINT NOT NULL,
    "type" "PaymentAccountType" NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT,
    "bank_name" TEXT,
    "payout_percentage" DOUBLE PRECISION NOT NULL DEFAULT 100.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_payment_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_payment_account_client_id_idx" ON "client_payment_account"("client_id");

-- CreateIndex
CREATE INDEX "client_payment_account_type_idx" ON "client_payment_account"("type");

-- AddForeignKey
ALTER TABLE "client_payment_account" ADD CONSTRAINT "client_payment_account_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: agregar columnas nuevas (activation_email nullable por ahora,
-- se vuelve NOT NULL en una migración posterior una vez que el seed de
-- clientes haya rellenado los 1270 registros existentes)
ALTER TABLE "client"
  ADD COLUMN "activation_email" TEXT,
  ADD COLUMN "terminal" TEXT,
  ADD COLUMN "reintegro_time" TEXT;

-- CreateIndex (UNIQUE permite múltiples NULL en Postgres, seguro antes del backfill)
CREATE UNIQUE INDEX "client_activation_email_key" ON "client"("activation_email");

-- AlterTable
ALTER TABLE "sindicato" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "liquidadora" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Migrar datos existentes: bank_clabe -> client_payment_account (tipo KUSPIT)
INSERT INTO "client_payment_account" ("client_id", "type", "account_number", "payout_percentage", "is_active", "created_at", "updated_at")
SELECT "id", 'KUSPIT', "bank_clabe", 100.00, true, now(), now()
FROM "client"
WHERE "bank_clabe" IS NOT NULL AND trim("bank_clabe") <> '';

-- DropIndex (tax_id deja de ser único, ver migración make_client_tax_id_optional)
DROP INDEX IF EXISTS "client_tax_id_key";

-- AlterTable: ya migrados los datos de bank_clabe, se eliminan las columnas viejas
ALTER TABLE "client"
  DROP COLUMN IF EXISTS "bank_account",
  DROP COLUMN IF EXISTS "bank_clabe",
  DROP COLUMN IF EXISTS "bank_name";
