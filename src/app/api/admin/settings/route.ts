import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { updateSettings } from "@/modules/admin";
import { getSettings } from "@/modules/business";

const n = (min: number, max: number) => z.number().int().min(min).max(max).optional();
const minute = n(0, 1439);

const Patch = z
  .object({
    programMode: z.enum(["POINTS", "STAMPS"]).optional(),
    pointsPerSar: n(0, 100),
    rewardThreshold: n(1, 100000),
    stampsPerReward: n(1, 50),
    minStampAmountHalalas: n(0, 1000000),
    maxCupsPerOrder: n(1, 50),
    maxOrderAmountHalalas: n(100, 10000000),
    dailyMaxEarnTxns: n(1, 100),
    dailyMaxEarnPoints: n(1, 1000000),
    cooldownSeconds: n(0, 86400),
    manualMaxPerShift: n(0, 1000),
    manualMaxPointsPerShift: n(0, 1000000),
    shiftHours: n(1, 24),
    openMinute: minute,
    closeMinute: minute,
    alertSameCustomerCount: n(1, 100),
    alertSameCustomerWindowHours: n(1, 720),
    alertRedemptionsCount: n(1, 100),
    alertRedemptionsWindowHours: n(1, 720),
    redeemMaxAttempts: n(1, 20),
    redeemLockBaseMinutes: n(1, 1440),
    silverSpendSar: n(0, 1000000),
    goldSpendSar: n(0, 1000000),
    silverMultiplierPct: n(100, 500),
    goldMultiplierPct: n(100, 500),
    pointsExpiryDays: n(0, 3650),
    expiryWarningDays: n(1, 90),
    signupBonus: n(0, 100000),
    birthdayBonus: n(0, 100000),
    referralBonusReferrer: n(0, 100000),
    referralBonusReferee: n(0, 100000),
    referralMonthlyCap: n(0, 1000),
    promoWeeklyCap: n(0, 50),
    quietStartMinute: minute,
    quietEndMinute: minute,
    offerMessage: z.string().max(140).optional(),
  })
  .strict();

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) => getSettings(actor.businessId));

export const PATCH = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) =>
  updateSettings(actor, await parseJson(req, Patch)),
);
