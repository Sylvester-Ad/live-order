import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  creatorAccessSchema,
  creatorResponseSchema,
} from "../modules/creators/creators.schemas.js";
import {
  mobileMoneySettingsResponseSchema,
  mobileMoneySettingsSuccessSchema,
  updateMobileMoneySettingsSchema,
} from "../modules/creators/mobile-money.schemas.js";

import {
  createLiveSchema,
  createStoreSchema,
  liveResponseSchema,
  storeResponseSchema,
  storesResponseSchema,
  tiktokLiveUrlSchema,
  updateLiveSchema,
  updateStoreDetailsSchema,
} from "../modules/lives/lives.schemas.js";

import {
  createProductSchema,
  productResponseSchema,
  productImageResponseSchema,
  productGalleryImageResponseSchema,
  productImageUploadStatusSchema,
  productImageUploadSuccessSchema,
  pendingProductImageUploadsSchema,
  updateProductFieldsSchema,
} from "../modules/products/products.schemas.js";

import {
  createOrderSchema,
  orderResponseSchema,
  storeOrderResponseSchema,
  updateOrderSchema,
} from "../modules/orders/orders.schemas.js";

export const registry = new OpenAPIRegistry();

// OpenAPI representation of the product creation request.
//
// Runtime validation still uses createProductSchema, including its
// recursive JSON validation. This schema avoids recursive expansion
// when generating the OpenAPI document.
const createProductOpenApiSchema = createProductSchema
  .omit({ options: true })
  .extend({
    options: z.record(z.string(), z.array(z.string())).optional(),
  });

const updateProductOpenApiSchema = updateProductFieldsSchema
  .omit({ options: true })
  .extend({
    options: z.record(z.string(), z.array(z.string())).nullable().optional(),
  });

// OpenAPI representation of the order creation request.
//
// Runtime validation still uses createOrderSchema, including recursive
// JSON validation. This representation avoids recursive expansion when
// generating the OpenAPI document.
const createOrderOpenApiSchema = createOrderSchema
  .omit({ items: true })
  .extend({
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(100),
          selectedOptions: z.record(z.string(), z.string()).optional(),
        }),
      )
      .min(1)
      .max(50),
  });

// Standard API error response.
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// Health check response.
export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal("ok"),
  }),
});

// Standard success response wrappers.
export const creatorSuccessSchema = z.object({
  data: creatorResponseSchema,
});

export const mobileMoneySettingsUpdateSuccessSchema = z.object({
  data: mobileMoneySettingsResponseSchema,
});

export const liveSuccessSchema = z.object({
  data: liveResponseSchema,
});

export const livesSuccessSchema = z.object({
  data: z.array(liveResponseSchema),
});

export const productSuccessSchema = z.object({
  data: productResponseSchema,
});

export const productsSuccessSchema = z.object({
  data: z.array(productResponseSchema),
});

export const productImageUploadSuccessResponseSchema = z.object({
  data: productImageUploadSuccessSchema,
});

export const productImageUploadStatusSuccessSchema = z.object({
  data: productImageUploadStatusSchema,
});

export const pendingProductImageUploadsSuccessSchema = z.object({
  data: pendingProductImageUploadsSchema,
});

export const orderSuccessSchema = z.object({
  data: orderResponseSchema,
});

export const ordersSuccessSchema = z.object({
  data: z.array(orderResponseSchema),
});

export const storeProductResponseSchema = productResponseSchema
  .omit({ liveId: true })
  .extend({ storeId: z.string() });
export const storeProductSuccessSchema = z.object({ data: storeProductResponseSchema });
export const storeProductsSuccessSchema = z.object({ data: z.array(storeProductResponseSchema) });
export const storeProductImageUploadSuccessSchema = z.object({
  data: productImageUploadSuccessSchema.extend({
    product: storeProductResponseSchema,
  }),
});
export const storeOrderSuccessSchema = z.object({ data: storeOrderResponseSchema });
export const storeOrdersSuccessSchema = z.object({ data: z.array(storeOrderResponseSchema) });

