import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { customerFromRequest } from "@/lib/card-auth";
import { validBirthday } from "@/modules/customers";

const Body = z
  .object({
    promoOptOut: z.boolean().optional(),
    birthMonth: z.number().int().optional(),
    birthDay: z.number().int().optional(),
  })
  .strict();

export const PATCH = route<{ id: string }>({ name: "card-prefs", rate: { limit: 20, windowSec: 600 } }, async ({ req, params }) => {
  const c = await customerFromRequest(req, params.id);
  const body = await parseJson(req, Body);
  const data: { promoOptOut?: boolean; birthMonth?: number; birthDay?: number } = {};
  if (body.promoOptOut !== undefined) data.promoOptOut = body.promoOptOut;
  if (body.birthMonth !== undefined || body.birthDay !== undefined) {
    // تاريخ الميلاد يُضاف مرة واحدة فقط (منع تغييره للحصول على مكافأة متكررة)
    if (c.birthMonth != null) throw new AppError("CONFLICT", "تاريخ الميلاد مسجّل مسبقاً ولا يمكن تغييره");
    if (!validBirthday(body.birthMonth, body.birthDay)) throw new AppError("BAD_REQUEST", "تاريخ الميلاد غير صحيح");
    data.birthMonth = body.birthMonth;
    data.birthDay = body.birthDay;
  }
  const updated = await prisma.customer.update({ where: { id: c.id }, data });
  return { promoOptOut: updated.promoOptOut, birthMonth: updated.birthMonth, birthDay: updated.birthDay };
});
