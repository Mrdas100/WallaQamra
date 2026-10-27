import type { LedgerEntry, Order } from "@prisma/client";
import { prisma, lockCustomer, lockKey } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { startOfLocalDay } from "@/lib/time";
import type { Actor } from "./actor";
import { checkAfterEarn, checkOffHours } from "./alerts";
import { getBusiness, getSettings } from "./business";
import { customerTier } from "./customers";
import { appendEntry, getBalance, reverseEntry } from "./ledger";
import { grantFirstOrderBonuses } from "./bonuses";
import { campaignMultiplierPct, computeEarn, unitForMode } from "./rules";
import { enqueuePassUpdates, kickSync } from "./wallet/sync";

export const EXTERNAL_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;

export interface EarnInput {
  customerId: string;
  externalRef: string;
  amountHalalas: number;
  idempotencyKey: string;
  /** وضع الأختام: عدد الأكواب (افتراضياً 1) */
  cups?: number;
}

export interface EarnResult {
  order: Order;
  entry: LedgerEntry | null;
  points: number;
  balance: number;
  replayed: boolean;
  calc: { base: number; tierPct: number; campaignPct: number };
}

/**
 * إضافة نقاط لطلب. النقاط تُحسب هنا من المبلغ — لا يُقبل أي عدد نقاط من الكاشير.
 * رقم الطلب فريد + مفتاح idempotency: نفس الطلب لا يُحتسب مرتين.
 */
export async function earnForOrder(actor: Actor, input: EarnInput, now = new Date()): Promise<EarnResult> {
  if (!EXTERNAL_REF_RE.test(input.externalRef)) throw new AppError("BAD_REQUEST", "رقم الطلب غير صالح");
  if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) throw new AppError("BAD_REQUEST", "مفتاح العملية غير صالح");
  if (!Number.isInteger(input.amountHalalas) || input.amountHalalas <= 0) {
    throw new AppError("BAD_REQUEST", "المبلغ غير صالح");
  }

  const [settings, business] = await Promise.all([getSettings(actor.businessId), getBusiness(actor.businessId)]);
  if (input.amountHalalas > settings.maxOrderAmountHalalas) {
    throw new AppError("BAD_REQUEST", "المبلغ أكبر من الحد المسموح للطلب الواحد");
  }
  const stampsMode = settings.programMode === "STAMPS";
  const cups = stampsMode ? (input.cups ?? 1) : undefined;
  if (cups !== undefined) {
    if (!Number.isInteger(cups) || cups < 1) throw new AppError("BAD_REQUEST", "عدد الأكواب غير صالح");
    if (cups > settings.maxCupsPerOrder) {
      throw new AppError("BAD_REQUEST", `أقصى عدد أكواب للطلب الواحد ${settings.maxCupsPerOrder}`);
    }
    // بدون عدد صريح: طلب أقل من سعر الكوب يُسجَّل بلا ختم (مثل الطريقة القديمة)
    if (input.cups !== undefined && input.amountHalalas < settings.minStampAmountHalalas * cups) {
      throw new AppError("BAD_REQUEST", "عدد الأكواب لا يتناسب مع قيمة الطلب");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // قفل رقم الطلب أولاً (يمنع احتساب نفس الطلب لعميلين بالتوازي) ثم قفل العميل
    await lockKey(tx, `order:${actor.businessId}:${input.externalRef}`);
    await lockCustomer(tx, input.customerId);

    const byKey = await tx.order.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: input.idempotencyKey } },
      include: { entries: { where: { type: "EARN" } } },
    });
    if (byKey) {
      if (byKey.externalRef !== input.externalRef || byKey.customerId !== input.customerId) {
        throw new AppError("CONFLICT", "مفتاح العملية مستخدم لطلب آخر");
      }
      return { order: byKey, entry: byKey.entries[0] ?? null, replayed: true, touched: [] as string[], calc: null };
    }
    const byRef = await tx.order.findUnique({
      where: { businessId_externalRef: { businessId: actor.businessId, externalRef: input.externalRef } },
    });
    if (byRef) throw new AppError("DUPLICATE_ORDER", "رقم الطلب مسجّل مسبقاً ولا يمكن احتسابه مرة أخرى");

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");

    // فترة الانتظار بين عمليتين لنفس العميل
    const last = await tx.order.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
    if (last && now.getTime() - last.createdAt.getTime() < settings.cooldownSeconds * 1000) {
      const wait = Math.ceil((settings.cooldownSeconds * 1000 - (now.getTime() - last.createdAt.getTime())) / 1000);
      throw new AppError("COOLDOWN", `يجب الانتظار ${wait} ثانية قبل عملية جديدة لنفس العميل`, { retryAfter: wait });
    }

    const tier = await customerTier(customer.id, settings, now, tx);
    const campaigns = await tx.campaign.findMany({ where: { businessId: actor.businessId, active: true } });
    const calc = computeEarn(settings, input.amountHalalas, tier, campaignMultiplierPct(campaigns, now, business.timezone), cups);

    // السقف اليومي: عدد العمليات ومجموع النقاط
    const dayStart = startOfLocalDay(now, business.timezone);
    const todayCount = await tx.order.count({ where: { customerId: customer.id, createdAt: { gte: dayStart } } });
    if (todayCount + 1 > settings.dailyMaxEarnTxns) {
      throw new AppError("DAILY_CAP", "تم بلوغ الحد اليومي لعدد العمليات لهذا العميل");
    }
    if (calc.unit === "POINT") {
      const todayPoints = await tx.ledgerEntry.aggregate({
        where: { customerId: customer.id, type: "EARN", unit: "POINT", createdAt: { gte: dayStart } },
        _sum: { points: true },
      });
      if ((todayPoints._sum.points ?? 0) + calc.points > settings.dailyMaxEarnPoints) {
        throw new AppError("DAILY_CAP", "تم بلوغ الحد اليومي للنقاط لهذا العميل");
      }
    }

    const order = await tx.order.create({
      data: {
        businessId: actor.businessId,
        customerId: customer.id,
        externalRef: input.externalRef,
        amountHalalas: input.amountHalalas,
        cups,
        staffId: actor.staffId,
        deviceId: actor.deviceId,
        ip: actor.ip,
        userAgent: actor.userAgent,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      },
    });

    let entry: LedgerEntry | null = null;
    if (calc.points > 0) {
      entry = (
        await appendEntry(tx, {
          businessId: actor.businessId,
          customerId: customer.id,
          type: "EARN",
          unit: calc.unit,
          points: calc.points,
          idempotencyKey: `earn:${order.id}`,
          actor,
          orderId: order.id,
          expiryDays: settings.pointsExpiryDays,
          now,
        })
      ).entry;
    }

    const touched = [customer.id];
    const completed = await tx.order.count({ where: { customerId: customer.id } });
    if (completed === 1) {
      touched.push(...(await grantFirstOrderBonuses(tx, { customer, orderId: order.id, settings, actor, now })));
    }

    await checkAfterEarn(tx, {
      businessId: actor.businessId,
      staffId: actor.staffId,
      customerId: customer.id,
      settings,
      tz: business.timezone,
      now,
    });
    await enqueuePassUpdates(tx, touched, now);
    return { order, entry, replayed: false, touched, calc };
  });

  if (!result.replayed) kickSync();
  const unit = result.entry?.unit ?? unitForMode(settings.programMode);
  return {
    order: result.order,
    entry: result.entry,
    points: result.entry?.points ?? 0,
    balance: await getBalance(result.order.customerId, unit),
    replayed: result.replayed,
    calc: result.calc
      ? { base: result.calc.base, tierPct: result.calc.tierPct, campaignPct: result.calc.campaignPct }
      : { base: 0, tierPct: 100, campaignPct: 100 },
  };
}

