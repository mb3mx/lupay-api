-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('GROUP', 'COLLAPSE', 'ITEM');

-- CreateTable
CREATE TABLE "menu_item" (
    "id" BIGSERIAL NOT NULL,
    "parent_id" BIGINT,
    "title" TEXT NOT NULL,
    "translate_key" TEXT,
    "type" "MenuItemType" NOT NULL DEFAULT 'ITEM',
    "icon" TEXT,
    "url" TEXT,
    "exact_match" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roles" "UserRole"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_parent_id_idx" ON "menu_item"("parent_id");

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
