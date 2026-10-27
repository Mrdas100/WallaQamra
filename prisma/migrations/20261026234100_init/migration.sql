-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CASHIER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ProgramMode" AS ENUM ('POINTS', 'STAMPS');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('POINT', 'STAMP');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('EARN', 'REDEEM', 'REFUND_REVERSAL', 'MANUAL_ADJUST', 'CORRECTION', 'SIGNUP_BONUS', 'BIRTHDAY_BONUS', 'REFERRAL_BONUS', 'EXPIRY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('COMPLETED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('PASS_UPDATE', 'OFFER', 'NOTICE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'DONE', 'DEAD');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FREQUENT_SAME_CUSTOMER', 'CONSECUTIVE_REDEMPTIONS', 'OFF_HOURS', 'REDEEM_LOCKOUT', 'MANUAL_LIMIT_REACHED', 'LOGIN_LOCKOUT');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "businessId" TEXT NOT NULL,
    "programMode" "ProgramMode" NOT NULL DEFAULT 'POINTS',
    "pointsPerSar" INTEGER NOT NULL DEFAULT 1,
    "rewardThreshold" INTEGER NOT NULL DEFAULT 100,
    "stampsPerReward" INTEGER NOT NULL DEFAULT 8,
    "minStampAmountHalalas" INTEGER NOT NULL DEFAULT 1000,
    "maxOrderAmountHalalas" INTEGER NOT NULL DEFAULT 100000,
    "dailyMaxEarnTxns" INTEGER NOT NULL DEFAULT 3,
    "dailyMaxEarnPoints" INTEGER NOT NULL DEFAULT 500,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 300,
    "manualMaxPerShift" INTEGER NOT NULL DEFAULT 5,
    "manualMaxPointsPerShift" INTEGER NOT NULL DEFAULT 200,
    "shiftHours" INTEGER NOT NULL DEFAULT 8,
    "openMinute" INTEGER NOT NULL DEFAULT 420,
    "closeMinute" INTEGER NOT NULL DEFAULT 120,
    "alertSameCustomerCount" INTEGER NOT NULL DEFAULT 3,
    "alertSameCustomerWindowHours" INTEGER NOT NULL DEFAULT 24,
    "alertRedemptionsCount" INTEGER NOT NULL DEFAULT 2,
    "alertRedemptionsWindowHours" INTEGER NOT NULL DEFAULT 24,
    "redeemMaxAttempts" INTEGER NOT NULL DEFAULT 3,
    "redeemLockBaseMinutes" INTEGER NOT NULL DEFAULT 5,
    "silverSpendSar" INTEGER NOT NULL DEFAULT 300,
    "goldSpendSar" INTEGER NOT NULL DEFAULT 1000,
    "silverMultiplierPct" INTEGER NOT NULL DEFAULT 110,
    "goldMultiplierPct" INTEGER NOT NULL DEFAULT 125,
    "pointsExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 14,
    "signupBonus" INTEGER NOT NULL DEFAULT 20,
    "birthdayBonus" INTEGER NOT NULL DEFAULT 50,
    "referralBonusReferrer" INTEGER NOT NULL DEFAULT 30,
    "referralBonusReferee" INTEGER NOT NULL DEFAULT 30,
    "referralMonthlyCap" INTEGER NOT NULL DEFAULT 5,
    "promoWeeklyCap" INTEGER NOT NULL DEFAULT 2,
    "quietStartMinute" INTEGER NOT NULL DEFAULT 1380,
    "quietEndMinute" INTEGER NOT NULL DEFAULT 480,
    "offerMessage" TEXT NOT NULL DEFAULT '',
    "offerUpdatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "promoOptOut" BOOLEAN NOT NULL DEFAULT false,
    "cardKeyNonce" TEXT NOT NULL,
    "regDeviceHash" TEXT,
    "regIpHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletPass" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "serial" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "qrIssuedAt" TIMESTAMP(3),
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerText" TEXT NOT NULL DEFAULT '',
    "offerNotify" BOOLEAN NOT NULL DEFAULT false,
    "noticeText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "walletPassId" TEXT NOT NULL,
    "deviceLibraryId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "unit" "Unit" NOT NULL,
    "points" INTEGER NOT NULL,
    "orderId" TEXT,
    "redemptionId" TEXT,
    "reversesEntryId" TEXT,
    "reason" TEXT,
    "staffId" TEXT,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "amountHalalas" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED',
    "staffId" TEXT NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "refundedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cost" INTEGER NOT NULL,
    "unit" "Unit" NOT NULL DEFAULT 'POINT',
    "minTier" "Tier" NOT NULL DEFAULT 'BRONZE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "unit" "Unit" NOT NULL,
    "staffId" TEXT NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemCode" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedeemCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedeemGuard" (
    "customerId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockLevel" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedeemGuard_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CASHIER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockLevel" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "deviceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "staffId" TEXT,
    "customerId" TEXT,
    "details" JSONB NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSyncJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "walletPassId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL DEFAULT 'PASS_UPDATE',
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchLocation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "relevantText" TEXT NOT NULL,
    "maxDistance" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplierPct" INTEGER NOT NULL DEFAULT 200,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "daysMask" INTEGER NOT NULL DEFAULT 127,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoDelivery" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "walletPassId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpiryNotice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpiryNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE INDEX "Customer_businessId_createdAt_idx" ON "Customer"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phone_key" ON "Customer"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WalletPass_serial_key" ON "WalletPass"("serial");

-- CreateIndex
CREATE INDEX "WalletPass_businessId_platform_idx" ON "WalletPass"("businessId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "WalletPass_customerId_platform_key" ON "WalletPass"("customerId", "platform");

-- CreateIndex
CREATE INDEX "DeviceRegistration_walletPassId_idx" ON "DeviceRegistration"("walletPassId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_deviceLibraryId_walletPassId_key" ON "DeviceRegistration"("deviceLibraryId", "walletPassId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reversesEntryId_key" ON "LedgerEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "LedgerEntry_customerId_createdAt_idx" ON "LedgerEntry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_businessId_createdAt_idx" ON "LedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_staffId_createdAt_idx" ON "LedgerEntry"("staffId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_businessId_idempotencyKey_key" ON "LedgerEntry"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_externalRef_key" ON "Order"("businessId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_idempotencyKey_key" ON "Order"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Reward_businessId_active_idx" ON "Reward"("businessId", "active");

-- CreateIndex
CREATE INDEX "Redemption_customerId_createdAt_idx" ON "Redemption"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_businessId_idempotencyKey_key" ON "Redemption"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RedeemCode_customerId_createdAt_idx" ON "RedeemCode"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_businessId_username_key" ON "Staff"("businessId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "FraudAlert_businessId_acknowledgedAt_createdAt_idx" ON "FraudAlert"("businessId", "acknowledgedAt", "createdAt");

-- CreateIndex
CREATE INDEX "WalletSyncJob_status_nextRunAt_idx" ON "WalletSyncJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "WalletSyncJob_walletPassId_status_idx" ON "WalletSyncJob"("walletPassId", "status");

-- CreateIndex
CREATE INDEX "BranchLocation_businessId_active_idx" ON "BranchLocation"("businessId", "active");

-- CreateIndex
CREATE INDEX "Campaign_businessId_active_idx" ON "Campaign"("businessId", "active");

-- CreateIndex
CREATE INDEX "PromoDelivery_customerId_createdAt_idx" ON "PromoDelivery"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpiryNotice_customerId_periodKey_key" ON "ExpiryNotice"("customerId", "periodKey");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletPass" ADD CONSTRAINT "WalletPass_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_walletPassId_fkey" FOREIGN KEY ("walletPassId") REFERENCES "WalletPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletSyncJob" ADD CONSTRAINT "WalletSyncJob_walletPassId_fkey" FOREIGN KEY ("walletPassId") REFERENCES "WalletPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

