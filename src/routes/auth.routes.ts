import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { login, refresh, logout, getMe, loginSchema, refreshSchema, logoutSchema } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", authenticate, validate(logoutSchema), logout);
router.get("/me", authenticate, getMe);

export default router;
