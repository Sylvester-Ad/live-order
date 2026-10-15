import { z } from "zod";

const jsonValueSchema: z.ZodType<
  string | number | boolean | null | { [key: string]: unknown } | unknown[]
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().int().positive(),
  options: z.record(z.string(), jsonValueSchema).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  price: z.number().int().positive().optional(),
  options: z.record(z.string(), jsonValueSchema).nullable().optional(),
});

export const updateProductSchema = updateProductFieldsSchema.refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" },
);

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productResponseSchema = z.object({
  id: z.string(),
  liveId: z.string(),
  name: z.string(),
  price: z.number().int(),
  options: z.unknown().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ProductResponse = z.infer<typeof productResponseSchema>;

export const productsResponseSchema = z.array(productResponseSchema);
