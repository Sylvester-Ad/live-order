import app from "./app.js";
import { prisma } from "./database/prisma.js";

const PORT = process.env.PORT ?? 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

let shutdownStarted = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; shutting down.`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out; closing active connections.");
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close((error) => {
    void prisma.$disconnect().then(() => {
      if (error) {
        console.error("HTTP server shutdown failed.");
        process.exitCode = 1;
      }
    }).catch(() => {
      console.error("Database shutdown failed.");
      process.exitCode = 1;
    }).finally(() => {
      clearTimeout(forceExitTimer);
    });
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
