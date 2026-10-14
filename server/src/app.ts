import "./docs/zod-openapi.js";

import cors from "cors";
import express from "express";
import creatorsRouter from "./modules/creators/creators.routes.js";
import cookieParser from "cookie-parser";
import livesRouter from "./modules/lives/lives.routes.js";
import productsRouter from "./modules/products/products.routes.js";
import ordersRouter from "./modules/orders/orders.routes.js";
import publicLivesRouter from "./modules/lives/public.routes.js";
import swaggerUi from "swagger-ui-express";
import morgan from "morgan";
import { errorHandler } from "./shared/errors/error-handler.js";

const app = express();
let docsRouterPromise: Promise<express.Router> | undefined;

app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// OpenAPI documentation is loaded only when requested.
// The API itself does not depend on successful document generation.

// OpenAPI documentation is loaded lazily so API startup and tests
// do not depend on successful document generation.

app.get("/api-docs.json", async (_req, res, next) => {
  try {
    const { openApiDocument } = await import("./docs/openapi-bootstrap.js");

    res.json(openApiDocument);
  } catch (error) {
    next(error);
  }
});

app.use("/api-docs", async (req, res, next) => {
  try {
    docsRouterPromise ??= import("./docs/openapi-bootstrap.js").then(
      ({ openApiDocument }) => {
        const router = express.Router();

        router.use(swaggerUi.serve, swaggerUi.setup(openApiDocument));

        return router;
      },
    );

    const docsRouter = await docsRouterPromise;

    docsRouter(req, res, next);
  } catch (error) {
    next(error);
  }
});

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
