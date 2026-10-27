import type { Prisma, Role, Settings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/crypto";
import { hasRole, type Actor } from "./actor";
import { audit, diff } from "./audit";
import { getSettings } from "./business";
import { enqueueAllPasses, kickSync } from "./wallet/sync";

// عمليات الأدمن: كل تغيير على الإعدادات والأدوار يُسجَّل في AuditLog.

function requireAdmin(actor: Actor) {
  if (!hasRole(actor.role, "ADMIN")) throw new AppError("FORBIDDEN", "هذه العملية للأدمن فقط");
}

export type SettingsPatch = Partial<Omit<Settings, "businessId" | "updatedAt" | "offerUpdatedAt">>;

/** الحقول التي تظهر على البطاقة: تغييرها يحدّث كل البطاقات */
const PASS_FIELDS: (keyof Settings)[] = ["programMode", "rewardThreshold", "stampsPerReward", "silverSpendSar", "goldSpendSar"];

export async function updateSettings(actor: Actor, patch: SettingsPatch, now = new Date()) {
  requireAdmin(actor);
  const before = await getSettings(actor.businessId);
  const { offerMessage, ...rest } = patch;
  const d = diff(before as unknown as Record<string, unknown>, rest as Record<string, unknown>);
  const offerChanged = offerMessage !== undefined && offerMessage.trim() !== before.offerMessage;

  if (!d.changed && !offerChanged) return before;
  const data: Prisma.SettingsUpdateInput = { ...rest };
  if (offerChanged) {
    data.offerMessage = offerMessage!.trim();
    data.offerUpdatedAt = now;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.settings.update({ where: { businessId: actor.businessId }, data });
    await audit(
      actor,
      "settings.update",
      "Settings",
      actor.businessId,
      { ...d.before, ...(offerChanged ? { offerMessage: before.offerMessage } : {}) },
      { ...d.after, ...(offerChanged ? { offerMessage: s.offerMessage } : {}) },
      tx,
    );
    return s;
  });

  if (offerChanged) {
    // رسالة العرض: push مع changeMessage (Apple) ورسالة Wallet (Google) مع احترام حدود الإزعاج
    await enqueueAllPasses(actor.businessId, "OFFER", { text: updated.offerMessage }, now);
  }
  if (PASS_FIELDS.some((k) => k in d.after)) await enqueueAllPasses(actor.businessId, "PASS_UPDATE", null, now);
  kickSync();
  return updated;
}

export const ROLES: Role[] = ["CASHIER", "MANAGER", "ADMIN"];

export async function createStaff(
  actor: Actor,
  input: { username: string; name: string; password: string; role: Role },
) {
  requireAdmin(actor);
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new AppError("BAD_REQUEST", "اسم المستخدم غير صالح");
  if (input.password.length < 10) throw new AppError("BAD_REQUEST", "كلمة المرور 10 أحرف على الأقل");
  if (!ROLES.includes(input.role)) throw new AppError("BAD_REQUEST", "الدور غير صالح");
  return prisma.$transaction(async (tx) => {
    const exists = await tx.staff.findUnique({ where: { businessId_username: { businessId: actor.businessId, username } } });
    if (exists) throw new AppError("CONFLICT", "اسم المستخدم مستخدم");
    const staff = await tx.staff.create({
      data: {
        businessId: actor.businessId,
        username,
        name: input.name.trim().slice(0, 60),
        passwordHash: await hashPassword(input.password),
        role: input.role,
      },
    });
    await audit(actor, "staff.create", "Staff", staff.id, null, { username, name: staff.name, role: staff.role }, tx);
    return staff;
  });
}

export async function updateStaff(
  actor: Actor,
  staffId: string,
  patch: { role?: Role; active?: boolean; name?: string; password?: string },
) {
  requireAdmin(actor);
  if (staffId === actor.staffId && (patch.role !== undefined || patch.active === false)) {
    throw new AppError("BAD_REQUEST", "لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك");
  }
  if (patch.role && !ROLES.includes(patch.role)) throw new AppError("BAD_REQUEST", "الدور غير صالح");
  if (patch.password !== undefined && patch.password.length < 10) {
    throw new AppError("BAD_REQUEST", "كلمة المرور 10 أحرف على الأقل");
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.staff.findUnique({ where: { id: staffId } });
    if (!before || before.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "الموظف غير موجود");
    const data: Prisma.StaffUpdateInput = {};
    if (patch.role !== undefined) data.role = patch.role;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 60);
    if (patch.password !== undefined) data.passwordHash = await hashPassword(patch.password);
    const staff = await tx.staff.update({ where: { id: staffId }, data });
    const d = diff(
      { role: before.role, active: before.active, name: before.name },
      { role: staff.role, active: staff.active, name: staff.name },
    );
    const action = patch.role !== undefined && patch.role !== before.role ? "staff.role_change" : "staff.update";
    await audit(
      actor,
      action,
      "Staff",
      staffId,
      d.before,
      { ...d.after, ...(patch.password !== undefined ? { passwordReset: true } : {}) },
      tx,
    );
    // تغيير الدور أو التعطيل أو كلمة المرور يُنهي الجلسات الحالية
    if (patch.role !== undefined || patch.active === false || patch.password !== undefined) {
      await tx.staffSession.updateMany({ where: { staffId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return staff;
  });
}
