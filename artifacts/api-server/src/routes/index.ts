import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mpesaRouter from "./mpesa";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mpesaRouter);
router.use(adminRouter);

export default router;
