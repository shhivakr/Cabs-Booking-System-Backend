import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { Prisma } from "@prisma/client";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn({ err }, err.message);
    res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ err }, "Prisma Database Error");
    if (err.code === "P2002") {
      res.status(409).json({
        status: "error",
        message: "Unique constraint failed. A record with this value already exists.",
      });
      return;
    }
  }

  logger.error({ err }, "Unhandled Internal Error");
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
