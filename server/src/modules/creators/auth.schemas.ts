import { z } from "zod";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const passwordSchema = z.string()
  .min(12, "Use at least 12 characters")
  .max(128, "Password must be 128 characters or fewer")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const claimSchema = z.object({
  accessCode: z.string().min(1).max(200),
  email: emailSchema,
  password: passwordSchema,
});

export const passwordLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const tokenSchema = z.object({ token: z.string().min(32).max(256) });
export const passwordResetSchema = tokenSchema.extend({ password: passwordSchema });
export const emailRequestSchema = z.object({ email: emailSchema });

export const authActionResponseSchema = z.object({ data: z.object({ message: z.string() }) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type ClaimInput = z.infer<typeof claimSchema>;
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
