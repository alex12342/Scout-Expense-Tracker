import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/auth";
import apiRouter from "./routes";

function buildApp(): Express {
  const app = express();

  // Trust exactly one reverse-proxy hop (Nginx) so req.ip is the real client.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  const corsOriginRaw = (process.env.CORS_ORIGIN ?? "").trim();
  const whitelist = corsOriginRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin: boolean | string[] =
    corsOriginRaw === "" || corsOriginRaw === "*" || whitelist.length === 0
      ? true
      : whitelist;

  app.use(
    cors({
      origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(authMiddleware);
  app.use("/api", apiRouter);

  // JSON 404 for unknown API routes.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Central error handler.
  app.use(
    (
      err: Error & { status?: number; issues?: unknown },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status ?? 500;
      if (status >= 500) logger.error({ err: err.message }, "Request failed");
      res.status(status).json({
        error: status >= 500 ? "Internal server error" : err.message,
        ...(err.issues ? { issues: err.issues } : {}),
      });
    },
  );

  return app;
}

export default buildApp();
