import { Router } from "express";
import { getPool } from "@scout-expense-tracker/db";

const router = Router();

const VERSION = process.env.VERSION ?? "dev";
const GIT_SHA = process.env.GIT_SHA ?? "dev";

router.get("/", async (_req, res) => {
  const health: { status: string; db: string; version: string; gitSha: string } =
    {
      status: "ok",
      db: "unknown",
      version: VERSION,
      gitSha: GIT_SHA,
    };
  try {
    const client = await getPool().connect();
    try {
      await client.query("select 1");
      health.db = "up";
    } finally {
      client.release();
    }
  } catch {
    health.db = "down";
    health.status = "degraded";
  }
  res.status(health.status === "ok" ? 200 : 503).json(health);
});

export default router;
