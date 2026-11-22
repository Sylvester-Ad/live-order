import { Router } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { creatorAccessSchema, creatorResponseSchema } from "./creators.schemas.js";
import {
  authenticateCreator,
  createCreatorSession,
} from "./creators.service.js";
import { requireCreator } from "../../shared/middleware/require-creator.js";
import { prisma } from "../../database/prisma.js";
import { hashSessionToken } from "../../shared/utils/sessions.js";
import {
  mobileMoneySettingsResponseSchema,
  updateMobileMoneySettingsSchema,
} from "./mobile-money.schemas.js";
import {
  getMobileMoneySettings,
  saveMobileMoneySettings,
} from "./mobile-money.service.js";
import {
  claimSchema,
  emailRequestSchema,
  passwordLoginSchema,
  passwordResetSchema,
  registerSchema,
  tokenSchema,
} from "./auth.schemas.js";
import {
  claimSellerAccount,
  passwordLogin,
  registerSeller,
  requestPasswordReset,
  resetSellerPassword,
  verifySellerEmail,
} from "./account-auth.service.js";
import { authRateLimit } from "./auth-rate-limit.js";

const router = Router();
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post("/register", authRateLimit("register", 5), async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const message = await registerSeller(input);
    return res.status(202).json({ data: { message } });
  } catch (error) { next(error); }
});

router.post("/claim", authRateLimit("claim", 5), async (req, res, next) => {
  try {
    const input = claimSchema.parse(req.body);
    const message = await claimSellerAccount(input);
    return res.status(202).json({ data: { message } });
  } catch (error) { next(error); }
});

router.post("/verify-email", authRateLimit("verify-email", 20), async (req, res, next) => {
  try {
    const { token } = tokenSchema.parse(req.body);
    const creator = await verifySellerEmail(token);
    const sessionToken = await createCreatorSession(creator.id);
    res.cookie("session", sessionToken, cookieOptions);
    return res.json({ data: creatorResponseSchema.parse(creator) });
  } catch (error) { next(error); }
});

router.post("/password/login", authRateLimit("password-login", 10), async (req, res, next) => {
  try {
    const result = await passwordLogin(passwordLoginSchema.parse(req.body));
    res.cookie("session", result.token, cookieOptions);
    return res.json({ data: creatorResponseSchema.parse(result.creator) });
  } catch (error) { next(error); }
});

router.post("/password/forgot", authRateLimit("password-forgot", 10), async (req, res, next) => {
  try {
    const { email } = emailRequestSchema.parse(req.body);
    const message = await requestPasswordReset(email);
    return res.status(202).json({ data: { message } });
  } catch (error) { next(error); }
});

router.post("/password/reset", authRateLimit("password-reset", 10), async (req, res, next) => {
  try {
    await resetSellerPassword(passwordResetSchema.parse(req.body));
    res.clearCookie("session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/access", authRateLimit("access-code-login", 10), async (req, res, next) => {
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

    res.cookie("session", sessionToken, cookieOptions);

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

router.get("/mobile-money", requireCreator, async (req, res, next) => {
  try {
    const settings = await getMobileMoneySettings(req.creator!.id);
    return res.json({
      data: settings ? mobileMoneySettingsResponseSchema.parse(settings) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/mobile-money", requireCreator, async (req, res, next) => {
  try {
    const input = updateMobileMoneySettingsSchema.parse(req.body);
    const settings = await saveMobileMoneySettings(req.creator!.id, input);
    return res.json({
      data: mobileMoneySettingsResponseSchema.parse(settings),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const sessionToken = req.cookies?.session;

    if (sessionToken) {
      await prisma.creatorSession.deleteMany({
        where: {
          tokenHash: hashSessionToken(sessionToken),
        },
      });
    }

    res.clearCookie("session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
