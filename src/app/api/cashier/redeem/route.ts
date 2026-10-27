import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { redeemReward } from "@/modules/redeem";

const Body = z
  .object({
    customerId: z.string().min(10).max(40),
    rewardId: z.string().min(10).max(40),
    code: z.string().max(12),
    idempotencyKey: z.string().min(8).max(80),
  })
  .strict();

export const POST = route(
  { name: "redeem", role: "CASHIER", rate: { limit: 20, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => redeemReward(actor, await parseJson(req, Body)),
);
