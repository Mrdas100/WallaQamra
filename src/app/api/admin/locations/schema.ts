import { z } from "zod";

export const LocationBody = z
  .object({
    name: z.string().min(2).max(60),
    latitude: z.number(),
    longitude: z.number(),
    relevantText: z.string().max(120),
    maxDistance: z.number().int(),
    active: z.boolean(),
  })
  .strict();
