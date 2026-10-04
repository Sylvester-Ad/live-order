import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import { createLiveSchema, liveResponseSchema } from "./lives.schemas.js";
import { createLive } from "./lives.service.js";

const router = Router();

router.post("/", requireCreator, async (req, res, next) => {
  try {
    const input = createLiveSchema.parse(req.body);

    const live = await createLive(req.creator!.id, input);

    return res.status(201).json({
      data: liveResponseSchema.parse(live),
    });
  } catch (error) {
    next(error);
  }
});

export default router;