import { Router } from "express";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import {
  createLiveSchema,
  liveResponseSchema,
  updateLiveSchema,
} from "./lives.schemas.js";
import {
  createStore,
  listStores,
  toLegacyLiveStatus,
  updateLegacyLive,
} from "./lives.service.js";
import { AppError } from "../../shared/errors/app-error.js";

const router = Router();

router.post("/", requireCreator, async (req, res, next) => {
  try {
    const input = createLiveSchema.parse(req.body);

    const live = await createStore(req.creator!.id, input);

    return res.status(201).json({
      data: liveResponseSchema.parse({ ...live, status: toLegacyLiveStatus(live.status) }),
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
    const live = await updateLegacyLive(req.creator!.id, liveId, input);

    return res.json({
      data: liveResponseSchema.parse({ ...live, status: toLegacyLiveStatus(live.status) }),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireCreator, async (req, res, next) => {
  try {
    const lives = await listStores(req.creator!.id);

    return res.json({
      data: lives.map((live) =>
        liveResponseSchema.parse({ ...live, status: toLegacyLiveStatus(live.status) })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
