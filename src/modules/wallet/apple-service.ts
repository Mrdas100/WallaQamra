import type { WalletPass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

// PassKit Web Service: التحقق من authenticationToken الخاص بكل بطاقة

export async function authorizedPass(req: Request, passTypeId: string, serial: string): Promise<WalletPass> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("ApplePass ") ? header.slice(10).trim() : "";
  if (passTypeId !== env.apple.passTypeId || !token) throw new AppError("UNAUTHORIZED", "unauthorized");
  const pass = await prisma.walletPass.findUnique({ where: { serial } });
  if (!pass || pass.platform !== "APPLE" || !safeEqual(pass.authToken, token)) {
    throw new AppError("UNAUTHORIZED", "unauthorized");
  }
  return pass;
}

export const validDeviceId = (id: string) => /^[A-Za-z0-9._-]{1,128}$/.test(id);
export const validPushToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9]{16,200}$/.test(t);

export async function registerDevice(pass: WalletPass, deviceLibraryId: string, pushToken: string) {
  const existing = await prisma.deviceRegistration.findUnique({
    where: { deviceLibraryId_walletPassId: { deviceLibraryId, walletPassId: pass.id } },
  });
  if (existing) {
    if (existing.pushToken !== pushToken) {
      await prisma.deviceRegistration.update({ where: { id: existing.id }, data: { pushToken } });
    }
    return { created: false };
  }
  // حد أقصى للأجهزة لكل بطاقة لمنع الإغراق
  const count = await prisma.deviceRegistration.count({ where: { walletPassId: pass.id } });
  if (count >= 10) throw new AppError("RATE_LIMITED", "too many devices");
  await prisma.deviceRegistration.create({
    data: { businessId: pass.businessId, walletPassId: pass.id, deviceLibraryId, pushToken },
  });
  return { created: true };
}

export async function unregisterDevice(pass: WalletPass, deviceLibraryId: string) {
  await prisma.deviceRegistration.deleteMany({ where: { walletPassId: pass.id, deviceLibraryId } });
}

export async function updatedSerials(deviceLibraryId: string, passTypeId: string, since: string | null) {
  if (passTypeId !== env.apple.passTypeId) return null;
  const sinceMs = since && /^\d{1,16}$/.test(since) ? Number(since) : 0;
  const regs = await prisma.deviceRegistration.findMany({
    where: { deviceLibraryId, walletPass: { platform: "APPLE", contentUpdatedAt: { gt: new Date(sinceMs) } } },
    include: { walletPass: { select: { serial: true, contentUpdatedAt: true } } },
  });
  if (regs.length === 0) return null;
  const lastUpdated = Math.max(...regs.map((r) => r.walletPass.contentUpdatedAt.getTime()));
  return { serialNumbers: regs.map((r) => r.walletPass.serial), lastUpdated: String(lastUpdated) };
}
