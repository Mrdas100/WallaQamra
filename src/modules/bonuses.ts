import type { Customer, Settings } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { addDays, localDateKey, zonedParts } from "@/lib/time";
import type { Actor } from "./actor";
import { getBusiness, getSettings } from "./business";
import { appendEntry } from "./ledger";
import { bonusAmount, unitForMode } from "./rules";
import { enqueuePassUpdates, kickSync } from "./wallet/sync";

/**
 * مكافأة التسجيل ومكافأة الإحالة تُمنح بعد أول طلب حقيقي (وليس عند التسجيل)
 * حتى لا يمكن جمع نقاط بتسجيل أرقام وهمية. تُربط بالطلب، فإذا أُرجع الطلب تُعكس.
 * يعيد معرّفات العملاء الذين تغيّر رصيدهم.
 */
export async function grantFirstOrderBonuses(
  tx: Tx,
  p: { customer: Customer; orderId: string; settings: Settings; actor: Actor; now: Date },
): Promise<string[]> {
  const { customer, settings: s, now } = p;
  const unit = unitForMode(s.programMode);
  const touched: string[] = [];

  const signup = bonusAmount(s.programMode, s.signupBonus);
  if (signup > 0) {
    const { created } = await appendEntry(tx, {
      businessId: customer.businessId,
      customerId: customer.id,
      type: "SIGNUP_BONUS",
      unit,
      points: signup,
      idempotencyKey: `signup:${customer.id}`,
      actor: p.actor,
      orderId: p.orderId,
      expiryDays: s.pointsExpiryDays,
      now,
    });
    if (created) touched.push(customer.id);
  }

  if (customer.referredById) {
    const referrer = await tx.customer.findUnique({ where: { id: customer.referredById } });
    const ok = referrer && (await referralAllowed(tx, customer, referrer, s, now));
    if (referrer && ok) {
      const ee = bonusAmount(s.programMode, s.referralBonusReferee);
      const er = bonusAmount(s.programMode, s.referralBonusReferrer);
      if (ee > 0) {
        await appendEntry(tx, {
          businessId: customer.businessId,
          customerId: customer.id,
          type: "REFERRAL_BONUS",
          unit,
          points: ee,
          idempotencyKey: `referral:referee:${customer.id}`,
          actor: p.actor,
          orderId: p.orderId,
          reason: "مكافأة الانضمام بالإحالة",
          expiryDays: s.pointsExpiryDays,
          now,
        });
        touched.push(customer.id);
      }
      if (er > 0) {
        await appendEntry(tx, {
          businessId: referrer.businessId,
          customerId: referrer.id,
          type: "REFERRAL_BONUS",
          unit,
          points: er,
          idempotencyKey: `referral:referrer:${customer.id}`,
          actor: p.actor,
          orderId: p.orderId,
          reason: `إحالة العميل ${customer.id}`,
          expiryDays: s.pointsExpiryDays,
          now,
        });
        touched.push(referrer.id);
      }
    }
  }
  return touched;
}

/** منع إحالة النفس والحسابات المكررة */
export async function referralAllowed(
  tx: Tx,
  referee: Customer,
  referrer: Customer,
  s: Settings,
  now: Date,
): Promise<boolean> {
  if (referee.id === referrer.id) return false;
  if (referee.phone === referrer.phone) return false;
  if (referee.businessId !== referrer.businessId) return false;
  // نفس الجهاز أو نفس الشبكة وقت التسجيل = غالباً نفس الشخص
  if (referee.regDeviceHash && referee.regDeviceHash === referrer.regDeviceHash) return false;
  if (referee.regIpHash && referee.regIpHash === referrer.regIpHash) return false;
  // المُحيل نفسه يجب أن يكون عميلاً حقيقياً (له طلب واحد على الأقل)
  const referrerOrders = await tx.order.count({ where: { customerId: referrer.id, status: "COMPLETED" } });
  if (referrerOrders === 0) return false;
  const recent = await tx.ledgerEntry.count({
    where: {
      customerId: referrer.id,
      type: "REFERRAL_BONUS",
      idempotencyKey: { startsWith: "referral:referrer:" },
      createdAt: { gte: addDays(now, -30) },
    },
  });
  return recent < s.referralMonthlyCap;
}

/** مكافأة عيد الميلاد: مرة واحدة في السنة، فقط لعميل له طلب سابق. تُشغَّل يومياً عبر cron. */
export async function runBirthdayBonuses(businessId: string, now = new Date()): Promise<number> {
  const [business, s] = await Promise.all([getBusiness(businessId), getSettings(businessId)]);
  const amount = bonusAmount(s.programMode, s.birthdayBonus);
  if (amount <= 0) return 0;
  const { month, day, year } = zonedParts(now, business.timezone);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = month === 2 && day === 28 && !isLeap ? [28, 29] : [day];
  const customers = await prisma.customer.findMany({
    where: { businessId, birthMonth: month, birthDay: { in: days }, orders: { some: { status: "COMPLETED" } } },
  });
  const unit = unitForMode(s.programMode);
  const touched: string[] = [];
  for (const c of customers) {
    const created = await prisma.$transaction(async (tx) => {
      const r = await appendEntry(tx, {
        businessId,
        customerId: c.id,
        type: "BIRTHDAY_BONUS",
        unit,
        points: amount,
        idempotencyKey: `birthday:${c.id}:${year}`,
        reason: `عيد ميلاد ${localDateKey(now, business.timezone)}`,
        expiryDays: s.pointsExpiryDays,
        now,
      });
      return r.created;
    });
    if (created) touched.push(c.id);
  }
  if (touched.length) {
    await enqueuePassUpdates(prisma, touched, now);
    kickSync();
  }
  return touched.length;
}
