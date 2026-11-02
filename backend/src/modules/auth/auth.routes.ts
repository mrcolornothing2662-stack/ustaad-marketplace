import { passwordRouter } from "./password.routes";
import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { validate } from "../../common/middleware/validate";
import { authController as c } from "./auth.controller";
import {
  loginSchema,
  otpSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schema";
const safe = (fn: Function) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export const authRouter = Router();
authRouter.post(
  "/register/customer",
  validate(registerSchema),
  safe(c.registerCustomer),
);
authRouter.post(
  "/register/provider",
  validate(registerSchema),
  safe(c.registerProvider),
);
authRouter.post("/login", validate(loginSchema), safe(c.login));
authRouter.post("/refresh", validate(refreshSchema), safe(c.refresh));
authRouter.post("/logout", validate(refreshSchema), safe(c.logout));
authRouter.get("/me", authenticate, c.me);
authRouter.post("/send-phone-otp", validate(otpSchema), safe(c.sendOtp));
authRouter.post("/verify-phone-otp", validate(otpSchema), safe(c.verifyOtp));

authRouter.use(passwordRouter);
