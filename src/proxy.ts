import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

export function proxy(req: NextRequest) {
  const prod = process.env.NODE_ENV === "production";
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, !prod);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [k, v] of Object.entries(securityHeaders(req.nextUrl.pathname, csp, prod))) res.headers.set(k, v);

  // معرّف الجهاز: يُحفظ مع كل عملية للتدقيق
  if (!req.cookies.get("did")) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    res.cookies.set("did", id, { httpOnly: true, sameSite: "lax", secure: prod, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)",
    },
  ],
};
