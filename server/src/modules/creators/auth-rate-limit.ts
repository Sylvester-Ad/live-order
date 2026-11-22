import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";

type WindowState = { count: number; resetAt: number };
const windows = new Map<string, WindowState>();

export function authRateLimit(name: string, limit = 10, windowMs = 15 * 60 * 1000): RequestHandler {
  return (req, _res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip ?? "unknown"}`;
    const previous = windows.get(key);
    const state = !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : previous;
    state.count += 1;
    windows.set(key, state);
    if (windows.size > 5000) {
      for (const [entryKey, value] of windows) if (value.resetAt <= now) windows.delete(entryKey);
    }
    if (state.count > limit) {
      next(new AppError(429, "AUTH_RATE_LIMITED", "Too many attempts. Try again later."));
      return;
    }
    next();
  };
}

export function resetAuthRateLimitsForTests() {
  if (process.env.NODE_ENV === "test") windows.clear();
}
