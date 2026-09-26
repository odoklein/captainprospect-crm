const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const profileCount = await prisma.hrProfile.count();
  const monthRecordCount = await prisma.hrMonthRecord.count();
  console.log("HR Tables verified! HrProfile count:", profileCount, "HrMonthRecord count:", monthRecordCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
