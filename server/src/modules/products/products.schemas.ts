import { z } from "zod";

const productOptionsSchema = z.record(
  z.string().trim().min(1).max(50),
  z.array(z.string().trim().min(1).max(50)).min(1).max(50),
).superRefine((options, context) => {
  const groupNames = new Set<string>();
  for (const [groupName, choices] of Object.entries(options)) {
    const normalizedGroupName = groupName.toLocaleLowerCase();
    if (groupNames.has(normalizedGroupName)) {
      context.addIssue({ code: "custom", message: "Option group names must be unique." });
    }
    groupNames.add(normalizedGroupName);

    const normalizedChoices = new Set<string>();
    for (const choice of choices) {
      const normalizedChoice = choice.toLocaleLowerCase();
      if (normalizedChoices.has(normalizedChoice)) {
        context.addIssue({ code: "custom", message: `Choices in ${groupName} must be unique.` });
      }
      normalizedChoices.add(normalizedChoice);
    }
  }
});

const stockQuantitySchema = z.number().int().min(0).max(2_147_483_647);
const productPriceSchema = z.number().int().positive().max(2_147_483_647);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: productPriceSchema,
  options: productOptionsSchema.optional(),
  stockQuantity: stockQuantitySchema.optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  price: productPriceSchema.optional(),
  options: productOptionsSchema.nullable().optional(),
  stockQuantity: stockQuantitySchema.optional(),
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
  stockQuantity: stockQuantitySchema,
  image: z.object({
    id: z.string(),
    url: z.url(),
    createdAt: z.coerce.date(),
  }).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ProductResponse = z.infer<typeof productResponseSchema>;

export const productsResponseSchema = z.array(productResponseSchema);
