import { registry } from "./schemas.js";
import { z } from "zod";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

// Authentication uses the HTTP-only session cookie.
registry.registerComponent("securitySchemes", "CreatorSession", {
  type: "apiKey",
  in: "cookie",
  name: "session",
  description: "Creator session cookie set by POST /api/v1/creator/access.",
});

// Reusable OpenAPI component references.
const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

const jsonContent = (schema: object) => ({
  "application/json": {
    schema,
  },
});

const jsonResponse = (description: string, schema: object) => ({
  description,
  content: jsonContent(schema),
});

const errorResponse = (description: string) =>
  jsonResponse(description, schemaRef("ErrorResponse"));

// GET /api/health
registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["System"],
  summary: "Health check",
  description: "Checks whether the API is responding.",
  responses: {
    200: jsonResponse("API is healthy.", schemaRef("HealthResponse")),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/health/ready",
  tags: ["System"],
  summary: "Readiness check",
  description: "Checks whether the API can reach its configured SQLite database.",
  responses: {
    200: jsonResponse("API and required dependencies are ready.", schemaRef("HealthResponse")),
    503: errorResponse("A required dependency is unavailable."),
  },
});

// POST /api/v1/lives/{liveId}/products/{productId}/image
registry.registerPath({
  method: "post",
  path: "/api/v1/lives/{liveId}/products/{productId}/image",
  tags: ["Products"],
  summary: "Deprecated product image upload",
  description: "This legacy unkeyed upload route is retired. Use the idempotent /images endpoint.",
  security: [{ CreatorSession: [] }],
  responses: {
    410: errorResponse("This unkeyed upload route has been retired."),
    401: errorResponse("Authentication is required."),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/lives/{liveId}/products/{productId}/images",
  tags: ["Products"],
  summary: "Upload a product image",
  description:
    "Uploads one JPEG, PNG, or WebP image up to 5 MB to a product owned by the authenticated creator. Reuse the required Idempotency-Key UUID and the exact same file bytes to safely retry an ambiguous upload. After a browser refresh, completed uploads can be recovered through the status endpoint. A pending upload requires selecting the original file again and retrying with the same key and bytes; uploaded file contents are not retained by the application. A product can have up to three active or pending images.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({ liveId: z.uuid(), productId: z.uuid() }),
    headers: z.object({
      "Idempotency-Key": z.uuid().openapi({
        param: { name: "Idempotency-Key", in: "header" },
        description: "UUID identifying this logical image upload; reuse it with the original file bytes when retrying.",
      }),
    }),
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({ image: z.string().openapi({ type: "string", format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    201: jsonResponse("Image uploaded and finalized.", schemaRef("ProductImageUploadSuccessResponse")),
    200: jsonResponse("Existing upload result returned.", schemaRef("ProductImageUploadSuccessResponse")),
    400: errorResponse("Invalid image, UUID, or upload request."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live or product not found or not owned by the creator."),
    409: errorResponse("The key was reused with different input, the product is deleting, or the image limit was reached."),
    410: errorResponse("This upload result was previously deleted."),
    413: errorResponse("Image exceeds the 5 MB limit."),
    502: errorResponse("Image storage provider failed."),
    503: errorResponse("Image storage or upload finalization is temporarily unavailable."),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/lives/{liveId}/product-image-uploads/{idempotencyKey}",
  tags: ["Products"],
  summary: "Get product image upload status",
  description:
    "Completed uploads return their saved image result. Pending uploads can be resumed by selecting the original file again and retrying the upload with the same idempotency key and exact file bytes.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({ liveId: z.uuid(), idempotencyKey: z.uuid() }),
  },
  responses: {
    200: jsonResponse("Pending or completed upload status returned.", schemaRef("ProductImageUploadStatusSuccessResponse")),
    400: errorResponse("Invalid Live ID or idempotency key."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Upload not found."),
    410: errorResponse("The image created by this request has since been deleted."),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/lives/{liveId}/products/{productId}/image-uploads/pending",
  tags: ["Products"],
  summary: "List pending product image uploads",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({ liveId: z.uuid(), productId: z.uuid() }),
  },
  responses: {
    200: jsonResponse("Pending upload attempts returned.", schemaRef("PendingProductImageUploadsSuccessResponse")),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product not found or not owned by the creator."),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/lives/{liveId}/products/{productId}/images/{imageId}/primary",
  tags: ["Products"],
  summary: "Select a product's primary image",
  description:
    "Sets an active image belonging to the authenticated creator's product as its primary image and returns the updated product with its active image gallery.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({ liveId: z.uuid(), productId: z.uuid(), imageId: z.uuid() }),
  },
  responses: {
    200: jsonResponse("Primary image selected.", schemaRef("ProductSuccessResponse")),
    400: errorResponse("Invalid Live, product, or image ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product or product image not found."),
    409: errorResponse("The product is deleting or the image is not active."),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/lives/{liveId}/products/{productId}/images/{imageId}",
  tags: ["Products"],
  summary: "Remove a product image",
  description:
    "Logically removes an active image from a product owned by the authenticated creator, releases its slot once, and attempts provider cleanup. Repeating the request for a deleting image retries provider cleanup without releasing the slot again.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({ liveId: z.uuid(), productId: z.uuid(), imageId: z.uuid() }),
  },
  responses: {
    200: jsonResponse("Updated product returned; provider cleanup is attempted synchronously.", schemaRef("ProductSuccessResponse")),
    400: errorResponse("Invalid Live, product, or image ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product or product image not found."),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/lives/{liveId}/products/{productId}/image",
  tags: ["Products"],
  summary: "Remove the primary product image",
  description:
    "Compatibility endpoint that removes the current primary image, if present. Use the image-specific endpoint to remove a chosen image or retry cleanup for an image already being deleted.",
  security: [{ CreatorSession: [] }],
  request: { params: z.object({ liveId: z.string(), productId: z.string() }) },
  responses: {
    200: jsonResponse("Image removed successfully.", schemaRef("ProductSuccessResponse")),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product not found or not owned by the creator."),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/creator/access",
  tags: ["Authentication"],
  summary: "Creator login",
  description:
    "Authenticates a creator using an access code and sets an HTTP-only session cookie.",
  request: {
    body: {
      required: true,
      content: jsonContent(schemaRef("CreatorAccessRequest")),
    },
  },
  responses: {
    200: jsonResponse(
      "Creator authenticated successfully.",
      schemaRef("CreatorSuccessResponse"),
    ),
    400: errorResponse("Invalid request body."),
    401: errorResponse("The access code is invalid."),
  },
});

// GET /api/v1/creator/me
registry.registerPath({
  method: "get",
  path: "/api/v1/creator/me",
  tags: ["Authentication"],
  summary: "Get the current creator",
  description: "Returns the creator associated with the current session.",
  security: [{ CreatorSession: [] }],
  responses: {
    200: jsonResponse(
      "Current creator returned.",
      schemaRef("CreatorSuccessResponse"),
    ),
    401: errorResponse(
      "Authentication is required or the session has expired.",
    ),
  },
});

// POST /api/v1/creator/logout
registry.registerPath({
  method: "post",
  path: "/api/v1/creator/logout",
  tags: ["Authentication"],
  summary: "Creator logout",
  description:
    "Invalidates the current creator session, if present, and clears the session cookie. Safe to call without an active session.",
  responses: {
    204: {
      description: "Session invalidated and cookie cleared.",
    },
  },
});

// POST /api/v1/lives
registry.registerPath({
  method: "post",
  path: "/api/v1/lives",
  tags: ["Lives"],
  summary: "Create a Live",
  description:
    "Creates a new Live for the authenticated creator. New Lives start in DRAFT status.",
  security: [{ CreatorSession: [] }],
  request: {
    body: {
      required: true,
      content: jsonContent(schemaRef("CreateLiveRequest")),
    },
  },
  responses: {
    201: jsonResponse(
      "Live created successfully.",
      schemaRef("LiveSuccessResponse"),
    ),
    400: errorResponse("Invalid request body."),
    401: errorResponse("Authentication is required."),
  },
});

// GET /api/v1/lives
registry.registerPath({
  method: "get",
  path: "/api/v1/lives",
  tags: ["Lives"],
  summary: "List the creator's Lives",
  description:
    "Returns Lives belonging to the authenticated creator, newest first.",
  security: [{ CreatorSession: [] }],
  responses: {
    200: jsonResponse(
      "Lives returned successfully.",
      schemaRef("LivesSuccessResponse"),
    ),
    401: errorResponse("Authentication is required."),
  },
});

// PATCH /api/v1/lives/{liveId}
registry.registerPath({
  method: "patch",
  path: "/api/v1/lives/{liveId}",
  tags: ["Lives"],
  summary: "Update a Live",
  description:
    "Updates a Live's name or status. Status transitions are validated by the backend.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live to update.",
      }),
    }),
    body: {
      required: true,
      content: jsonContent(schemaRef("UpdateLiveRequest")),
    },
  },
  responses: {
    200: jsonResponse(
      "Live updated successfully.",
      schemaRef("LiveSuccessResponse"),
    ),
    400: errorResponse("Invalid Live ID or request body."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live not found or not owned by the creator."),
    409: errorResponse("Invalid Live status transition."),
  },
});

// GET /api/v1/public/lives/{slug}
registry.registerPath({
  method: "get",
  path: "/api/v1/public/lives/{slug}",
  tags: ["Public Lives"],
  summary: "Get a public Live",
  description:
    "Returns an active Live and its public product information. Product images include active images ordered primary first, then by creation time and ID; the singular image field aliases the primary image. No provider storage identifiers are exposed, and no creator session is required.",
  request: {
    params: z.object({
      slug: z.string().openapi({
        description: "Public slug of the Live.",
      }),
    }),
  },
  responses: {
    200: jsonResponse(
      "Active Live returned.",
      schemaRef("PublicLiveSuccessResponse"),
    ),
    400: errorResponse("Invalid Live slug."),
    404: errorResponse("Active Live not found."),
  },
});

// POST /api/v1/lives/{liveId}/products
registry.registerPath({
  method: "get",
  path: "/api/v1/lives/{liveId}/products",
  tags: ["Products"],
  summary: "List products for a Live",
  description:
    "Returns products associated with a Live owned by the authenticated creator, oldest first. Each product includes active images ordered primary first, then by creation time and ID; the singular image field aliases the primary image.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live whose products should be returned.",
      }),
    }),
  },
  responses: {
    200: jsonResponse(
      "Products returned successfully.",
      schemaRef("ProductsSuccessResponse"),
    ),
    400: errorResponse("Invalid Live ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live not found or not owned by the creator."),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/lives/{liveId}/products",
  tags: ["Products"],
  summary: "Create a product",
  description:
    "Creates a product without an image for a Live owned by the authenticated creator. The request must be JSON and include an Idempotency-Key UUID. Repeating the same key and payload returns the original product; reusing the key with a different payload returns a conflict. Upload images separately after creation. Prices are integer pesewas, stock is a non-negative whole number, and options map group names to selectable string choices.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live receiving the product.",
      }),
    }),
    headers: z.object({
      "Idempotency-Key": z.uuid().openapi({
        param: { name: "Idempotency-Key", in: "header" },
        description: "A UUID reused for retries of the same logical product creation request.",
      }),
    }),
    body: {
      required: true,
      content: {
        "application/json": { schema: schemaRef("CreateProductRequest") },
      },
    },
  },
  responses: {
    201: jsonResponse(
      "Product created successfully.",
      schemaRef("ProductSuccessResponse"),
    ),
    400: errorResponse("Invalid Live ID or product data."),
    401: errorResponse("Authentication is required."),
    409: errorResponse("The idempotency key was already used for a different product request."),
    404: errorResponse("Live not found or not owned by the creator."),
    410: errorResponse("The product created by this request has since been deleted."),
    415: errorResponse("Product creation accepts JSON only."),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/lives/{liveId}/products/{productId}",
  tags: ["Products"],
  summary: "Update a product",
  description:
    "Updates a product belonging to a Live owned by the authenticated creator.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string(),
      productId: z.string(),
    }),
    body: {
      required: true,
      content: jsonContent(schemaRef("UpdateProductRequest")),
    },
  },
  responses: {
    200: jsonResponse(
      "Product updated successfully.",
      schemaRef("ProductSuccessResponse"),
    ),
    400: errorResponse("Invalid product ID or request body."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product not found or not owned by the creator."),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/lives/{liveId}/products/{productId}",
  tags: ["Products"],
  summary: "Delete a product",
  description:
    "Deletes a product belonging to a Live owned by the authenticated creator. Products referenced by order history cannot be deleted.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string(),
      productId: z.string(),
    }),
  },
  responses: {
    204: { description: "Product deleted successfully." },
    400: errorResponse("Invalid product ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Product not found or not owned by the creator."),
    409: errorResponse("Product has order history, pending uploads, or is already being deleted."),
  },
});

