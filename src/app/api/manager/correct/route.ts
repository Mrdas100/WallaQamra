import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { correctEntry } from "@/modules/manual";

const Body = z.object({ entryId: z.string().min(10).max(40), reason: z.string().max(300) }).strict();

export const POST = route(
  { name: "correct", role: "MANAGER", rate: { limit: 20, windowSec: 60, by: "staff" } },
  async ({ req, actor }) => {
    const r = await correctEntry(actor, await parseJson(req, Body));
    return { entryId: r.id, points: r.points };
  },
);
