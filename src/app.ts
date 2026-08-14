import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  pinoHttp({
    logger,
    autoLogging: process.env.NODE_ENV !== "test",
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Cab CRM Backend is running",
  });
});

// Register global error handler (must be last)
app.use(errorHandler);

export default app;
