import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import scoutsRouter from "./scouts";
import bankAccountsRouter from "./bankAccounts";
import ledgerRouter from "./ledger";
import eventsRouter from "./events";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/scouts", scoutsRouter);
router.use("/bank-accounts", bankAccountsRouter);
router.use("/ledger", ledgerRouter);
router.use("/events", eventsRouter);

export default router;
