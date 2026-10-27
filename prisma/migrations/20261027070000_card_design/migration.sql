-- إضافة فقط: جدولان جديدان لتصميم البطاقة. لا يغيّر أي جدول قائم ولا أي بيانات عملاء.
-- للتراجع اليدوي: نفّذ down.sql في نفس المجلد.

-- CreateEnum
CREATE TYPE "DesignStage" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "CardDesign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stage" "DesignStage" NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardDesign_businessId_stage_key" ON "CardDesign"("businessId", "stage");

-- CreateIndex
CREATE INDEX "DesignAsset_businessId_createdAt_idx" ON "DesignAsset"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_businessId_sha256_key" ON "DesignAsset"("businessId", "sha256");

-- AddForeignKey
ALTER TABLE "CardDesign" ADD CONSTRAINT "CardDesign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

