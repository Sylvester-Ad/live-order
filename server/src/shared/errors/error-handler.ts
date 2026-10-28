import type { ErrorRequestHandler } from "express";
import z, { ZodError } from "zod";
import { AppError } from "./app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: z.treeifyError(error),
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && {
          details: error.details,
        }),
      },
    });
  }

  if (process.env.NODE_ENV === "production") {
    const errorName = error instanceof Error ? error.name : typeof error;
    console.error(JSON.stringify({
      level: "error",
      event: "http.unhandled_error",
      method: req.method,
      route: req.route?.path ? `${req.baseUrl}${req.route.path}` : "unmatched",
      status: 500,
      errorName,
    }));
  } else {
    console.error(error);
  }

  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
