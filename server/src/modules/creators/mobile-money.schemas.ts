import { z } from "zod";

export const mobileMoneyProviderSchema = z.enum([
  "MTN_MOBILE_MONEY",
  "TELECEL_CASH",
  "AT_MONEY",
]);

const ghanaMobileMoneyNumberSchema = z.string()
  .trim()
  .min(1, "Enter a Ghanaian Mobile Money number.")
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .transform((value) => value.startsWith("+233")
    ? `0${value.slice(4)}`
    : value.startsWith("233")
      ? `0${value.slice(3)}`
      : value)
  .refine((value) => /^0\d{9}$/.test(value), {
    message: "Enter a Ghanaian number as 0XXXXXXXXX or +233XXXXXXXXX.",
  });

export const updateMobileMoneySettingsSchema = z.object({
  provider: mobileMoneyProviderSchema,
  mobileMoneyNumber: ghanaMobileMoneyNumberSchema,
  accountName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
}).strict();

export const mobileMoneySettingsResponseSchema = z.object({
  provider: mobileMoneyProviderSchema,
  mobileMoneyNumber: z.string(),
  accountName: z.string(),
  enabled: z.boolean(),
  updatedAt: z.coerce.date(),
});

export const mobileMoneySettingsSuccessSchema = z.object({
  data: mobileMoneySettingsResponseSchema.nullable(),
});

export type UpdateMobileMoneySettingsInput = z.infer<typeof updateMobileMoneySettingsSchema>;
