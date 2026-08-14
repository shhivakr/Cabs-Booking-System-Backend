import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from './routes/auth.routes.js';
import { customerRoutes } from './routes/customer.routes.js';
import { driverRoutes } from './routes/driver.routes.js';
import { vehicleRoutes } from './routes/vehicle.routes.js';
import { maintenanceRoutes } from './routes/maintenance.routes.js';

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

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/vehicles/:vehicleId/maintenance", maintenanceRoutes);

// Register global error handler (must be last)
app.use(errorHandler);

export default app;
