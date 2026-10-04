import { z } from "zod";

export const creatorAccessSchema = z.object({
  accessCode: z.string().min(1, "Access code is required"),
});

export type CreatorAccessInput = z.infer<typeof creatorAccessSchema>;

export const creatorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type CreatorResponse = z.infer<typeof creatorResponseSchema>;