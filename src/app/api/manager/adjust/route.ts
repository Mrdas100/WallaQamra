import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { manualAdjust } from "@/modules/manual";

const Body = z
  .object({
    customerId: z.string().min(10).max(40),
    points: z.number().int(),
    reason: z.string().max(300),
    idempotencyKey: z.string().min(8).max(80),
  })
  .strict();

export const POST = route(
  { name: "adjust", role: "MANAGER", rate: { limit: 20, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const r = await manualAdjust(actor, await parseJson(req, Body));
    return { entryId: r.entry.id, balance: r.balance, replayed: r.replayed };
  },
);
