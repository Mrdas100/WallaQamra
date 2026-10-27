import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createStaff } from "@/modules/admin";

const Body = z
  .object({
    username: z.string().max(32),
    name: z.string().min(2).max(60),
    password: z.string().max(200),
    role: z.enum(["CASHIER", "MANAGER", "ADMIN"]),
  })
  .strict();

export const GET = route({ name: "admin", role: "ADMIN" }, async ({ actor }) =>
  prisma.staff.findMany({
    where: { businessId: actor.businessId },
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  }),
);

export const POST = route({ name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } }, async ({ req, actor }) => {
  const s = await createStaff(actor, await parseJson(req, Body));
  return { id: s.id };
});
