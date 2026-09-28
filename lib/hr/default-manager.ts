import type { Prisma } from "@prisma/client";

// Manager every new SDR reports to until someone reassigns them.
export const DEFAULT_SDR_MANAGER_ID = process.env.DEFAULT_SDR_MANAGER_ID || "admin-001";

export async function resolveDefaultSdrManagerId(db: Prisma.TransactionClient): Promise<string | null> {
  const manager = await db.user.findFirst({
    where: { id: DEFAULT_SDR_MANAGER_ID, role: "MANAGER", isActive: true },
    select: { id: true },
  });
  return manager?.id ?? null;
}
