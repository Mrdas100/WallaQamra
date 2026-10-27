-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cups" INTEGER;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "maxCupsPerOrder" INTEGER NOT NULL DEFAULT 6;


-- برنامج شاهي قمرا: بطاقة أختام، 5 أكواب والسادس مجاناً (قابلة للتعديل من لوحة الإدارة)
UPDATE "Settings" SET "programMode" = 'STAMPS', "stampsPerReward" = 5, "minStampAmountHalalas" = 300;
UPDATE "Reward" SET "cost" = 5, "name" = 'كوب مجاني', "description" = 'السادس علينا بعد 5 أكواب' WHERE "unit" = 'STAMP';
UPDATE "Reward" SET "active" = false WHERE "unit" = 'POINT';
