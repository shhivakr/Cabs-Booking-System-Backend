import crypto from "crypto";

export const generateOpaqueToken = (): string => {
  return crypto.randomBytes(40).toString("hex");
};

export const hashOpaqueToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
