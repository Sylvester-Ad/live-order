import cors from "cors";
import express from "express";
import creatorsRouter from "./modules/creators/creators.routes.js";
import cookieParser from "cookie-parser";
import { errorHandler } from "./shared/errors/error-handler.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

app.use("/api/v1/creator", creatorsRouter);

app.use(errorHandler);

export default app;