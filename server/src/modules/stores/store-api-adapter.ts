import { Router, type RequestHandler, type Response } from "express";
import type { Router as ExpressRouter } from "express";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Mounts the existing Live-scoped route implementation under a Store URL.
 * The service and route handlers remain shared; this adapter only translates
 * the path, response vocabulary, and Live-specific errors at the HTTP edge.
 */
export function createStoreScopedAliasRouter(
  targetRouter: ExpressRouter,
  routePrefix: "/products" | "/orders",
) {
  const router = Router();
  const targetHandler = targetRouter as unknown as RequestHandler;

  router.use("/stores/:storeId", (req, res, next) => {
    if (!req.url.startsWith(routePrefix)) return next();

    const storeId = req.params.storeId;
    if (typeof storeId !== "string") return next();

    const originalUrl = req.url;
    req.url = `/lives/${encodeURIComponent(storeId)}${originalUrl}`;
    patchStoreJsonResponse(res);
    targetHandler(req, res, (error?: unknown) => {
      req.url = originalUrl;
      next(storeApiError(error));
    });
  });

  return router;
}

export function storeApiError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new ZodError(error.issues.map((issue) => ({
      ...issue,
      path: issue.path.map((segment) => segment === "liveId" ? "storeId" : segment),
    })));
  }
  if (!(error instanceof AppError)) return error;

  const code = error.code
    .replaceAll("LIVE_NOT_FOUND", "STORE_NOT_FOUND")
    .replaceAll("INVALID_LIVE_ID", "INVALID_STORE_ID")
    .replaceAll("LIVE_NOT_ACTIVE", "STORE_NOT_PUBLISHED");
  const message = error.message
    .replaceAll("Live", "Store")
    .replaceAll("LIVE", "Store");

  return new AppError(error.statusCode, code, message, error.details);
}

function patchStoreJsonResponse(res: Response) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(toStoreVocabulary(body))) as Response["json"];
}

function toStoreVocabulary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStoreVocabulary);
  if (typeof value !== "object" || value === null) return value;

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  const isProduct = "liveId" in (value as object) && "price" in (value as object) && "stockQuantity" in (value as object);
  const isOrder = "liveId" in (value as object) && "reference" in (value as object) && "customerName" in (value as object);
  const isPublicStore = "slug" in (value as object) && "products" in (value as object);

  for (const [key, item] of entries) {
    if (key === "liveId" && (isProduct || isOrder)) result.storeId = toStoreVocabulary(item);
    else if (isPublicStore && key === "status" && item === "ACTIVE") result.status = "PUBLISHED";
    else if (isPublicStore && key === "status" && item === "ENDED") result.status = "UNPUBLISHED";
    else result[key] = toStoreVocabulary(item);
  }

  return result;
}
