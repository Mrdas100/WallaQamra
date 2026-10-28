import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { refundOrder } from "@/modules/orders";

const Body = z
  .object({
    orderId: z.string().min(10).max(40).optional(),
    externalRef: z.string().min(1).max(40).optional(),
    reason: z.string().max(200).optional(),
  })
  .strict()
  .refine((b) => !!b.orderId !== !!b.externalRef, { message: "orderId أو externalRef" });

export const POST = route(
  { name: "refund", role: "CASHIER", rate: { limit: 20, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const { orderId, externalRef, reason } = await parseJson(req, Body);
    return refundOrder(actor, orderId ? { orderId, reason } : { externalRef: externalRef!, reason });
  },
);
