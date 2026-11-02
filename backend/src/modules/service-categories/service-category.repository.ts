import { prisma } from "../../config/database";
export const categoryRepository = {
  list: () =>
    prisma.serviceCategory.findMany({
      where: { active: true },
      include: { services: true },
      orderBy: { name: "asc" },
    }),
  create: (name: string, slug: string) =>
    prisma.serviceCategory.create({ data: { name, slug } }),
};
