import { Router, type IRouter } from "express";
import healthRouter from "./health";
import creativesRouter from "./creatives";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(creativesRouter);
router.use(dashboardRouter);

export default router;