/** المرتجع: يعكس تلقائياً كل النقاط المرتبطة بالطلب (بما فيها مكافآت أول طلب) */
export async function refundOrder(actor: Actor, input: { externalRef: string; reason?: string }, now = new Date()) {
  if (!EXTERNAL_REF_RE.test(input.externalRef)) throw new AppError("BAD_REQUEST", "رقم الطلب غير صالح");
  const settings = await getSettings(actor.businessId);
  const business = await getBusiness(actor.businessId);
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { businessId_externalRef: { businessId: actor.businessId, externalRef: input.externalRef } },
    });
    if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
    await lockCustomer(tx, order.customerId);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (fresh.status === "REFUNDED") throw new AppError("CONFLICT", "الطلب مُرجع مسبقاً");

    const entries = await tx.ledgerEntry.findMany({
      where: { orderId: order.id, points: { gt: 0 }, reversesEntryId: null },
    });
    const reason = `مرتجع الطلب ${order.externalRef}${input.reason ? ` — ${input.reason.slice(0, 200)}` : ""}`;
    const touched = new Set<string>();
    let reversed = 0;
    for (const e of entries) {
      const exists = await tx.ledgerEntry.findUnique({ where: { reversesEntryId: e.id } });
      if (exists) continue;
      await reverseEntry(tx, { entry: e, type: "REFUND_REVERSAL", reason, actor, now });
      touched.add(e.customerId);
      if (e.customerId === order.customerId) reversed += e.points;
    }
    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED", refundedAt: now, refundedById: actor.staffId },
    });
    await checkOffHours(
      tx,
      { businessId: actor.businessId, staffId: actor.staffId, customerId: order.customerId, settings, tz: business.timezone, now },
      "REFUND",
    );
    await enqueuePassUpdates(tx, [...touched], now);
    return { orderId: order.id, customerId: order.customerId, reversedPoints: reversed };
  });
  kickSync();
  return result;
}
