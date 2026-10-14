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

// POST /api/v1/creator/access
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
    "Returns an active Live and its public product information. No creator session is required.",
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
  method: "post",
  path: "/api/v1/lives/{liveId}/products",
  tags: ["Products"],
  summary: "Create a product",
  description:
    "Adds a product to a Live owned by the authenticated creator. Prices are represented in pesewas.",
  security: [{ CreatorSession: [] }],
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live receiving the product.",
      }),
    }),
    body: {
      required: true,
      content: jsonContent(schemaRef("CreateProductRequest")),
    },
  },
  responses: {
    201: jsonResponse(
      "Product created successfully.",
      schemaRef("ProductSuccessResponse"),
    ),
    400: errorResponse("Invalid Live ID or product data."),
    401: errorResponse("Authentication is required."),
    404: errorResponse("Live not found or not owned by the creator."),
  },
});

// POST /api/v1/lives/{liveId}/orders
registry.registerPath({
  method: "post",
  path: "/api/v1/lives/{liveId}/orders",
  tags: ["Orders"],
  summary: "Place an order",
  description:
    "Creates a customer order for an active Live. Product prices and order totals are calculated by the backend. No creator session is required.",
  request: {
    params: z.object({
      liveId: z.string().openapi({
        description: "ID of the Live being ordered from.",
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
    400: errorResponse("Invalid Live ID or order data."),
    404: errorResponse("Live or requested product not found."),
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
    "Downloads order data as a CSV file. Monetary values are expressed in pesewas.",
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
