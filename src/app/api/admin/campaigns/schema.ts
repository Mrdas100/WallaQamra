import { z } from "zod";

export const CampaignBody = z
  .object({
    name: z.string().min(2).max(60),
    multiplierPct: z.number().int(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    startMinute: z.number().int().nullable().optional(),
    endMinute: z.number().int().nullable().optional(),
    daysMask: z.number().int().min(1).max(127).optional(),
    active: z.boolean(),
  })
  .strict();
