// رؤوس الأمان: CSP صارم بـ nonce + no-store على صفحات الإدارة والكاشير وصفحة البطاقة.

export function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const PRIVATE_PREFIXES = ["/admin", "/cashier", "/c/", "/api/", "/login"];

export const isPrivatePath = (pathname: string) => PRIVATE_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));

export function securityHeaders(pathname: string, csp: string, prod: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "content-security-policy": csp,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    // روابط البطاقات تحتوي مفتاحاً سرياً: لا نرسل Referer لأي موقع
    "referrer-policy": "no-referrer",
    // الكاميرا لمسح QR في شاشة الكاشير فقط؛ لا نطلب موقع المستخدم أبداً
    "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
    "cross-origin-opener-policy": "same-origin",
  };
  if (prod) h["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  if (isPrivatePath(pathname)) {
    h["cache-control"] = "no-store, max-age=0";
    h["pragma"] = "no-cache";
  }
  return h;
}
