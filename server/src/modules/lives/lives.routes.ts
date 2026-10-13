import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createLiveSchema,
  liveResponseSchema,
  updateLiveSchema,
} from "./lives.schemas.js";
import { createLive, updateLive } from "./lives.service.js";
import { AppError } from "../../shared/errors/app-error.js";

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

router.patch("/:liveId", requireCreator, async (req, res, next) => {
  try {
    const liveId = req.params.liveId;

    if (typeof liveId !== "string") {
      throw new AppError(
        400,
        "INVALID_LIVE_ID",
        "Live ID must be a single string",
      );
    }

    const input = updateLiveSchema.parse(req.body);
    const live = await updateLive(req.creator!.id, liveId, input);

    return res.json({
      data: liveResponseSchema.parse(live),
    });
  } catch (error) {
    next(error);
  }
});

export default router;