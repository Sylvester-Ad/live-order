import { Router } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { creatorAccessSchema, creatorResponseSchema } from "./creators.schemas.js";
import {
  authenticateCreator,
  createCreatorSession,
} from "./creators.service.js";
import { requireCreator } from "../../shared/middleware/require-creator.js";

const router = Router();

router.post("/access", async (req, res, next) => {
  try {
    const input = creatorAccessSchema.parse(req.body);
    const creator = await authenticateCreator(input);

    if (!creator) {
      throw new AppError(
        401,
        "INVALID_ACCESS_CODE",
        "Invalid access code",
      );
    }

    const sessionToken = await createCreatorSession(creator.id);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      data: creatorResponseSchema.parse(creator),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireCreator, (req, res) => {
  return res.json({
    data: creatorResponseSchema.parse(req.creator),
  });
});

export default router;