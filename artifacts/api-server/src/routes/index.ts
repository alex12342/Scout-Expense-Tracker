import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import scoutsRouter from "./scouts";
import leadersRouter from "./leaders";
import bankAccountsRouter from "./bankAccounts";
import ledgerRouter from "./ledger";
import eventsRouter from "./events";
import dashboardRouter from "./dashboard";
import duesRouter from "./dues";
import importRouter from "./import";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/scouts", scoutsRouter);
router.use("/leaders", leadersRouter);
router.use("/bank-accounts", bankAccountsRouter);
router.use("/ledger", ledgerRouter);
router.use("/events", eventsRouter);
router.use("/dues", duesRouter);
router.use("/import", importRouter);
router.use("/reports", reportsRouter);

export default router;
