import type { CorsOptions } from "cors";

const localDevelopmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export function createCorsOptions(configuredOrigins = process.env.CORS_ORIGINS): CorsOptions {
  const allowedOrigins = new Set(
    (configuredOrigins ?? localDevelopmentOrigins.join(","))
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return {
    credentials: true,
    origin(origin, callback) {
      if (origin && allowedOrigins.has(origin)) {
        callback(null, origin);
        return;
      }

      callback(null, false);
    },
  };
}
