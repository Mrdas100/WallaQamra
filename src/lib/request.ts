// استخراج سياق الطلب: IP والجهاز والمتصفح. كل عملية تُسجَّل بهذه القيم.

export const DEVICE_COOKIE = "did";

export interface RequestMeta {
  ip: string;
  deviceId: string | null;
  userAgent: string;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Railway يضع عنوان العميل الحقيقي في X-Real-IP. في X-Forwarded-For نأخذ آخر قيمة
 * (التي أضافها الوكيل الموثوق) وليس الأولى التي يمكن للعميل تزويرها.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "0.0.0.0";
}

export function requestMeta(req: Request): RequestMeta {
  const device = readCookie(req, DEVICE_COOKIE);
  return {
    ip: clientIp(req),
    deviceId: device && /^[A-Za-z0-9_-]{16,64}$/.test(device) ? device : null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  };
}

/** حماية CSRF: الطلبات المعدِّلة بجلسة كوكي يجب أن تأتي من نفس الأصل */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host;
  } catch {
    return false;
  }
}