// Public Live response.
// Only expose fields selected by getPublicLiveBySlug().
export const publicLiveResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.literal("ACTIVE"),
  tiktokLiveUrl: tiktokLiveUrlSchema.nullable(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number().int(),
      options: z.unknown().nullable(),
      stockQuantity: z.number().int().min(0),
      available: z.boolean(),
      images: z.array(productGalleryImageResponseSchema),
      image: productImageResponseSchema.nullable(),
    }),
  ),
});

export const publicLiveSuccessSchema = z.object({
  data: publicLiveResponseSchema,
});

export const publicStoreResponseSchema = publicLiveResponseSchema.extend({
  status: z.literal("PUBLISHED"),
});
export const publicStoreSuccessSchema = z.object({ data: publicStoreResponseSchema });

// Register reusable schemas.
registry.register("ErrorResponse", errorResponseSchema);
registry.register("HealthResponse", healthResponseSchema);

registry.register("CreatorAccessRequest", creatorAccessSchema);
registry.register("CreatorResponse", creatorResponseSchema);
registry.register("CreatorSuccessResponse", creatorSuccessSchema);
registry.register("UpdateMobileMoneySettingsRequest", updateMobileMoneySettingsSchema);
registry.register("MobileMoneySettingsResponse", mobileMoneySettingsResponseSchema);
registry.register("MobileMoneySettingsSuccessResponse", mobileMoneySettingsSuccessSchema);
registry.register("MobileMoneySettingsUpdateSuccessResponse", mobileMoneySettingsUpdateSuccessSchema);

registry.register("CreateLiveRequest", createLiveSchema);
registry.register("UpdateLiveRequest", updateLiveSchema);
registry.register("LiveResponse", liveResponseSchema);
registry.register("LiveSuccessResponse", liveSuccessSchema);
registry.register("LivesSuccessResponse", livesSuccessSchema);
registry.register("CreateStoreRequest", createStoreSchema);
registry.register("UpdateStoreDetailsRequest", updateStoreDetailsSchema);
registry.register("StoreResponse", storeResponseSchema);
registry.register("StoreSuccessResponse", z.object({ data: storeResponseSchema }));
registry.register("StoresSuccessResponse", z.object({ data: storesResponseSchema }));

registry.register("CreateProductRequest", createProductOpenApiSchema);
registry.register("UpdateProductRequest", updateProductOpenApiSchema);
registry.register("ProductResponse", productResponseSchema);
registry.register("ProductSuccessResponse", productSuccessSchema);
registry.register("ProductsSuccessResponse", productsSuccessSchema);
registry.register("StoreProductResponse", storeProductResponseSchema);
registry.register("StoreProductSuccessResponse", storeProductSuccessSchema);
registry.register("StoreProductsSuccessResponse", storeProductsSuccessSchema);
registry.register("StoreProductImageUploadSuccessResponse", storeProductImageUploadSuccessSchema);
registry.register("ProductImageUploadSuccessResponse", productImageUploadSuccessResponseSchema);
registry.register("ProductImageUploadStatusSuccessResponse", productImageUploadStatusSuccessSchema);
registry.register("PendingProductImageUploadsSuccessResponse", pendingProductImageUploadsSuccessSchema);

registry.register("CreateOrderRequest", createOrderOpenApiSchema);
registry.register("OrderResponse", orderResponseSchema);
registry.register("OrderSuccessResponse", orderSuccessSchema);
registry.register("OrdersSuccessResponse", ordersSuccessSchema);
registry.register("StoreOrderResponse", storeOrderResponseSchema);
registry.register("StoreOrderSuccessResponse", storeOrderSuccessSchema);
registry.register("StoreOrdersSuccessResponse", storeOrdersSuccessSchema);
registry.register("UpdateOrderRequest", updateOrderSchema);

registry.register("PublicLiveResponse", publicLiveResponseSchema);
registry.register("PublicLiveSuccessResponse", publicLiveSuccessSchema);
registry.register("PublicStoreResponse", publicStoreResponseSchema);
registry.register("PublicStoreSuccessResponse", publicStoreSuccessSchema);
