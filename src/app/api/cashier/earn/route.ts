import { z } from "zod";
import { parseAmountToHalalas, parseJson, route } from "@/lib/api";
import { earnForOrder } from "@/modules/orders";

// لاحظ: لا يوجد حقل points — أي حقل إضافي يُرفض (strict). النقاط تُحسب في السيرفر من المبلغ.
const Body = z
  .object({
    customerId: z.string().min(10).max(40),
    externalRef: z.string().min(1).max(40).optional(),
    amount: z.union([z.string().max(12), z.number()]),
    idempotencyKey: z.string().min(8).max(80),
    cups: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const POST = route(
  { name: "earn", role: "CASHIER", rate: { limit: 60, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const body = await parseJson(req, Body);
    const r = await earnForOrder(actor, {
      customerId: body.customerId,
      externalRef: body.externalRef?.trim() || undefined,
      amountHalalas: parseAmountToHalalas(body.amount),
      idempotencyKey: body.idempotencyKey,
      cups: body.cups,
    });
    return { orderId: r.order.id, points: r.points, balance: r.balance, replayed: r.replayed, calc: r.calc };
  },
);
