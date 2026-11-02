import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { authService } from "./auth.service";
export const authController = {
  registerCustomer: async (req: Request, res: Response) =>
    res.status(201).json(await authService.register(req.body, "CUSTOMER")),
  registerProvider: async (req: Request, res: Response) =>
    res.status(201).json(await authService.register(req.body, "PROVIDER")),
  login: async (req: Request, res: Response) =>
    res.json(await authService.login(req.body.email, req.body.password)),
  refresh: async (req: Request, res: Response) =>
    res.json(await authService.refresh(req.body.refreshToken)),
  logout: async (req: Request, res: Response) => {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  },
  me: (req: Request, res: Response) =>
    res.json({ user: (req as AuthenticatedRequest).user }),
  sendOtp: async (req: Request, res: Response) =>
    res.json(await authService.sendOtp(req.body.phone)),
  verifyOtp: async (req: Request, res: Response) =>
    res.json(await authService.verifyOtp(req.body.phone, req.body.otp)),
};
