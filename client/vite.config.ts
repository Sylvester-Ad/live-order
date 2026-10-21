import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, clientRoot, "");
  const apiProxyTarget = env.API_PROXY_TARGET?.trim() || "http://localhost:3000";
  const backendProxy = { target: apiProxyTarget, changeOrigin: true };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": backendProxy,
        "/api-docs": backendProxy,
        "/api-docs.json": backendProxy,
      },
    },
    preview: {
      port: 4173,
    },
    test: {
      environment: "jsdom",
      globals: true,
      maxWorkers: 2,
      include: ["tests/**/*.test.{ts,tsx}"],
      setupFiles: ["./tests/setup.ts"],
      css: true,
    },
  };
});
