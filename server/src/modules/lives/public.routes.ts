import { Router } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { getPublicStoreBySlug, toLegacyLiveStatus } from "./lives.service.js";

const router = Router();

async function getPublicStore(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction, legacy: boolean) {
  try {
    const { slug } = req.params;

    if (typeof slug !== "string") {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
        message: legacy ? "Invalid live slug" : "Invalid store slug",
        },
      });
    }

    const store = await getPublicStoreBySlug(slug);

    return res.status(200).json({
      data: legacy ? { ...store, status: toLegacyLiveStatus(store.status) } : store,
    });
  } catch (error) {
    next(legacy && error instanceof AppError && error.code === "STORE_NOT_FOUND"
      ? new AppError(404, "LIVE_NOT_FOUND", "Live not found")
      : error);
  }
}

router.get("/lives/:slug", (req, res, next) => getPublicStore(req, res, next, true));
router.get("/stores/:slug", (req, res, next) => getPublicStore(req, res, next, false));

export default router;
