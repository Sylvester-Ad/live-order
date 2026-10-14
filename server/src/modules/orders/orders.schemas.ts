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

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().min(7).max(30),
  deliveryLocation: z.string().trim().min(1).max(300),

  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(100),
        selectedOptions: z
          .record(z.string(), jsonValueSchema)
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderResponseSchema = z.object({
  id: z.string(),
  liveId: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  deliveryLocation: z.string(),
  totalAmount: z.number().int(),
  paymentStatus: z.enum(["PENDING", "PAID"]),
  createdAt: z.coerce.date(),

  items: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      productName: z.string(),
      unitPrice: z.number().int(),
      quantity: z.number().int(),
      selectedOptions: z.unknown().nullable(),
    }),
  ),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const updateOrderSchema = z
  .object({
    paymentStatus: z.enum(["PAID"]),
  })
  .strict();

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;