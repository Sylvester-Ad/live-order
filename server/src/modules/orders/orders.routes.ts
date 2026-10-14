import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createOrderSchema,
  orderResponseSchema,
  updateOrderSchema,
} from "./orders.schemas.js";
import { createOrder, listOrders, markOrderAsPaid } from "./orders.service.js";
import { AppError } from "../../shared/errors/app-error.js";

const router = Router();

router.post("/lives/:liveId/orders", async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const liveId = req.params.liveId;

    if (typeof liveId !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_LIVE_ID",
          message: "Live ID must be a single string",
        },
      });
    }

    const order = await createOrder(liveId, input);

    return res.status(201).json({
      data: orderResponseSchema.parse(order),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/lives/:liveId/orders", requireCreator, async (req, res, next) => {
  try {
    const liveId = req.params.liveId;

    if (typeof liveId !== "string") {
      throw new AppError(
        400,
        "INVALID_LIVE_ID",
        "Live ID must be a single string",
      );
    }

    const orders = await listOrders(req.creator!.id, liveId);

    return res.json({
      data: orders.map((order) => orderResponseSchema.parse(order)),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:orderId", requireCreator, async (req, res, next) => {
  try {
    const orderId = req.params.orderId;

    if (typeof orderId !== "string") {
      throw new AppError(
        400,
        "INVALID_ORDER_ID",
        "Order ID must be a single string",
      );
    }

    const input = updateOrderSchema.parse(req.body);

    const order = await markOrderAsPaid(req.creator!.id, orderId);

    return res.json({
      data: orderResponseSchema.parse({
        ...order,
        paymentStatus: input.paymentStatus,
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default router;