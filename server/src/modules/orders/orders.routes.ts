import { Router } from "express";
import { createOrderSchema, orderResponseSchema } from "./orders.schemas.js";
import { createOrder } from "./orders.service.js";

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

export default router;