// ============================================
// PLATFORM SUPPORT — database side of /api/instance/support/*.
// Pure rules live in ./support.ts.
// ============================================

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getTicketDashboardCounts } from "@/lib/tickets/service";
import { PLATFORM_SUPPORT_EMAIL, PLATFORM_SUPPORT_NAME } from "./support";

/** Id of the platform support account, or null when it was never needed yet. */
export async function findPlatformSupportUserId(): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { email: PLATFORM_SUPPORT_EMAIL }, select: { id: true } });
    return row?.id ?? null;
}

/**
 * The account that signs Console replies, created on first use. Created lazily
 * (never at seed) because POST /api/instance/bootstrap refuses to run once any
 * user exists. Inactive, random unusable password: it cannot log in and takes
 * no seat. DEVELOPER keeps it on the internal side of every ticket rule.
 */
export async function getPlatformSupportUserId(): Promise<string> {
    const existing = await findPlatformSupportUserId();
    if (existing) return existing;
    const password = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
    const row = await prisma.user.upsert({
        where: { email: PLATFORM_SUPPORT_EMAIL },
        update: {},
        create: { email: PLATFORM_SUPPORT_EMAIL, name: PLATFORM_SUPPORT_NAME, password, role: "DEVELOPER", isActive: false },
        select: { id: true },
    });
    return row.id;
}

/** Counters for the Console's per-agency badges and fleet totals. */
export async function getSupportCounts() {
    const [dashboard, open, fresh] = await Promise.all([
        getTicketDashboardCounts(),
        prisma.ticket.count({ where: { status: { not: "COMPLETED" }, validation: { not: "REJECTED" } } }),
        prisma.ticket.count({ where: { status: "NEW", validation: { not: "REJECTED" } } }),
    ]);
    return { open, new: fresh, ...dashboard };
}
