// npx tsx tutorials/capture/seed/index.ts — fictional data for tutorial captures.
import { prisma, wipe, seedCore, seedActions } from "./core";
import { seedExtras } from "./extras";

async function main() {
    await wipe();
    await seedCore();
    const n = await seedActions();
    await seedExtras();
    console.log(`seed-demo: ok (${n} calls)`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
