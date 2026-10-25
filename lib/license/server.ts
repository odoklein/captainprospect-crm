// ============================================
// LICENSE (server) — this instance's license, read from InstanceLicense.
//
//   const l = await getLicense();                 pages, route handlers
//   await assertSeatAvailable(role);              before creating / re-activating a user
//   await updateLicense(input, "instance-api");   control-plane write
//
// Same shape as lib/brand/server: one in-process entry shared through
// globalThis, short TTL, never throws. A missing table or row means "no limit,
// everything on" (the original deployment), never a locked-out instance.
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    DEFAULT_LICENSE,
    checkSeats,
    isFeatureEnabled,
    isSuspended,
    mergeLicense,
    usesSeat,
    type LicenseFeature,
    type LicenseInput,
    type LicenseValues,
    type SeatCheck,
} from "./resolve";

export const LICENSE_ROW_ID = "default";
const TTL_MS = 30_000;

type Entry = { license: LicenseValues; at: number };
type LicenseCacheState = { entry: Entry | null; inflight: Promise<Entry> | null; generation: number };

const g = globalThis as typeof globalThis & { __licenseCache?: LicenseCacheState };
const state: LicenseCacheState = (g.__licenseCache ??= { entry: null, inflight: null, generation: 0 });

let warned = false;

async function load(): Promise<Entry> {
    try {
        const row = await prisma.instanceLicense.findUnique({ where: { id: LICENSE_ROW_ID } });
        warned = false;
        return { license: mergeLicense(row as unknown as Record<string, unknown> | null), at: Date.now() };
    } catch (err) {
        if (!warned) {
            warned = true;
            console.warn("[license] InstanceLicense unreadable, running unlimited:", err instanceof Error ? err.message.split("\n").map((l) => l.trim()).filter(Boolean).pop() : err);
        }
        return { license: mergeLicense(null), at: Date.now() };
    }
}

async function getEntry(): Promise<Entry> {
    const e = state.entry;
    if (e && Date.now() - e.at < TTL_MS) return e;
    if (state.inflight) return state.inflight;
    const generation = state.generation;
    const p = load()
        .then((entry) => {
            if (generation === state.generation) state.entry = entry;
            return entry;
        })
        .finally(() => {
            if (state.inflight === p) state.inflight = null;
        });
    state.inflight = p;
    return p;
}

/** This instance's license (cached 30 s). Never throws. */
export async function getLicense(): Promise<LicenseValues> {
    return (await getEntry()).license;
}

export function invalidateLicense(): void {
    state.generation += 1;
    state.entry = null;
    state.inflight = null;
}

export async function isSuspendedInstance(): Promise<boolean> {
    return isSuspended(await getLicense());
}

export async function hasFeature(feature: LicenseFeature): Promise<boolean> {
    return isFeatureEnabled(await getLicense(), feature);
}

/** Active staff users: every active user whose role takes a seat. */
export async function countStaffSeats(client: Pick<typeof prisma, "user"> = prisma): Promise<number> {
    return client.user.count({ where: { isActive: true, role: { not: "CLIENT" } } });
}

/**
 * Would taking one more seat for `role` stay within the license?
 * A role that takes no seat (CLIENT) always passes. Fails open when the count
 * cannot be read: a transient database error must not block account creation
 * on a limit we cannot verify (the next write re-checks).
 */
export async function checkSeatFor(role: string, client: Pick<typeof prisma, "user"> = prisma): Promise<SeatCheck> {
    const license = await getLicense();
    if (!usesSeat(role) || license.seatLimit == null) return { ok: true, used: 0, limit: license.seatLimit };
    try {
        return checkSeats(license, await countStaffSeats(client), 1);
    } catch {
        return { ok: true, used: 0, limit: license.seatLimit };
    }
}

/** Seats used / limit, for the manager UI and the control-plane health probe. */
export async function getSeatUsage(): Promise<{ used: number | null; limit: number | null }> {
    const license = await getLicense();
    try {
        return { used: await countStaffSeats(), limit: license.seatLimit };
    } catch {
        return { used: null, limit: license.seatLimit };
    }
}

export function isLicenseTableMissing(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2010");
}

/** Upsert the license row from a validated partial input. Returns the before/after values. */
export async function updateLicense(input: LicenseInput, actor: string): Promise<{ before: LicenseValues; after: LicenseValues }> {
    const existing = await prisma.instanceLicense.findUnique({ where: { id: LICENSE_ROW_ID } });
    const before = mergeLicense(existing as unknown as Record<string, unknown> | null);

    const { features, ...scalars } = input;
    const data: Prisma.InstanceLicenseUncheckedUpdateInput = { ...scalars, updatedBy: actor };
    if (features) data.features = { ...before.features, ...features };
    // Resuming clears the reason unless the caller sets one.
    if (input.status === "ACTIVE" && !("suspendedReason" in input)) data.suspendedReason = null;

    const row = await prisma.instanceLicense.upsert({
        where: { id: LICENSE_ROW_ID },
        create: {
            id: LICENSE_ROW_ID,
            status: before.status,
            plan: before.plan,
            seatLimit: before.seatLimit,
            aiMonthlyQuota: before.aiMonthlyQuota,
            suspendedReason: before.suspendedReason,
            ...(data as Prisma.InstanceLicenseUncheckedCreateInput),
            features: (data.features as Prisma.InputJsonValue | undefined) ?? before.features,
        },
        update: data,
    });
    invalidateLicense();
    return { before, after: mergeLicense(row as unknown as Record<string, unknown>) };
}

export { DEFAULT_LICENSE };
