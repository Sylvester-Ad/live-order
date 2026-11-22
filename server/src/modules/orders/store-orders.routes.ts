import { Router } from "express";
import { z } from "zod";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import { getOrder, markOrderAsPaid } from "./orders.service.js";
import { storeOrderResponseSchema, updateOrderSchema } from "./orders.schemas.js";

const router = Router({ mergeParams: true });
const paramsSchema = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });

router.get("/:orderId", requireCreator, async (req, res, next) => {
  try {
    const { storeId, orderId } = paramsSchema.parse(req.params);
    const order = await getOrder(req.creator!.id, storeId, orderId);
    return res.json({ data: storeOrderResponseSchema.parse({ ...order, storeId: order.storeId }) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:orderId", requireCreator, async (req, res, next) => {
  try {
    const { storeId, orderId } = paramsSchema.parse(req.params);
    const input = updateOrderSchema.parse(req.body);
    const order = await markOrderAsPaid(req.creator!.id, orderId, storeId);
    return res.json({
      data: storeOrderResponseSchema.parse({
        ...order,
        storeId: order.storeId,
        paymentStatus: input.paymentStatus,
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
