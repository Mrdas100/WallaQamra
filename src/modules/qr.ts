import { env } from "@/lib/env";
import { hmac, safeEqual } from "@/lib/crypto";

// توكن QR موقّع وقصير العمر. يحتوي معرّف العميل الداخلي ووقت الانتهاء فقط — لا يحتوي الجوال.
// الصيغة: Q1.<customerId>.<exp base36>.<sig>

const PREFIX = "Q1";

function sign(payload: string): string {
  return hmac(env.qrSecret, `qr|${payload}`).subarray(0, 16).toString("base64url");
}

export function issueQrToken(customerId: string, ttlSeconds: number, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${PREFIX}.${customerId}.${exp.toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

export type QrResult = { ok: true; customerId: string; exp: Date } | { ok: false; reason: "invalid" | "expired" };

export function verifyQrToken(token: string, now = new Date()): QrResult {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: "invalid" };
  const [, customerId, exp36, sig] = parts;
  if (!/^[a-z0-9]{10,40}$/i.test(customerId) || !/^[a-z0-9]{1,10}$/.test(exp36)) {
    return { ok: false, reason: "invalid" };
  }
  if (!safeEqual(sig, sign(`${PREFIX}.${customerId}.${exp36}`))) return { ok: false, reason: "invalid" };
  const exp = Number.parseInt(exp36, 36);
  if (exp * 1000 < now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, customerId, exp: new Date(exp * 1000) };
}
