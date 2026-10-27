import type { Customer, Settings } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fingerprint, hmac, randomToken, safeEqual } from "@/lib/crypto";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { randomInt } from "node:crypto";
import type { RequestMeta } from "@/lib/request";
import { addDays } from "@/lib/time";
import { getBalance } from "./ledger";
import { TIER_LABEL, tierAtLeast, tierForSpend, unitForMode } from "./rules";

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReferralCode(): string {
  return Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join("");
}

export function validBirthday(month?: number | null, day?: number | null): boolean {
  if (month == null && day == null) return true;
  if (month == null || day == null) return false;
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= max;
}

/** مفتاح رابط بطاقة العميل (يُشتق من nonce مخزّن؛ تغيير الـ nonce يُبطل الرابط القديم) */
export const cardKey = (c: Pick<Customer, "id" | "cardKeyNonce">): string =>
  hmac(env.qrSecret, `card|${c.id}|${c.cardKeyNonce}`).subarray(0, 18).toString("base64url");

export const cardUrl = (c: Pick<Customer, "id" | "cardKeyNonce">): string =>
  `${env.appUrl}/c/${c.id}?k=${cardKey(c)}`;

export async function customerFromCardKey(customerId: string, key: string, db: Db = prisma): Promise<Customer> {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c || !key || !safeEqual(cardKey(c), key)) throw new AppError("NOT_FOUND", "رابط البطاقة غير صالح");
  return c;
}

export interface RegisterInput {
  name: string;
  phone: string;
  birthMonth?: number | null;
  birthDay?: number | null;
  referralCode?: string | null;
}

export async function registerCustomer(businessId: string, input: RegisterInput, meta: RequestMeta) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) throw new AppError("BAD_REQUEST", "الاسم يجب أن يكون بين 2 و40 حرفاً");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AppError("BAD_REQUEST", "رقم الجوال غير صحيح (مثال: 05XXXXXXXX)");
  if (!validBirthday(input.birthMonth, input.birthDay)) throw new AppError("BAD_REQUEST", "تاريخ الميلاد غير صحيح");

  const existing = await prisma.customer.findUnique({ where: { businessId_phone: { businessId, phone } } });
  if (existing) {
    throw new AppError("CONFLICT", "هذا الرقم مسجّل مسبقاً. اطلب من موظف الكاشير إعادة إرسال رابط بطاقتك.");
  }

  let referredById: string | null = null;
  const code = input.referralCode?.trim().toUpperCase();
  if (code) {
    const referrer = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!referrer || referrer.businessId !== businessId) throw new AppError("BAD_REQUEST", "كود الإحالة غير صحيح");
    referredById = referrer.id;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name,
          phone,
          birthMonth: input.birthMonth ?? null,
          birthDay: input.birthDay ?? null,
          referralCode: newReferralCode(),
          referredById,
          cardKeyNonce: randomToken(12),
          regDeviceHash: meta.deviceId ? fingerprint(`dev:${meta.deviceId}`) : null,
          regIpHash: fingerprint(`ip:${meta.ip}`),
        },
      });
      return { customer, cardUrl: cardUrl(customer) };
    } catch (e) {
      const err = e as { code?: string; meta?: { target?: string[] | string } };
      if (err.code === "P2002" && String(err.meta?.target ?? "").includes("referralCode")) continue;
      if (err.code === "P2002") {
        throw new AppError("CONFLICT", "هذا الرقم مسجّل مسبقاً. اطلب من موظف الكاشير إعادة إرسال رابط بطاقتك.");
      }
      throw e;
    }
  }
  throw new AppError("INTERNAL", "تعذر إنشاء الحساب، حاول مجدداً");
}

/** إعادة إصدار رابط البطاقة (يُبطل الرابط القديم) — للموظف عند فقدان العميل للرابط */
export async function rotateCardKey(customerId: string): Promise<string> {
  const c = await prisma.customer.update({ where: { id: customerId }, data: { cardKeyNonce: randomToken(12) } });
  return cardUrl(c);
}

export async function spendLast365(customerId: string, now = new Date(), db: Db = prisma): Promise<number> {
  const r = await db.order.aggregate({
    where: { customerId, status: "COMPLETED", createdAt: { gte: addDays(now, -365) } },
    _sum: { amountHalalas: true },
  });
  return r._sum.amountHalalas ?? 0;
}

export async function customerTier(customerId: string, settings: Settings, now = new Date(), db: Db = prisma) {
  return tierForSpend(await spendLast365(customerId, now, db), settings);
}

/** ملخص العميل كما يراه الكاشير: الجوال مقنّع ولا يظهر أي رمز تحقق */
export async function cashierView(customer: Customer, settings: Settings, now = new Date()) {
  const unit = unitForMode(settings.programMode);
  const [balance, tier, rewards] = await Promise.all([
    getBalance(customer.id, unit),
    customerTier(customer.id, settings, now),
    prisma.reward.findMany({
      where: { businessId: customer.businessId, active: true, unit },
      orderBy: [{ sortOrder: "asc" }, { cost: "asc" }],
    }),
  ]);
  return {
    id: customer.id,
    name: customer.name,
    maskedPhone: maskPhone(customer.phone),
    unit,
    balance,
    tier,
    tierLabel: TIER_LABEL[tier],
    rewards: rewards.map((r) => ({
      id: r.id,
      name: r.name,
      cost: r.cost,
      minTier: r.minTier,
      eligible: balance >= r.cost && tierAtLeast(tier, r.minTier),
    })),
  };
}

export async function findByPhone(businessId: string, rawPhone: string): Promise<Customer> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError("BAD_REQUEST", "رقم الجوال غير صحيح");
  const c = await prisma.customer.findUnique({ where: { businessId_phone: { businessId, phone } } });
  if (!c) throw new AppError("NOT_FOUND", "لا يوجد عميل بهذا الرقم");
  return c;
}
