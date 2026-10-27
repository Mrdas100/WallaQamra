import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { login, loginLockMinutes, staffFromToken } from "@/modules/auth";
import { updateStaff } from "@/modules/admin";
import { makeBusiness, makeStaff, passwordFor } from "./helpers";

const meta = (ip = `192.0.2.${Math.floor(Math.random() * 250)}`) => ({ ip, deviceId: null, userAgent: "vitest" });

describe("تسجيل دخول الموظفين", () => {
  it("دخول صحيح ينشئ جلسة", async () => {
    const b = await makeBusiness();
    const { staff } = await makeStaff(b.id);
    const r = await login(b.id, staff.username, passwordFor, meta());
    expect(await staffFromToken(r.token)).toMatchObject({ id: staff.id });
  });

  it("حماية brute force: قفل بعد 5 محاولات حتى مع كلمة المرور الصحيحة، والقفل يتضاعف", async () => {
    const b = await makeBusiness();
    const { staff } = await makeStaff(b.id);
    const t0 = new Date("2026-03-01T10:00:00Z");
    for (let i = 0; i < 5; i++) {
      await expect(login(b.id, staff.username, "wrong-password", meta(`10.9.0.${i}`), t0)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    await expect(login(b.id, staff.username, passwordFor, meta(), t0)).rejects.toMatchObject({ code: "LOCKED" });
    const t1 = new Date(t0.getTime() + 61_000);
    for (let i = 0; i < 5; i++) await login(b.id, staff.username, "nope", meta(`10.9.1.${i}`), t1).catch(() => null);
    const th = await prisma.loginThrottle.findUniqueOrThrow({ where: { key: `user:${b.id}:${staff.username}` } });
    expect(th.lockLevel).toBe(2);
    expect(th.lockedUntil!.getTime() - t1.getTime()).toBe(loginLockMinutes(2) * 60_000);
    expect(loginLockMinutes(2)).toBe(2 * loginLockMinutes(1));
    expect(await prisma.fraudAlert.count({ where: { businessId: b.id, type: "LOGIN_LOCKOUT" } })).toBeGreaterThan(0);
  });

  it("قفل حسب IP يحمي من تجربة أسماء مستخدمين مختلفة", async () => {
    const b = await makeBusiness();
    const ip = "10.77.0.1";
    const t0 = new Date("2026-03-02T10:00:00Z");
    for (let i = 0; i < 5; i++) await login(b.id, `ghost${i}`, "x", meta(ip), t0).catch(() => null);
    const { staff } = await makeStaff(b.id);
    await expect(login(b.id, staff.username, passwordFor, meta(ip), t0)).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("تغيير الدور يُنهي الجلسات ويُسجَّل في AuditLog", async () => {
    const b = await makeBusiness();
    const admin = await makeStaff(b.id, "ADMIN");
    const cashier = await makeStaff(b.id, "CASHIER");
    await updateStaff(admin.actor, cashier.staff.id, { role: "MANAGER" });
    expect(await staffFromToken(cashier.token)).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: cashier.staff.id, action: "staff.role_change" } });
    expect(log.before).toEqual({ role: "CASHIER" });
    expect(log.after).toEqual({ role: "MANAGER" });
    expect(log.staffId).toBe(admin.staff.id);
  });

  it("الأدمن لا يستطيع تخفيض دوره بنفسه، والمدير لا يغيّر الأدوار", async () => {
    const b = await makeBusiness();
    const admin = await makeStaff(b.id, "ADMIN");
    const manager = await makeStaff(b.id, "MANAGER");
    await expect(updateStaff(admin.actor, admin.staff.id, { role: "CASHIER" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateStaff(manager.actor, admin.staff.id, { role: "CASHIER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
