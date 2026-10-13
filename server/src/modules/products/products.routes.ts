import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createProductSchema,
  productResponseSchema,
} from "./products.schemas.js";
import { createProduct } from "./products.service.js";
import { AppError } from "../../shared/errors/app-error.js";

const router = Router();

router.post(
  "/lives/:liveId/products",
  requireCreator,
  async (req, res, next) => {
    try {
      const input = createProductSchema.parse(req.body);

      const liveId = req.params.liveId;

      if (typeof liveId !== "string") {
        throw new AppError(
          400,
          "INVALID_LIVE_ID",
          "Live ID must be a single string",
        );
      }

      const product = await createProduct(req.creator!.id, liveId, input);

      return res.status(201).json({
        data: productResponseSchema.parse(product),
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
