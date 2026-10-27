import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveCampaign } from "@/modules/catalog";
import { CampaignBody } from "./schema";

export const GET = route({ name: "admin", role: "MANAGER" }, async ({ actor }) =>
  prisma.campaign.findMany({ where: { businessId: actor.businessId }, orderBy: { startsAt: "desc" } }),
);

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) =>
  saveCampaign(actor, null, await parseJson(req, CampaignBody)),
);
