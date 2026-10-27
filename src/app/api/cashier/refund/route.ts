import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { refundOrder } from "@/modules/orders";

const Body = z.object({ externalRef: z.string().min(1).max(40), reason: z.string().max(200).optional() }).strict();

export const POST = route(
  { name: "refund", role: "CASHIER", rate: { limit: 20, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => refundOrder(actor, await parseJson(req, Body)),
);
