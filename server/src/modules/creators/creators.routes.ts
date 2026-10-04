import { Router } from "express";
import { creatorAccessSchema } from "./creators.schemas.js";
import { authenticateCreator } from "./creators.service.js";

const router = Router();

router.post("/access", async (req, res, next) => {
  try {
    const input = creatorAccessSchema.parse(req.body);
    const creator = await authenticateCreator(input);

    if (!creator) {
      return res.status(401).json({
        error: {
          code: "INVALID_ACCESS_CODE",
          message: "Invalid access code",
        },
      });
    }

    return res.json({
      data: creator,
    });
  } catch (error) {
    next(error);
  }
});

export default router;