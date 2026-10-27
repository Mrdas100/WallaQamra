import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) =>
  prisma.auditLog.findMany({ where: { businessId: actor.businessId }, orderBy: { createdAt: "desc" }, take: 200 }),
);
