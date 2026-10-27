import { route } from "@/lib/api";
import { readCookie } from "@/lib/request";
import { SESSION_COOKIE, clearSessionCookie, logout } from "@/modules/auth";

export const POST = route({ name: "logout" }, async ({ req }) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await logout(token);
  return Response.json({ ok: true, data: null }, { headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
});
