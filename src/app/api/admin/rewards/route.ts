import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveReward } from "@/modules/catalog";
import { RewardBody } from "./schema";

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ actor }) =>
  prisma.reward.findMany({ where: { businessId: actor.businessId }, orderBy: [{ sortOrder: "asc" }, { cost: "asc" }] }),
);

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) =>
  saveReward(actor, null, await parseJson(req, RewardBody)),
);
