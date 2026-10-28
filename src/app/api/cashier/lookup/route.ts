import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { getSettings } from "@/modules/business";
import { cashierView, findByPhone } from "@/modules/customers";
import { issuePresenceToken, verifyQrToken } from "@/modules/qr";

const Body = z
  .object({
    qr: z.string().max(200).optional(),
    phone: z.string().max(20).optional(),
    customerId: z.string().min(10).max(40).optional(),
  })
  .strict()
  .refine((b) => [b.qr, b.phone, b.customerId].filter(Boolean).length === 1, { message: "qr أو phone أو customerId" });

export const POST = route(
  { name: "lookup", role: "CASHIER", rate: { limit: 30, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const body = await parseJson(req, Body);
    let customer;
    if (body.qr) {
      const v = verifyQrToken(body.qr);
      if (!v.ok) {
        throw v.reason === "expired"
          ? new AppError("QR_EXPIRED", "رمز QR منتهي. اطلب من العميل تحديث البطاقة أو ابحث بالجوال")
          : new AppError("QR_INVALID", "رمز QR غير صالح");
      }
      customer = await prisma.customer.findUnique({ where: { id: v.customerId } });
      if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");
    } else if (body.phone) {
      customer = await findByPhone(actor.businessId, body.phone);
    } else {
      // إعادة تحميل عميل تم الوصول إليه مسبقاً (بعد إضافة/استبدال)
      customer = await prisma.customer.findUnique({ where: { id: body.customerId! } });
      if (!customer || customer.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");
    }
    const view = await cashierView(customer, await getSettings(actor.businessId));
    // مسح QR من جوال العميل = العميل حاضر، فيُسمح بالاستبدال. البحث بالجوال وحده لا يكفي.
    return body.qr ? { ...view, presence: issuePresenceToken(customer.id) } : view;
  },
);
