import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { categoryRepository } from "./service-category.repository";
export const categoryRouter = Router();
categoryRouter.get("/", async (_r, res, next) => {
  try {
    res.json(await categoryRepository.list());
  } catch (e) {
    next(e);
  }
});
categoryRouter.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await categoryRepository.create(req.body.name, req.body.slug));
    } catch (e) {
      next(e);
    }
  },
);
