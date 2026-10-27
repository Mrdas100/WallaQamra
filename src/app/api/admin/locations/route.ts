import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveLocation } from "@/modules/catalog";
import { LocationBody } from "./schema";

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) =>
  prisma.branchLocation.findMany({ where: { businessId: actor.businessId }, orderBy: { createdAt: "asc" } }),
);

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) =>
  saveLocation(actor, null, await parseJson(req, LocationBody)),
);
