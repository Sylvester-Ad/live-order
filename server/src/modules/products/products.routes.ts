import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createProductSchema,
  productResponseSchema,
  productsResponseSchema,
  updateProductSchema,
} from "./products.schemas.js";
import {
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from "./products.service.js";
import { AppError } from "../../shared/errors/app-error.js";

const router = Router();

router.get(
  "/lives/:liveId/products",
  requireCreator,
  async (req, res, next) => {
    try {
      const liveId = req.params.liveId;

      if (typeof liveId !== "string") {
        throw new AppError(
          400,
          "INVALID_LIVE_ID",
          "Live ID must be a single string",
        );
      }

      const products = await listProducts(req.creator!.id, liveId);

      return res.json({
        data: productsResponseSchema.parse(products),
      });
    } catch (error) {
      next(error);
    }
  },
);

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

router.patch(
  "/lives/:liveId/products/:productId",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;

      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }

      const input = updateProductSchema.parse(req.body);
      const product = await updateProduct(
        req.creator!.id,
        liveId,
        productId,
        input,
      );

      return res.json({
        data: productResponseSchema.parse(product),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/lives/:liveId/products/:productId",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;

      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }

      await deleteProduct(req.creator!.id, liveId, productId);
      return res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
