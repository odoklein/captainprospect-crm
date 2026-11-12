import { PrismaClient } from '@prisma/client';
import { EXTERNAL_ENDPOINTS } from './reference-data';

const prisma = new PrismaClient();

async function seedEndpoints() {
  console.log('🌱 Seeding external endpoints...');

  const endpoints = EXTERNAL_ENDPOINTS;

  for (const endpoint of endpoints) {
    const existing = await prisma.externalEndpoint.findUnique({
      where: { path: endpoint.path },
    });

    if (existing) {
      console.log(`  ✓ Endpoint ${endpoint.path} already exists, updating...`);
      await prisma.externalEndpoint.update({
        where: { path: endpoint.path },
        data: endpoint,
      });
    } else {
      console.log(`  + Creating endpoint ${endpoint.path}...`);
      await prisma.externalEndpoint.create({
        data: endpoint,
      });
    }
  }

  console.log('✅ Endpoints seeded successfully!');
}

async function main() {
  try {
    await seedEndpoints();
  } catch (error) {
    console.error('❌ Error seeding endpoints:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