// POST /api/v1/lives/{liveId}/orders
registry.registerPath({
  method: "post",
  path: "/api/v1/lives/{liveId}/orders",
  tags: ["Orders"],
  summary: "Place an order",
  description:
    "Creates a customer order for an active Live. Each configured product option group requires one valid customer selection. The backend uses current product prices, calculates the total, and atomically decrements stock with order creation. An optional Idempotency-Key UUID makes safe retries return the original order and customer-facing reference. No creator session is required.",
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live being ordered from.",
      }),
    }),
    headers: z.object({
      "Idempotency-Key": z.uuid().optional().openapi({
        param: { name: "Idempotency-Key", in: "header" },
        description: "A UUID reused for retries of the same logical order request.",
      }),
    }),
    body: {
      required: true,
      content: jsonContent(schemaRef("CreateOrderRequest")),
    },
  },
  responses: {
    201: jsonResponse(
      "Order created successfully.",
      schemaRef("OrderSuccessResponse"),
    ),
    400: errorResponse("Invalid order data, product, or selected product options."),
    404: errorResponse("Live not found."),
    409: errorResponse("Live is inactive, product stock is insufficient, or the idempotency key was reused with a different request."),
  },
});

// GET /api/v1/lives/{liveId}/orders
registry.registerPath({
  method: "get",
  path: "/api/v1/lives/{liveId}/orders",
  tags: ["Orders"],
  summary: "List orders",
  description:
    "Returns orders associated with a Live owned by the authenticated creator.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live whose orders should be returned.",
      }),
    }),
  },
  responses: {
    200: jsonResponse(
      "Orders returned successfully.",
      schemaRef("OrdersSuccessResponse"),
    ),
    400: errorResponse("Invalid Live ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live not found or not owned by the creator."),
  },
});

