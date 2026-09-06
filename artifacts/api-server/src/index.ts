import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 8080);

const server = app.listen(port, "127.0.0.1", () => {
  logger.info(
    { port, env: process.env.NODE_ENV ?? "development" },
    "scout-expense-tracker API listening",
  );
});

// Graceful shutdown (Supervisord sends SIGTERM on stop).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down API server");
    server.close(() => process.exit(0));
    // Force-exit if connections linger.
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
