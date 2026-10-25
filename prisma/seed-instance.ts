// ============================================
// INSTANCE SEED — reference data for a fresh white-label instance.
//
//   npm run db:migrate:deploy    (schema first)
//   npm run db:seed:instance     (then this)
//
// Idempotent: every write is an upsert, so it is safe to re-run on every
// deploy. Creates no user, no client, no prospect data and no secret. The
// first manager is created by the control plane through the signed
// POST /api/instance/bootstrap (invite link, no password in clear).
//
// prisma/seed.ts (local demo database) seeds the same reference data from
// ./reference-data plus demo users and records.
// ============================================

import { PrismaClient } from "@prisma/client";
import {
    seedActionStatusDefinitions,
    seedExternalEndpoints,
    seedPermissions,
    seedResultCategories,
} from "./reference-data";

const prisma = new PrismaClient();

async function seedBrandSettings() {
    // Column defaults equal brand/brand.config.ts; the control plane then sets
    // this instance's identity through PUT /api/instance/brand. Never overwrites.
    await prisma.brandSettings.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" },
    });
    console.log("✅ BrandSettings default row present");
}

async function main() {
    console.log("🌱 Seeding instance reference data...");
    await seedBrandSettings();
    await seedPermissions(prisma);
    // Categories before statuses: statuses reference resultCategoryCode.
    await seedResultCategories(prisma);
    await seedActionStatusDefinitions(prisma);
    await seedExternalEndpoints(prisma);
    // SystemConfig: every key the app reads has a default in code, so nothing
    // is seeded; rows appear when a manager changes a setting.
    console.log("🎉 Instance seed complete");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
