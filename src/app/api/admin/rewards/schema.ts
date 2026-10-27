import { z } from "zod";

export const RewardBody = z
  .object({
    name: z.string().max(60),
    description: z.string().max(200).optional(),
    cost: z.number().int(),
    unit: z.enum(["POINT", "STAMP"]),
    minTier: z.enum(["BRONZE", "SILVER", "GOLD"]),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();
