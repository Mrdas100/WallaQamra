import type { Role, Staff } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { DUMMY_PASSWORD_HASH, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { readCookie, type RequestMeta } from "@/lib/request";
import { addHours, addMinutes } from "@/lib/time";
import { hasRole, type Actor } from "./actor";
import { raiseAlert } from "./alerts";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sid" : "sid";
export const LOGIN_MAX_FAILURES = 5;

/** قفل تسجيل الدخول يتضاعف: 1، 2، 4، 8 ... دقائق (حد أقصى 24 ساعة) */
export const loginLockMinutes = (level: number) => Math.min(2 ** Math.max(0, level - 1), 24 * 60);

async function isLocked(key: string, now: Date): Promise<Date | null> {
  const t = await prisma.loginThrottle.findUnique({ where: { key } });
  return t?.lockedUntil && t.lockedUntil > now ? t.lockedUntil : null;
}

async function registerFailure(key: string, now: Date): Promise<Date | null> {
  const t = await prisma.loginThrottle.upsert({
    where: { key },
    update: { failures: { increment: 1 } },
    create: { key, failures: 1 },
  });
  if (t.failures >= LOGIN_MAX_FAILURES) {
    const level = t.lockLevel + 1;
    const until = addMinutes(now, loginLockMinutes(level));
    await prisma.loginThrottle.update({ where: { key }, data: { failures: 0, lockLevel: level, lockedUntil: until } });
    return until;
  }
  return null;
}

export async function login(
  businessId: string,
  username: string,
  password: string,
  meta: RequestMeta,
  now = new Date(),
): Promise<{ token: string; staff: Staff; expiresAt: Date }> {
  const uname = username.trim().toLowerCase();
  const userKey = `user:${businessId}:${uname}`;
  const ipKey = `ip:${meta.ip}`;
  const lockedUntil = (await isLocked(userKey, now)) ?? (await isLocked(ipKey, now));
  if (lockedUntil) {
    throw new AppError("LOCKED", "تم إيقاف تسجيل الدخول مؤقتاً بسبب محاولات خاطئة", {
      lockedUntil: lockedUntil.toISOString(),
    });
  }

  const staff = await prisma.staff.findUnique({ where: { businessId_username: { businessId, username: uname } } });
  // نتحقق دائماً من كلمة مرور (حتى لو المستخدم غير موجود) لزمن استجابة ثابت
  const valid = await verifyPassword(password, staff?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!staff || !valid || !staff.active) {
    const u = await registerFailure(userKey, now);
    const i = await registerFailure(ipKey, now);
    if (u || i) {
      await raiseAlert(prisma, {
        businessId,
        type: "LOGIN_LOCKOUT",
        staffId: staff?.id ?? null,
        details: { username: uname, ip: meta.ip },
      }, now);
    }
    throw new AppError("UNAUTHORIZED", "اسم المستخدم أو كلمة المرور غير صحيحة");
  }

  await prisma.loginThrottle.deleteMany({ where: { key: userKey } });
  const token = randomToken(32);
  const expiresAt = addHours(now, env.sessionHours);
  await prisma.staffSession.create({
    data: {
      staffId: staff.id,
      tokenHash: sha256(token),
      deviceId: meta.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });
  return { token, staff, expiresAt };
}

export async function logout(token: string): Promise<void> {
  await prisma.staffSession.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
}

export interface AuthedStaff {
  id: string;
  businessId: string;
  name: string;
  username: string;
  role: Role;
}

export async function staffFromToken(token: string | null, now = new Date()): Promise<AuthedStaff | null> {
  if (!token || token.length < 20) return null;
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { staff: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || !session.staff.active) return null;
  const s = session.staff;
  return { id: s.id, businessId: s.businessId, name: s.name, username: s.username, role: s.role };
}

export const staffFromRequest = (req: Request) => staffFromToken(readCookie(req, SESSION_COOKIE));

export function requireRole(staff: AuthedStaff | null, min: Role): AuthedStaff {
  if (!staff) throw new AppError("UNAUTHORIZED", "يجب تسجيل الدخول");
  if (!hasRole(staff.role, min)) throw new AppError("FORBIDDEN", "ليست لديك صلاحية لهذه العملية");
  return staff;
}

export const actorFor = (staff: AuthedStaff, meta: RequestMeta): Actor => ({
  ...meta,
  businessId: staff.businessId,
  staffId: staff.id,
  role: staff.role,
});

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
