import type { RequestHandler } from "express";
import { prisma } from "../../database/prisma.js";
import { hashSessionToken } from "../utils/sessions.js";
import { AppError } from "../errors/app-error.js";

declare global {
  namespace Express {
    interface Request {
      creator?: {
        id: string;
        name: string;
      };
    }
  }
}

export const requireCreator: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.session;

    if (!token) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const session = await prisma.creatorSession.findUnique({
      where: {
        tokenHash: hashSessionToken(token),
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    req.creator = session.creator;

    next();
  } catch (error) {
    next(error);
  }
};