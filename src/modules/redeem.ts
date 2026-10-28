import { prisma, lockCustomer } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "./actor";
import { checkAfterRedeem } from "./alerts";
import { getBusiness, getSettings } from "./business";
import { customerTier } from "./customers";
import { appendEntry, getBalance } from "./ledger";
import { tierAtLeast } from "./rules";
import { IDEMPOTENCY_RE } from "./orders";
import { verifyPresenceToken } from "./qr";
import { enqueuePassUpdates, kickSync } from "./wallet/sync";

export interface RedeemInput {
  customerId: string;
  rewardId: string;
  /** توكن الحضور الذي يصدر للكاشير عند مسح QR من جوال العميل */
  presence: string;
  idempotencyKey: string;
}

type TxOutcome = { redemptionId: string; replayed: boolean; cost: number; unit: "POINT" | "STAMP" };

/**
 * الاستبدال: يُشترط أن يكون الكاشير قد فتح العميل بمسح QR من جواله (توكن الحضور)،
 * حتى لا تُصرف مكافأة لعميل غير موجود بمجرد معرفة رقم جواله.
 */
export async function redeemReward(actor: Actor, input: RedeemInput, now = new Date()) {
  if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) throw new AppError("BAD_REQUEST", "مفتاح العملية غير صالح");
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
      return { redemptionId: replay.id, replayed: true, cost: replay.cost, unit: replay.unit };
    }

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");

    if (!verifyPresenceToken(input.presence, customer.id, now)) {
      throw new AppError("SCAN_REQUIRED", "للاستبدال امسح QR من جوال العميل");
    }

    const reward = await tx.reward.findUnique({ where: { id: input.rewardId } });
    if (!reward || reward.businessId !== actor.businessId || !reward.active) {
      throw new AppError("NOT_FOUND", "المكافأة غير متاحة");
    }
    const tier = await customerTier(customer.id, settings, now, tx);
    if (!tierAtLeast(tier, reward.minTier)) throw new AppError("FORBIDDEN", "هذه المكافأة لمستوى أعلى");
    const balance = await getBalance(customer.id, reward.unit, tx);
    if (balance < reward.cost) throw new AppError("INSUFFICIENT_BALANCE", "الرصيد غير كافٍ لهذه المكافأة");

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
    await checkAfterRedeem(tx, {
      businessId: actor.businessId,
      staffId: actor.staffId,
      customerId: customer.id,
      settings,
      tz: business.timezone,
      now,
    });
    await enqueuePassUpdates(tx, [customer.id], now);
    return { redemptionId: redemption.id, replayed: false, cost: reward.cost, unit: reward.unit };
  });

  if (!outcome.replayed) kickSync();
  return {
    redemptionId: outcome.redemptionId,
    replayed: outcome.replayed,
    cost: outcome.cost,
    balance: await getBalance(input.customerId, outcome.unit),
  };
}
