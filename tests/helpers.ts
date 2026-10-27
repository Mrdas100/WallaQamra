import { randomUUID } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto";
import type { Actor } from "@/modules/actor";

export const uid = () => randomUUID().replace(/-/g, "").slice(0, 12);
export const idk = () => `k_${randomUUID()}`;

let phoneSeq = Math.floor(Math.random() * 1e7);
export const nextPhone = () => `+9665${String(10000000 + (phoneSeq++ % 89999999)).padStart(8, "0")}`;

export async function makeBusiness(settings: Partial<Prisma.SettingsCreateWithoutBusinessInput> = {}) {
  return prisma.business.create({
    data: {
      slug: `test-${uid()}`,
      name: "شاهي قمرا",
      settings: {
        create: {
          cooldownSeconds: 0,
          dailyMaxEarnTxns: 100,
          dailyMaxEarnPoints: 100000,
          openMinute: 0,
          closeMinute: 0, // مفتوح 24 ساعة افتراضياً في الاختبارات
          alertSameCustomerCount: 1000,
          signupBonus: 0,
          referralBonusReferee: 0,
          referralBonusReferrer: 0,
          birthdayBonus: 0,
          ...settings,
        },
      },
    },
  });
}

export const passwordFor = "correct-horse-battery";
let cachedHash: string | null = null;

export async function makeStaff(businessId: string, role: Role = "CASHIER") {
  cachedHash ??= await hashPassword(passwordFor);
  const staff = await prisma.staff.create({
    data: { businessId, username: `u${uid()}`, name: `موظف ${role}`, passwordHash: cachedHash, role },
  });
  const token = randomToken(32);
  await prisma.staffSession.create({
    data: { staffId: staff.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const deviceId = `dev${uid()}abcdef`;
  const actor: Actor = { businessId, staffId: staff.id, role, deviceId, ip: "10.0.0.5", userAgent: "vitest" };
  return { staff, token, deviceId, actor };
}

export async function makeCustomer(businessId: string, data: Partial<Prisma.CustomerUncheckedCreateInput> = {}) {
  return prisma.customer.create({
    data: {
      businessId,
      name: "عميل تجربة",
      phone: nextPhone(),
      referralCode: uid().toUpperCase().slice(0, 8),
      cardKeyNonce: randomToken(8),
      ...data,
    },
  });
}

export async function credit(businessId: string, customerId: string, points: number, extra: Partial<Prisma.LedgerEntryUncheckedCreateInput> = {}) {
  return prisma.ledgerEntry.create({
    data: {
      businessId,
      customerId,
      type: "MANUAL_ADJUST",
      unit: "POINT",
      points,
      reason: "اختبار رصيد",
      idempotencyKey: idk(),
      ...extra,
    },
  });
}

export function apiRequest(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; deviceId?: string; ip?: string; origin?: string | null; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "loyalty.test",
    "x-real-ip": opts.ip ?? `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    "user-agent": "vitest-agent",
    ...opts.headers,
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? "https://loyalty.test";
  const cookies: string[] = [];
  if (opts.token) cookies.push(`sid=${opts.token}`);
  if (opts.deviceId) cookies.push(`did=${opts.deviceId}`);
  if (cookies.length) headers.cookie = cookies.join("; ");
  return new Request(`https://loyalty.test${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export const params = <P>(p: P) => ({ params: Promise.resolve(p) });

export async function json(res: Response) {
  return (await res.json()) as { ok: boolean; data?: any; error?: { code: string; message: string; [k: string]: unknown } }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
