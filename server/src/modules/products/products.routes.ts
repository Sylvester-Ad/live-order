import { Router } from "express";
import multer from "multer";
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
import { removeProductImage, productImageValidation, uploadProductImage } from "./product-images.service.js";

const router = Router();
const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: productImageValidation.maxBytes, files: 1, fields: 0 },
}).single("image");

const imageUploadMiddleware: import("express").RequestHandler = (req, res, next) => {
  parseImage(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(413, "IMAGE_TOO_LARGE", "Product images must be 5 MB or smaller"));
    }
    return next(new AppError(400, "INVALID_IMAGE_UPLOAD", "Choose one image file to upload"));
  });
};

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

router.post(
  "/lives/:liveId/products/:productId/image",
  requireCreator,
  imageUploadMiddleware,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;
      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }
      if (!req.file) throw new AppError(400, "IMAGE_REQUIRED", "Choose an image to upload");

      const product = await uploadProductImage(req.creator!.id, liveId, productId, req.file);
      return res.json({ data: productResponseSchema.parse(product) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/lives/:liveId/products/:productId/image",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;
      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }

      const product = await removeProductImage(req.creator!.id, liveId, productId);
      return res.json({ data: productResponseSchema.parse(product) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
