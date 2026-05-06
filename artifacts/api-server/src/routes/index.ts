import { Router, type IRouter } from "express";
import healthRouter from "./health";
import creativesRouter from "./creatives";
import dashboardRouter from "./dashboard";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(creativesRouter);
router.use(dashboardRouter);
router.use(webhooksRouter);

export default router;
