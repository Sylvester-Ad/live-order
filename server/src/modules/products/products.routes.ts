import { Router } from "express";
import multer from "multer";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createProductSchema,
  productCreationIdempotencyKeySchema,
  productImageUploadIdempotencyKeySchema,
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
import {
  getProductImageUploadStatus,
  listPendingProductImageUploads,
  uploadProductImage,
} from "./product-image-uploads.service.js";
import {
  removeProductImage,
  removeProductImageById,
  productImageValidation,
  selectPrimaryProductImage,
} from "./product-images.service.js";
import {
  pendingProductImageUploadsSchema,
  productImageUploadStatusSchema,
  productImageUploadSuccessSchema,
} from "./products.schemas.js";
import { z } from "zod";

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

const validateImageUploadRequest: import("express").RequestHandler = (req, _res, next) => {
  try {
    z.object({ liveId: z.uuid(), productId: z.uuid() }).parse(req.params);
    productImageUploadIdempotencyKeySchema.parse(req.get("Idempotency-Key"));
    next();
  } catch (error) {
    next(error);
  }
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
      if (req.is("multipart/form-data")) {
        throw new AppError(
          415,
          "UNSUPPORTED_PRODUCT_MEDIA_TYPE",
          "Product creation accepts JSON only. Create the product first, then upload an image separately.",
        );
      }
      const input = createProductSchema.parse(req.body);
      const idempotencyKey = productCreationIdempotencyKeySchema.parse(req.get("Idempotency-Key"));

      const liveId = req.params.liveId;

      if (typeof liveId !== "string") {
        throw new AppError(
          400,
          "INVALID_LIVE_ID",
          "Live ID must be a single string",
        );
      }

      const product = await createProduct(req.creator!.id, liveId, input, idempotencyKey);

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
  (_req, _res, next) => {
    next(new AppError(
      410,
      "IDEMPOTENT_IMAGE_UPLOAD_REQUIRED",
      "This upload route is retired. Use the /images endpoint with an Idempotency-Key header.",
    ));
  },
);

router.post(
  "/lives/:liveId/products/:productId/images",
  requireCreator,
  validateImageUploadRequest,
  imageUploadMiddleware,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;
      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }
      if (!req.file) throw new AppError(400, "IMAGE_REQUIRED", "Choose an image to upload");

      const result = await uploadProductImage(
        req.creator!.id,
        liveId,
        productId,
        req.get("Idempotency-Key"),
        req.file,
      );
      return res.status(result.statusCode).json({
        data: productImageUploadSuccessSchema.parse({
          product: result.product,
          image: result.image,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/lives/:liveId/product-image-uploads/:idempotencyKey",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, idempotencyKey } = req.params;
      if (typeof liveId !== "string" || typeof idempotencyKey !== "string") {
        throw new AppError(400, "INVALID_IMAGE_UPLOAD_ID", "Invalid image upload ID");
      }

      const status = await getProductImageUploadStatus(req.creator!.id, liveId, idempotencyKey);
      return res.json({ data: productImageUploadStatusSchema.parse(status) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/lives/:liveId/products/:productId/image-uploads/pending",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId } = req.params;
      if (typeof liveId !== "string" || typeof productId !== "string") {
        throw new AppError(400, "INVALID_PRODUCT_ID", "Invalid product ID");
      }

      const uploads = await listPendingProductImageUploads(req.creator!.id, liveId, productId);
      return res.json({ data: pendingProductImageUploadsSchema.parse(uploads) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/lives/:liveId/products/:productId/images/:imageId/primary",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId, imageId } = z.object({
        liveId: z.uuid(),
        productId: z.uuid(),
        imageId: z.uuid(),
      }).parse(req.params);

      const product = await selectPrimaryProductImage(
        req.creator!.id,
        liveId,
        productId,
        imageId,
      );
      return res.json({ data: productResponseSchema.parse(product) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/lives/:liveId/products/:productId/images/:imageId",
  requireCreator,
  async (req, res, next) => {
    try {
      const { liveId, productId, imageId } = z.object({
        liveId: z.uuid(),
        productId: z.uuid(),
        imageId: z.uuid(),
      }).parse(req.params);

      const product = await removeProductImageById(
        req.creator!.id,
        liveId,
        productId,
        imageId,
      );
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
