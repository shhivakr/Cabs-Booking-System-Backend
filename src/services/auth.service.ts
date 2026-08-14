import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { generateOpaqueToken, hashOpaqueToken } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, env.BCRYPT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateAccessToken = (userId: string, role: string): string => {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
    audience: "taxicrm",
    issuer: "taxicrm-api",
  };
  return jwt.sign({ id: userId, role }, env.JWT_ACCESS_SECRET, options);
};

export const verifyAccessToken = (token: string): any => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    throw new AppError("Invalid or expired access token", 401);
  }
};

export const createRefreshToken = async (userId: string): Promise<string> => {
  const token = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  
  // Calculate expiration (e.g., 7d = 7 days)
  const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace("d", "")) || 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return token;
};

export const rotateRefreshToken = async (
  oldTokenPlain: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  const oldTokenHash = hashOpaqueToken(oldTokenPlain);

  return await prisma.$transaction(async (tx) => {
    // 1. Find the old token
    const oldToken = await tx.refreshToken.findUnique({
      where: { tokenHash: oldTokenHash },
    });

    if (!oldToken) {
      throw new AppError("Invalid refresh token", 401);
    }

    if (oldToken.revokedAt) {
      // Security warning: possible token reuse!
      // In a strict implementation, we would revoke ALL tokens for this user.
      throw new AppError("Refresh token has already been revoked", 401);
    }

    if (oldToken.expiresAt < new Date()) {
      throw new AppError("Refresh token has expired", 401);
    }

    // 2. Revoke old token
    await tx.refreshToken.update({
      where: { id: oldToken.id },
      data: { revokedAt: new Date() },
    });

    // 3. Issue new tokens
    const user = await tx.user.findUnique({ where: { id: oldToken.userId } });
    if (!user || user.status !== "ACTIVE" || user.deletedAt) {
      throw new AppError("User is inactive or deleted", 401);
    }

    const accessToken = generateAccessToken(user.id, user.role);
    
    const newTokenPlain = generateOpaqueToken();
    const newTokenHash = hashOpaqueToken(newTokenPlain);
    const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace("d", "")) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await tx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: newTokenPlain };
  });
};

export const revokeRefreshToken = async (userId: string, tokenPlain: string): Promise<void> => {
  const tokenHash = hashOpaqueToken(tokenPlain);

  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!token || token.userId !== userId) {
    // Don't leak if the token doesn't exist or belongs to someone else
    return;
  }

  await prisma.refreshToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });
};
