import type { Tier, Unit } from "@prisma/client";
import { MAX_LOCATIONS } from "./rules";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasRole, type Actor } from "./actor";
import { audit } from "./audit";
import { enqueueAllPasses, kickSync } from "./wallet/sync";

function requireAdmin(actor: Actor) {
  if (!hasRole(actor.role, "ADMIN")) throw new AppError("FORBIDDEN", "هذه العملية للأدمن فقط");
}

// ===== كتالوج المكافآت =====

export interface RewardInput {
  name: string;
  description?: string;
  cost: number;
  unit: Unit;
  minTier: Tier;
  active: boolean;
  sortOrder?: number;
}

function checkReward(i: RewardInput) {
  if (i.name.trim().length < 2) throw new AppError("BAD_REQUEST", "اسم المكافأة مطلوب");
  if (!Number.isInteger(i.cost) || i.cost <= 0 || i.cost > 1_000_000) throw new AppError("BAD_REQUEST", "التكلفة غير صالحة");
}

export async function saveReward(actor: Actor, id: string | null, input: RewardInput) {
  requireAdmin(actor);
  checkReward(input);
  const data = {
    name: input.name.trim().slice(0, 60),
    description: (input.description ?? "").trim().slice(0, 200),
    cost: input.cost,
    unit: input.unit,
    minTier: input.minTier,
    active: input.active,
    sortOrder: input.sortOrder ?? 0,
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.reward.findUnique({ where: { id } });
      if (!before || before.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "المكافأة غير موجودة");
      const r = await tx.reward.update({ where: { id }, data });
      await audit(actor, "reward.update", "Reward", id, before, r, tx);
      return r;
    }
    const r = await tx.reward.create({ data: { ...data, businessId: actor.businessId } });
    await audit(actor, "reward.create", "Reward", r.id, null, r, tx);
    return r;
  });
}

// ===== الحملات (نقاط مضاعفة) =====

export interface CampaignInput {
  name: string;
  multiplierPct: number;
  startsAt: Date;
  endsAt: Date;
  startMinute?: number | null;
  endMinute?: number | null;
  daysMask?: number;
  active: boolean;
}

export async function saveCampaign(actor: Actor, id: string | null, input: CampaignInput) {
  requireAdmin(actor);
  if (input.multiplierPct < 100 || input.multiplierPct > 500) throw new AppError("BAD_REQUEST", "المضاعِف بين 100% و500%");
  if (!(input.endsAt > input.startsAt)) throw new AppError("BAD_REQUEST", "تاريخ النهاية يجب أن يكون بعد البداية");
  const validMinute = (m: number | null | undefined) => m == null || (Number.isInteger(m) && m >= 0 && m < 1440);
  if (!validMinute(input.startMinute) || !validMinute(input.endMinute)) throw new AppError("BAD_REQUEST", "الوقت غير صالح");
  if ((input.startMinute == null) !== (input.endMinute == null)) {
    throw new AppError("BAD_REQUEST", "حدد بداية ونهاية الساعات معاً");
  }
  const data = {
    name: input.name.trim().slice(0, 60),
    multiplierPct: input.multiplierPct,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    startMinute: input.startMinute ?? null,
    endMinute: input.endMinute ?? null,
    daysMask: input.daysMask ?? 127,
    active: input.active,
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.campaign.findUnique({ where: { id } });
      if (!before || before.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "الحملة غير موجودة");
      const c = await tx.campaign.update({ where: { id }, data });
      await audit(actor, "campaign.update", "Campaign", id, before, c, tx);
      return c;
    }
    const c = await tx.campaign.create({ data: { ...data, businessId: actor.businessId } });
    await audit(actor, "campaign.create", "Campaign", c.id, null, c, tx);
    return c;
  });
}

// ===== الفروع (Wallet Locations) =====

export { MAX_LOCATIONS } from "./rules";

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
  relevantText: string;
  maxDistance: number;
  active: boolean;
}

export async function saveLocation(actor: Actor, id: string | null, input: LocationInput, now = new Date()) {
  requireAdmin(actor);
  if (!(input.latitude >= -90 && input.latitude <= 90 && input.longitude >= -180 && input.longitude <= 180)) {
    throw new AppError("BAD_REQUEST", "الإحداثيات غير صحيحة");
  }
  if (!Number.isInteger(input.maxDistance) || input.maxDistance < 10 || input.maxDistance > 1000) {
    throw new AppError("BAD_REQUEST", "المسافة بين 10 و1000 متر");
  }
  const text = input.relevantText.trim();
  if (text.length < 2 || text.length > 120) throw new AppError("BAD_REQUEST", "نص التنبيه بين 2 و120 حرفاً");
  const data = {
    name: input.name.trim().slice(0, 60),
    latitude: input.latitude,
    longitude: input.longitude,
    relevantText: text,
    maxDistance: input.maxDistance,
    active: input.active,
  };
  const loc = await prisma.$transaction(async (tx) => {
    if (input.active) {
      const activeCount = await tx.branchLocation.count({
        where: { businessId: actor.businessId, active: true, ...(id ? { id: { not: id } } : {}) },
      });
      if (activeCount >= MAX_LOCATIONS) throw new AppError("BAD_REQUEST", "الحد الأقصى 10 مواقع فعّالة");
    }
    if (id) {
      const before = await tx.branchLocation.findUnique({ where: { id } });
      if (!before || before.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "الموقع غير موجود");
      const l = await tx.branchLocation.update({ where: { id }, data });
      await audit(actor, "location.update", "BranchLocation", id, before, l, tx);
      return l;
    }
    const l = await tx.branchLocation.create({ data: { ...data, businessId: actor.businessId } });
    await audit(actor, "location.create", "BranchLocation", l.id, null, l, tx);
    return l;
  });
  // أي تعديل على المواقع يحدّث كل البطاقات
  await enqueueAllPasses(actor.businessId, "PASS_UPDATE", null, now);
  kickSync();
  return loc;
}

export async function deleteLocation(actor: Actor, id: string, now = new Date()) {
  requireAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const before = await tx.branchLocation.findUnique({ where: { id } });
    if (!before || before.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "الموقع غير موجود");
    await tx.branchLocation.delete({ where: { id } });
    await audit(actor, "location.delete", "BranchLocation", id, before, null, tx);
  });
  await enqueueAllPasses(actor.businessId, "PASS_UPDATE", null, now);
  kickSync();
}
