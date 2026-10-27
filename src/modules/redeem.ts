import type { Settings } from "@prisma/client";
import { prisma, lockCustomer } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomDigits, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { addMinutes } from "@/lib/time";
import type { Actor } from "./actor";
import { checkAfterRedeem, raiseAlert } from "./alerts";
import { getBusiness, getSettings } from "./business";
import { customerTier } from "./customers";
import { appendEntry, getBalance } from "./ledger";
import { tierAtLeast } from "./rules";
import { IDEMPOTENCY_RE } from "./orders";
import { enqueuePassUpdates, kickSync } from "./wallet/sync";

export const REDEEM_CODE_TTL_SECONDS = 120;
const CODE_LENGTH = 6;

const codeHash = (customerId: string, code: string) => sha256(`${env.hashSalt}|redeem|${customerId}|${code}`);

/** ينشئ كود استبدال لمرة واحدة يظهر للعميل فقط في صفحة بطاقته (ينتهي بعد دقيقتين) */
export async function issueRedeemCode(customerId: string, businessId: string, now = new Date()) {
  const code = randomDigits(CODE_LENGTH);
  const expiresAt = new Date(now.getTime() + REDEEM_CODE_TTL_SECONDS * 1000);
  await prisma.$transaction([
    // أي كود سابق غير مستخدم يُلغى
    prisma.redeemCode.updateMany({
      where: { customerId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    }),
    prisma.redeemCode.create({ data: { businessId, customerId, codeHash: codeHash(customerId, code), expiresAt } }),
  ]);
  return { code, expiresAt };
}

/** مدة القفل تتضاعف مع كل قفل جديد: base, 2×base, 4×base ... (حد أقصى 24 ساعة) */
export const lockMinutes = (s: Pick<Settings, "redeemLockBaseMinutes">, lockLevel: number): number =>
  Math.min(s.redeemLockBaseMinutes * 2 ** Math.max(0, lockLevel - 1), 24 * 60);

export interface RedeemInput {
  customerId: string;
  rewardId: string;
  code: string;
  idempotencyKey: string;
}

type TxOutcome =
  | { kind: "ok"; redemptionId: string; replayed: boolean; cost: number; unit: "POINT" | "STAMP" }
  | { kind: "locked"; until: Date }
  | { kind: "invalid"; remaining: number; lockedUntil: Date | null; lockLevel: number };

export async function redeemReward(actor: Actor, input: RedeemInput, now = new Date()) {
  if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) throw new AppError("BAD_REQUEST", "مفتاح العملية غير صالح");
  const code = input.code.trim();
  const [settings, business] = await Promise.all([getSettings(actor.businessId), getBusiness(actor.businessId)]);

  const outcome: TxOutcome = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, input.customerId);

    const replay = await tx.redemption.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.customerId !== input.customerId || replay.rewardId !== input.rewardId) {
        throw new AppError("CONFLICT", "مفتاح العملية مستخدم لعملية أخرى");
      }
      return { kind: "ok", redemptionId: replay.id, replayed: true, cost: replay.cost, unit: replay.unit };
    }

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");

    const guard = await tx.redeemGuard.upsert({
      where: { customerId: customer.id },
      update: {},
      create: { customerId: customer.id, businessId: actor.businessId },
    });
    if (guard.lockedUntil && guard.lockedUntil > now) return { kind: "locked", until: guard.lockedUntil };

    const candidates = /^\d{6}$/.test(code)
      ? await tx.redeemCode.findMany({
          where: { customerId: customer.id, usedAt: null, expiresAt: { gt: now }, codeHash: codeHash(customer.id, code) },
          take: 1,
        })
      : [];

    if (candidates.length === 0) {
      const failed = guard.failedCount + 1;
      if (failed >= settings.redeemMaxAttempts) {
        const level = guard.lockLevel + 1;
        const until = addMinutes(now, lockMinutes(settings, level));
        await tx.redeemGuard.update({
          where: { customerId: customer.id },
          data: { failedCount: 0, lockLevel: level, lockedUntil: until },
        });
        // إلغاء أي كود فعّال حتى لا يُخمَّن بعد فك القفل
        await tx.redeemCode.updateMany({ where: { customerId: customer.id, usedAt: null }, data: { expiresAt: now } });
        await raiseAlert(tx, {
          businessId: actor.businessId,
          type: "REDEEM_LOCKOUT",
          staffId: actor.staffId,
          customerId: customer.id,
          details: { lockLevel: level, lockedUntil: until.toISOString() },
        }, now);
        return { kind: "invalid", remaining: 0, lockedUntil: until, lockLevel: level };
      }
      await tx.redeemGuard.update({ where: { customerId: customer.id }, data: { failedCount: failed } });
      return { kind: "invalid", remaining: settings.redeemMaxAttempts - failed, lockedUntil: null, lockLevel: guard.lockLevel };
    }

    const reward = await tx.reward.findUnique({ where: { id: input.rewardId } });
    if (!reward || reward.businessId !== actor.businessId || !reward.active) {
      throw new AppError("NOT_FOUND", "المكافأة غير متاحة");
    }
    const tier = await customerTier(customer.id, settings, now, tx);
    if (!tierAtLeast(tier, reward.minTier)) throw new AppError("FORBIDDEN", "هذه المكافأة لمستوى أعلى");
    const balance = await getBalance(customer.id, reward.unit, tx);
    if (balance < reward.cost) throw new AppError("INSUFFICIENT_BALANCE", "الرصيد غير كافٍ لهذه المكافأة");

    const used = await tx.redeemCode.updateMany({
      where: { id: candidates[0].id, usedAt: null },
      data: { usedAt: now },
    });
    if (used.count !== 1) throw new AppError("INVALID_CODE", "الكود مستخدم مسبقاً");

    const redemption = await tx.redemption.create({
      data: {
        businessId: actor.businessId,
        customerId: customer.id,
        rewardId: reward.id,
        cost: reward.cost,
        unit: reward.unit,
        staffId: actor.staffId,
        deviceId: actor.deviceId,
        ip: actor.ip,
        userAgent: actor.userAgent,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      },
    });
    await appendEntry(tx, {
      businessId: actor.businessId,
      customerId: customer.id,
      type: "REDEEM",
      unit: reward.unit,
      points: -reward.cost,
      idempotencyKey: `redeem:${redemption.id}`,
      actor,
      redemptionId: redemption.id,
      reason: reward.name,
      now,
    });
    await tx.redeemGuard.update({
      where: { customerId: customer.id },
      data: { failedCount: 0, lockLevel: 0, lockedUntil: null },
    });
    await checkAfterRedeem(tx, {
      businessId: actor.businessId,
      staffId: actor.staffId,
      customerId: customer.id,
      settings,
      tz: business.timezone,
      now,
    });
    await enqueuePassUpdates(tx, [customer.id], now);
    return { kind: "ok", redemptionId: redemption.id, replayed: false, cost: reward.cost, unit: reward.unit };
  });

  if (outcome.kind === "locked") {
    throw new AppError("LOCKED", "الاستبدال مقفل مؤقتاً لهذا العميل بسبب محاولات خاطئة", {
      lockedUntil: outcome.until.toISOString(),
    });
  }
  if (outcome.kind === "invalid") {
    if (outcome.lockedUntil) {
      throw new AppError("LOCKED", "كود خاطئ. تم قفل الاستبدال مؤقتاً", {
        lockedUntil: outcome.lockedUntil.toISOString(),
        lockLevel: outcome.lockLevel,
      });
    }
    throw new AppError("INVALID_CODE", "الكود غير صحيح أو منتهي", { remainingAttempts: outcome.remaining });
  }
  if (!outcome.replayed) kickSync();
  return {
    redemptionId: outcome.redemptionId,
    replayed: outcome.replayed,
    cost: outcome.cost,
    balance: await getBalance(input.customerId, outcome.unit),
  };
}
