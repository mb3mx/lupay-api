-- AlterTable: alinear con el schema Prisma (taxId String?)
-- Necesario para registrar clientes desde la "Consola de Discrepancias"
-- cuando el archivo cargado no trae RFC.
ALTER TABLE "client" ALTER COLUMN "tax_id" DROP NOT NULL;
