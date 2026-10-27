import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { login, sessionCookie } from "@/modules/auth";
import { getDefaultBusiness } from "@/modules/business";
import { AppError } from "@/lib/errors";
import { sameOrigin } from "@/lib/request";

const Body = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) }).strict();

export const POST = route({ name: "login", rate: { limit: 10, windowSec: 60 } }, async ({ req, meta }) => {
  if (!sameOrigin(req)) throw new AppError("FORBIDDEN", "طلب من مصدر غير موثوق");
  const body = await parseJson(req, Body);
  const business = await getDefaultBusiness();
  const { token, staff, expiresAt } = await login(business.id, body.username, body.password, meta);
  return Response.json(
    { ok: true, data: { name: staff.name, role: staff.role } },
    { headers: { "set-cookie": sessionCookie(token, expiresAt), "cache-control": "no-store" } },
  );
});
