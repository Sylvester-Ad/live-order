import cors from "cors";
import express from "express";
import creatorsRouter from "./modules/creators/creators.routes.js";
import cookieParser from "cookie-parser";
import livesRouter from "./modules/lives/lives.routes.js";
import productsRouter from "./modules/products/products.routes.js";
import ordersRouter from "./modules/orders/orders.routes.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import publicLivesRouter from "./modules/lives/pubic.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

app.use("/api/v1/creator", creatorsRouter);
app.use("/api/v1/lives", livesRouter);
app.use("/api/v1", productsRouter);
app.use("/api/v1", ordersRouter);
app.use("/api/v1/public", publicLivesRouter);

app.use(errorHandler);

export default app;
