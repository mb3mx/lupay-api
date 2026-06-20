-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('VISA', 'MASTERCARD', 'AMEX','CARNET', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('TRANSACTIONS', 'SETTLEMENTS');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'NOT_FOUND', 'AMOUNT_MISMATCH');

-- CreateEnum
CREATE TYPE "ReconciliationPriority" AS ENUM ('AUTHORIZATION_NUMBER', 'TRANSACTION_ID', 'AMOUNT_DATE');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "user" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "commission_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "bank_clabe" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal" (
    "id" BIGSERIAL NOT NULL,
    "serial_number" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_id" BIGINT NOT NULL,

    CONSTRAINT "terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_control" (
    "id" BIGSERIAL NOT NULL,
    "original_name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" "FileType" NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "uploaded_by" BIGINT NOT NULL,

    CONSTRAINT "file_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" TEXT,
    "authorization_number" TEXT,
    "reference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "card_brand" "CardBrand" NOT NULL,
    "card_number" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "operation_type" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "liquidation_date" TIMESTAMP(3),
    "client_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net_to_client" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_id" BIGINT NOT NULL,
    "terminal_id" BIGINT,
    "file_id" BIGINT NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement" (
    "id" BIGSERIAL NOT NULL,
    "settlement_id" TEXT,
    "authorization_number" TEXT,
    "reference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "settled_amount" DOUBLE PRECISION,
    "card_brand" "CardBrand" NOT NULL,
    "status" TEXT,
    "settlement_date" TIMESTAMP(3) NOT NULL,
    "transaction_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_id" BIGINT NOT NULL,
    "terminal_id" BIGINT,
    "file_id" BIGINT NOT NULL,

    CONSTRAINT "settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation" (
    "id" BIGSERIAL NOT NULL,
    "priority_used" "ReconciliationPriority" NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "amount_difference" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "settlement_id" BIGINT NOT NULL,

    CONSTRAINT "reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" BIGSERIAL NOT NULL,
    "payout_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "total_commission" DOUBLE PRECISION NOT NULL,
    "total_net" DOUBLE PRECISION NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_id" BIGINT NOT NULL,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_item" (
    "id" BIGSERIAL NOT NULL,
    "gross_amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "net_amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payout_id" BIGINT NOT NULL,
    "transaction_id" BIGINT NOT NULL,

    CONSTRAINT "payout_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE UNIQUE INDEX "client_code_key" ON "client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "client_tax_id_key" ON "client"("tax_id");

-- CreateIndex
CREATE INDEX "client_code_idx" ON "client"("code");

-- CreateIndex
CREATE INDEX "client_tax_id_idx" ON "client"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_serial_number_key" ON "terminal"("serial_number");

-- CreateIndex
CREATE INDEX "terminal_serial_number_idx" ON "terminal"("serial_number");

-- CreateIndex
CREATE INDEX "terminal_client_id_idx" ON "terminal"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_control_file_name_key" ON "file_control"("file_name");

-- CreateIndex
CREATE INDEX "file_control_file_type_idx" ON "file_control"("file_type");

-- CreateIndex
CREATE INDEX "file_control_status_idx" ON "file_control"("status");

-- CreateIndex
CREATE INDEX "file_control_uploaded_by_idx" ON "file_control"("uploaded_by");

-- CreateIndex
CREATE INDEX "transaction_client_id_idx" ON "transaction"("client_id");

-- CreateIndex
CREATE INDEX "transaction_terminal_id_idx" ON "transaction"("terminal_id");

-- CreateIndex
CREATE INDEX "transaction_file_id_idx" ON "transaction"("file_id");

-- CreateIndex
CREATE INDEX "transaction_transaction_date_idx" ON "transaction"("transaction_date");

-- CreateIndex
CREATE INDEX "transaction_authorization_number_idx" ON "transaction"("authorization_number");

-- CreateIndex
CREATE INDEX "transaction_status_idx" ON "transaction"("status");

-- CreateIndex
CREATE INDEX "transaction_is_excluded_idx" ON "transaction"("is_excluded");

-- CreateIndex
CREATE INDEX "transaction_liquidation_date_idx" ON "transaction"("liquidation_date");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_transaction_id_authorization_number_transaction_key" ON "transaction"("transaction_id", "authorization_number", "transaction_date");

-- CreateIndex
CREATE INDEX "settlement_client_id_idx" ON "settlement"("client_id");

-- CreateIndex
CREATE INDEX "settlement_terminal_id_idx" ON "settlement"("terminal_id");

-- CreateIndex
CREATE INDEX "settlement_file_id_idx" ON "settlement"("file_id");

-- CreateIndex
CREATE INDEX "settlement_settlement_date_idx" ON "settlement"("settlement_date");

-- CreateIndex
CREATE INDEX "settlement_authorization_number_idx" ON "settlement"("authorization_number");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_settlement_id_authorization_number_settlement_da_key" ON "settlement"("settlement_id", "authorization_number", "settlement_date");

-- CreateIndex
CREATE INDEX "reconciliation_transaction_id_idx" ON "reconciliation"("transaction_id");

-- CreateIndex
CREATE INDEX "reconciliation_settlement_id_idx" ON "reconciliation"("settlement_id");

-- CreateIndex
CREATE INDEX "reconciliation_status_idx" ON "reconciliation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_transaction_id_settlement_id_key" ON "reconciliation"("transaction_id", "settlement_id");

-- CreateIndex
CREATE INDEX "payout_client_id_idx" ON "payout"("client_id");

-- CreateIndex
CREATE INDEX "payout_status_idx" ON "payout"("status");

-- CreateIndex
CREATE INDEX "payout_payout_date_idx" ON "payout"("payout_date");

-- CreateIndex
CREATE UNIQUE INDEX "payout_item_transaction_id_key" ON "payout_item"("transaction_id");

-- CreateIndex
CREATE INDEX "payout_item_payout_id_idx" ON "payout_item"("payout_id");

-- CreateIndex
CREATE INDEX "payout_item_transaction_id_idx" ON "payout_item"("transaction_id");

-- AddForeignKey
ALTER TABLE "terminal" ADD CONSTRAINT "terminal_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_control" ADD CONSTRAINT "file_control_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_item" ADD CONSTRAINT "payout_item_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
