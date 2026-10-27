import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { getDefaultBusiness } from "@/modules/business";
import { registerCustomer } from "@/modules/customers";

const Body = z
  .object({
    name: z.string().max(80),
    phone: z.string().max(20),
    birthMonth: z.number().int().nullable().optional(),
    birthDay: z.number().int().nullable().optional(),
    referralCode: z.string().max(12).nullable().optional(),
  })
  .strict();

export const POST = route({ name: "register", rate: { limit: 5, windowSec: 600 } }, async ({ req, meta }) => {
  const body = await parseJson(req, Body);
  const business = await getDefaultBusiness();
  const { cardUrl } = await registerCustomer(business.id, body, meta);
  return { cardUrl };
});
