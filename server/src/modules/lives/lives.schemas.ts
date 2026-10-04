import { z } from "zod";

export const createLiveSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateLiveInput = z.infer<typeof createLiveSchema>;

export const liveResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LiveResponse = z.infer<typeof liveResponseSchema>;
