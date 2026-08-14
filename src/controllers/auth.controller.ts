import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database.js";
import { AppError } from "../utils/errors.js";
import { verifyPassword, generateAccessToken, createRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../services/auth.service.js";
import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  })
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  })
});

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.status !== "ACTIVE" || user.deletedAt) {
      throw new AppError("Invalid email or password", 401);
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError("Invalid email or password", 401);
    }

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = await createRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      status: "success",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken: oldToken } = req.body;

    const { accessToken, refreshToken } = await rotateRefreshToken(oldToken);

    res.json({
      status: "success",
      data: {
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Requires authentication, so req.user exists
    const userId = (req as any).user.id;
    const { refreshToken } = req.body;

    await revokeRefreshToken(userId, refreshToken);

    res.json({
      status: "success",
      message: "Logged out successfully"
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppError("User is inactive or deleted", 401);
    }

    res.json({
      status: "success",
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
