import type { Campaign, ProgramMode, Settings, Tier, Unit } from "@prisma/client";
import { inWindow, minuteOfDay, zonedParts } from "@/lib/time";

// قواعد الاحتساب (دوال نقية قابلة للاختبار). النقاط تُحسب في السيرفر فقط من المبلغ.

export const unitForMode = (mode: ProgramMode): Unit => (mode === "STAMPS" ? "STAMP" : "POINT");

export function tierForSpend(spendHalalas: number, s: Pick<Settings, "silverSpendSar" | "goldSpendSar">): Tier {
  const sar = spendHalalas / 100;
  if (sar >= s.goldSpendSar) return "GOLD";
  if (sar >= s.silverSpendSar) return "SILVER";
  return "BRONZE";
}

export function tierMultiplierPct(tier: Tier, s: Pick<Settings, "silverMultiplierPct" | "goldMultiplierPct">): number {
  if (tier === "GOLD") return s.goldMultiplierPct;
  if (tier === "SILVER") return s.silverMultiplierPct;
  return 100;
}

const TIER_RANK: Record<Tier, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };
export const tierAtLeast = (tier: Tier, min: Tier) => TIER_RANK[tier] >= TIER_RANK[min];

export const TIER_LABEL: Record<Tier, string> = { BRONZE: "برونزي", SILVER: "فضي", GOLD: "ذهبي" };

/** أعلى مضاعِف لحملة فعّالة الآن (100 = بدون حملة) */
export function campaignMultiplierPct(
  campaigns: Pick<Campaign, "active" | "startsAt" | "endsAt" | "startMinute" | "endMinute" | "daysMask" | "multiplierPct">[],
  now: Date,
  tz: string,
): number {
  const weekday = zonedParts(now, tz).weekday;
  const minute = minuteOfDay(now, tz);
  let best = 100;
  for (const c of campaigns) {
    if (!c.active || now < c.startsAt || now >= c.endsAt) continue;
    if ((c.daysMask & (1 << weekday)) === 0) continue;
    if (c.startMinute != null && c.endMinute != null && !inWindow(minute, c.startMinute, c.endMinute)) continue;
    best = Math.max(best, c.multiplierPct);
  }
  return best;
}

export interface EarnCalc {
  unit: Unit;
  points: number;
  base: number;
  tierPct: number;
  campaignPct: number;
}

export function computeEarn(
  s: Pick<
    Settings,
    "programMode" | "pointsPerSar" | "minStampAmountHalalas" | "silverMultiplierPct" | "goldMultiplierPct"
  >,
  amountHalalas: number,
  tier: Tier,
  campaignPct: number,
  cups = 1,
): EarnCalc {
  if (s.programMode === "STAMPS") {
    // ختم لكل كوب، بشرط أن تغطي قيمة الطلب أقل سعر للكوب لكل الأكواب
    const qualifies = cups >= 1 && amountHalalas >= s.minStampAmountHalalas * cups;
    const stamps = qualifies ? Math.max(cups, Math.floor((cups * campaignPct) / 100)) : 0;
    return { unit: "STAMP", points: stamps, base: qualifies ? cups : 0, tierPct: 100, campaignPct };
  }
  const base = Math.floor((amountHalalas * s.pointsPerSar) / 100);
  const tierPct = tierMultiplierPct(tier, s);
  const points = Math.floor((base * tierPct * campaignPct) / 10000);
  return { unit: "POINT", points, base, tierPct, campaignPct };
}

/** قيمة المكافآت (تسجيل/ميلاد/إحالة) حسب وضع البرنامج: في وضع الختمات تساوي ختماً واحداً */
export function bonusAmount(mode: ProgramMode, configured: number): number {
  if (configured <= 0) return 0;
  return mode === "STAMPS" ? 1 : configured;
}

export function isOffHours(s: Pick<Settings, "openMinute" | "closeMinute">, now: Date, tz: string): boolean {
  return !inWindow(minuteOfDay(now, tz), s.openMinute, s.closeMinute);
}

export function isQuietHours(s: Pick<Settings, "quietStartMinute" | "quietEndMinute">, now: Date, tz: string): boolean {
  if (s.quietStartMinute === s.quietEndMinute) return false;
  return inWindow(minuteOfDay(now, tz), s.quietStartMinute, s.quietEndMinute);
}
export const MAX_LOCATIONS = 10;
