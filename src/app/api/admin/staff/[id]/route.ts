import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { updateStaff } from "@/modules/admin";

const Body = z
  .object({
    role: z.enum(["CASHIER", "MANAGER", "ADMIN"]).optional(),
    active: z.boolean().optional(),
    name: z.string().min(2).max(60).optional(),
    password: z.string().max(200).optional(),
  })
  .strict();

export const PATCH = route<{ id: string }>(
  { name: "admin-write", role: "ADMIN", rate: { limit: 30, windowSec: 60, by: "staff" } },
  async ({ req, actor, params }) => {
    const s = await updateStaff(actor, params.id, await parseJson(req, Body));
    return { id: s.id, role: s.role, active: s.active };
  },
);