// PATCH /api/v1/orders/{orderId}
registry.registerPath({
  method: "patch",
  path: "/api/v1/orders/{orderId}",
  tags: ["Orders"],
  summary: "Mark an order as paid",
  description:
    "Marks an order as PAID after the creator manually confirms payment.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      orderId: z.string().openapi({
        description: "ID of the order to update.",
      }),
    }),
    body: {
      required: true,
      content: jsonContent(schemaRef("UpdateOrderRequest")),
    },
  },
  responses: {
    200: jsonResponse(
      "Order payment status updated.",
      schemaRef("OrderSuccessResponse"),
    ),
    400: errorResponse("Invalid order ID or request body."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Order not found or not owned by the creator."),
  },
});

// GET /api/v1/lives/{liveId}/orders/export
registry.registerPath({
  method: "get",
  path: "/api/v1/lives/{liveId}/orders/export",
  tags: ["Orders"],
  summary: "Export orders as CSV",
  description:
    "Downloads order data as a CSV file. Monetary values are expressed in pesewas. Existing columns are followed by the customer-facing order reference.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live whose orders should be exported.",
      }),
    }),
  },
  responses: {
    200: {
      description: "CSV file containing order and order-item data.",
      content: {
        "text/csv": {
          schema: {
            type: "string",
            description: "CSV document.",
          },
        },
      },
      headers: {
        "Content-Disposition": {
          description: "Attachment filename for the CSV download.",
          schema: { type: "string" },
        },
        "Cache-Control": {
          description: "Response cache policy.",
          schema: { type: "string" },
        },
      },
    },
    400: errorResponse("Invalid Live ID."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live not found or not owned by the creator."),
  },
});

const generator = new OpenApiGeneratorV31(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "LiveOrder API",
    version: "1.0.0",
    description:
      "API for creator authentication, live management, product management, customer ordering, payment tracking, and CSV exports.",
  },
  servers: [
    {
      url: "/",
      description: "Current server",
    },
  ],
});
