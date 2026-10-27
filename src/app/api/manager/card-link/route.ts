import { z } from "zod";
import QRCode from "qrcode";
import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/modules/audit";
import { rotateCardKey } from "@/modules/customers";

// إعادة إصدار رابط بطاقة العميل (يُبطل القديم) ويُعرض كـ QR ليمسحه العميل بجواله
const Body = z.object({ customerId: z.string().min(10).max(40) }).strict();

export const POST = route(
  { name: "card-link", role: "MANAGER", rate: { limit: 10, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const { customerId } = await parseJson(req, Body);
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c || c.businessId !== actor.businessId) throw new AppError("NOT_FOUND", "العميل غير موجود");
    const url = await rotateCardKey(customerId);
    await audit(actor, "customer.card_link_reissue", "Customer", customerId, null, null);
    return { qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) };
  },
);
