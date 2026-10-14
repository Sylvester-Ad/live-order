import { Router } from "express";
import { getPublicLiveBySlug } from "./lives.service.js";

const router = Router();

router.get("/lives/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    if (typeof slug !== "string") {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid live slug",
        },
      });
    }

    const live = await getPublicLiveBySlug(slug);

    return res.status(200).json({
      data: live,
    });
  } catch (error) {
    next(error);
  }
});

export default router;