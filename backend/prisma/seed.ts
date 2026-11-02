import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
const password = "UstaadDev123!";
async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email: "admin@ustaad.local" },
    update: {},
    create: {
      name: "Development Admin",
      email: "admin@ustaad.local",
      phone: "+910000000001",
      passwordHash,
      role: UserRole.ADMIN,
      status: "ACTIVE",
    },
  });
  const categories = await Promise.all(
    [
      ["Electrician", "electrician", "Electrical repair"],
      ["Plumber", "plumber", "Plumbing repair"],
      ["Carpenter", "carpenter", "Carpentry"],
    ].map(async ([name, slug, service]) =>
      prisma.serviceCategory.upsert({
        where: { slug: slug! },
        update: {},
        create: {
          name: name!,
          slug: slug!,
          services: { create: { name: service!, slug: `${slug}-repair` } },
        },
        include: { services: true },
      }),
    ),
  );
  for (let i = 1; i <= 3; i++) {
    const email = `provider${i}@ustaad.local`,
      service = categories[i - 1]!.services[0]!;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: `Demo Provider ${i}`,
        email,
        phone: `+91000000001${i}`,
        passwordHash,
        role: "PROVIDER",
        status: "ACTIVE",
        phoneVerifiedAt: new Date(),
        providerProfile: {
          create: {
            title: `Verified ${categories[i - 1]!.name}`,
            description:
              "Experienced independent professional. No platform commission.",
            experienceYears: 5 + i,
            languages: ["Punjabi", "Hindi", "English"],
            city: "Ludhiana",
            latitude: 30.901 + i * 0.01,
            longitude: 75.857,
            approvedAt: new Date(),
            services: {
              create: { serviceId: service.id, startingPrice: 499 + i * 100 },
            },
            availability: {
              create: Array.from({ length: 7 }, (_, weekday) => ({
                weekday,
                startTime: "09:00",
                endTime: "18:00",
              })),
            },
            badges: {
              create: [
                { type: "MOBILE_VERIFIED" },
                { type: "IDENTITY_VERIFIED" },
                { type: "SKILL_VERIFIED" },
              ],
            },
            trustScore: {
              create: {
                score: 82 + i,
                components: { seed: true },
                formulaVersion: "explainable-v1",
              },
            },
            trustHistory: {
              create: {
                previousScore: 50,
                newScore: 82 + i,
                components: { seed: true },
                reason: "SEED_APPROVAL",
                formulaVersion: "explainable-v1",
              },
            },
          },
        },
      },
    });
  }
  await prisma.user.upsert({
    where: { email: "pending@ustaad.local" },
    update: {},
    create: {
      name: "Pending Provider",
      email: "pending@ustaad.local",
      phone: "+910000000020",
      passwordHash,
      role: "PROVIDER",
      status: "VERIFICATION_REQUIRED",
      providerProfile: {
        create: {
          title: "Apprentice Electrician",
          experienceYears: 1,
          languages: ["Punjabi"],
        },
      },
    },
  });
  for (let i = 1; i <= 2; i++)
    await prisma.user.upsert({
      where: { email: `customer${i}@ustaad.local` },
      update: {},
      create: {
        name: `Demo Customer ${i}`,
        email: `customer${i}@ustaad.local`,
        phone: `+91000000003${i}`,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
        phoneVerifiedAt: new Date(),
        customerProfile: {
          create: {
            addresses: {
              create: {
                label: "Home",
                line1: `${i} Demo Street`,
                city: "Ludhiana",
                state: "Punjab",
                postalCode: "141001",
                latitude: 30.9,
                longitude: 75.85,
              },
            },
          },
        },
      },
    });
  console.log(
    "Seeded fake accounts. Password for every development account:",
    password,
  );
}
main().finally(() => prisma.$disconnect());
