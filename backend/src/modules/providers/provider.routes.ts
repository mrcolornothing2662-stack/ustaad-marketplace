import { z } from "zod";
import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import type { AuthenticatedRequest } from "../../common/types/authenticated-request";
import { providerRepository } from "./provider.repository";
export const providerRouter = Router();
providerRouter.use(authenticate, authorize("PROVIDER"));
providerRouter.get("/me", async (req, res, next) => {
  try {
    res.json(
      await providerRepository.findByUser(
        (req as AuthenticatedRequest).user!.id,
      ),
    );
  } catch (e) {
    next(e);
  }
});
providerRouter.put("/me", async (req, res, next) => {
  try {
    const b = z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().min(10).max(4000),
        experienceYears: z.number().int().min(0).max(80),
        languages: z.array(z.string().min(1)).min(1),
        city: z.string().min(2),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        serviceRadiusKm: z.number().positive().max(200),
      })
      .parse(req.body);
    res.json(
      await providerRepository.complete(
        (req as AuthenticatedRequest).user!.id,
        {
          title: b.title,
          description: b.description,
          experienceYears: b.experienceYears,
          languages: b.languages,
          city: b.city,
          latitude: b.latitude,
          longitude: b.longitude,
          serviceRadiusKm: b.serviceRadiusKm,
        },
      ),
    );
  } catch (e) {
    next(e);
  }
});
