import { z } from "zod";

const supportedTikTokHosts = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "live.tiktok.com",
]);

export const tiktokLiveUrlSchema = z.url({
  message: "Enter a valid TikTok LIVE URL using HTTPS.",
}).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && supportedTikTokHosts.has(url.hostname.toLowerCase()) &&
      !url.username && !url.password && (url.port === "" || url.port === "443");
  } catch {
    return false;
  }
}, "Use an HTTPS URL from TikTok (tiktok.com, www.tiktok.com, m.tiktok.com, or live.tiktok.com).");

export const createLiveSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tiktokLiveUrl: tiktokLiveUrlSchema.nullable().optional(),
});

export type CreateLiveInput = z.infer<typeof createLiveSchema>;

export const liveResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED"]),
  tiktokLiveUrl: tiktokLiveUrlSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LiveResponse = z.infer<typeof liveResponseSchema>;

export const updateLiveSchema = z.object({
  status: z.enum(["ACTIVE", "ENDED"]).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  tiktokLiveUrl: tiktokLiveUrlSchema.nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" },
);

export type UpdateLiveInput = z.infer<typeof updateLiveSchema>;
