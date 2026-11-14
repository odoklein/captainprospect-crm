// ============================================
// NOUVEAUTÉS (server) — storage of what the Console pushes, per-user reading,
// and the manager's answer to an update offer. Rules live in ./resolve.
//
//   Console → PUT /api/instance/changelog        upsertEntry()
//   Console → GET /api/instance/changelog        consoleSummary()  (read rates + answers)
//   CRM UI  → GET /api/changelog                 feedFor(user)
//   CRM UI  → POST /api/changelog/seen           markSeen()
//   CRM UI  → POST /api/changelog/decision       decide()          (MANAGER)
// ============================================

import { Prisma, type InstanceChangelogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runtimeEnv } from "@/lib/runtime-config/env";
import {
    OFFER_ROLE,
    STAFF_ROLES,
    isBanner,
    isForRole,
    isLive,
    offerResetsDecision,
    offerState,
    resolveDecision,
    type ChangelogInput,
    type OfferState,
    type ReleaseNote,
} from "./resolve";

export function runningVersion(): string | null {
    return runtimeEnv("GIT_SHA") ?? null;
}

export function isChangelogTableMissing(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2010");
}

/** Insert or replace an entry. A different offered tag clears the previous answer. */
export async function upsertEntry(input: ChangelogInput): Promise<{ created: boolean }> {
    const existing = await prisma.instanceChangelogEntry.findUnique({
        where: { externalId: input.externalId },
        select: { offerTag: true },
    });

    const data = {
        kind: input.kind,
        category: input.category,
        severity: input.severity,
        title: input.title,
        body: input.body,
        notes: input.notes as unknown as Prisma.InputJsonValue,
        version: input.version,
        audience: input.audience,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
        ...(input.offer !== undefined
            ? {
                  offerTag: input.offer?.tag ?? null,
                  offerMigration: input.offer?.migration ?? false,
                  offerSecurity: input.offer?.security ?? false,
                  offerDeadline: input.offer?.deadline ?? null,
                  offerWindow: input.offer?.window ?? null,
              }
            : {}),
        ...(offerResetsDecision(existing?.offerTag ?? null, input.offer)
            ? { decision: null, decisionAt: null, postponedUntil: null, decidedById: null, decidedByName: null }
            : {}),
    };

    await prisma.instanceChangelogEntry.upsert({
        where: { externalId: input.externalId },
        create: { externalId: input.externalId, ...data },
        update: data,
    });
    return { created: !existing };
}

export async function deleteEntry(externalId: string): Promise<boolean> {
    const [, deleted] = await prisma.$transaction([
        prisma.instanceChangelogSeen.deleteMany({ where: { entryId: externalId } }),
        prisma.instanceChangelogEntry.deleteMany({ where: { externalId } }),
    ]);
    return deleted.count > 0;
}

async function countStaff(roles: string[]): Promise<number> {
    return prisma.user.count({ where: { isActive: true, role: { in: roles as never[] } } });
}

/** What the Console reads back: per entry, how many targeted users saw it and the manager's answer. */
export async function consoleSummary() {
    const entries = await prisma.instanceChangelogEntry.findMany({ orderBy: { publishedAt: "desc" }, take: 200 });
    const seen = await prisma.instanceChangelogSeen.groupBy({
        by: ["entryId"],
        _count: { _all: true },
        where: { entryId: { in: entries.map((e) => e.externalId) } },
    });
    const seenBy = new Map(seen.map((s) => [s.entryId, s._count._all]));
    const totals = new Map<string, number>();
    const totalFor = async (audience: string[]) => {
        const roles = audience.length ? audience : [...STAFF_ROLES];
        const key = [...roles].sort().join(",");
        if (!totals.has(key)) totals.set(key, await countStaff(roles));
        return totals.get(key)!;
    };
    const version = runningVersion();
    const now = new Date();

    return {
        version,
        entries: await Promise.all(
            entries.map(async (e) => ({
                externalId: e.externalId,
                kind: e.kind,
                version: e.version,
                seenUsers: seenBy.get(e.externalId) ?? 0,
                totalUsers: await totalFor(e.audience),
                offer: e.offerTag
                    ? {
                          tag: e.offerTag,
                          state: offerState(e, version, now),
                          decision: e.decision,
                          decisionAt: e.decisionAt?.toISOString() ?? null,
                          postponedUntil: e.postponedUntil?.toISOString() ?? null,
                          decidedBy: e.decidedByName,
                      }
                    : null,
            })),
        ),
    };
}

// ---------- what a user sees ----------

export type FeedEntry = {
    id: string;
    kind: "RELEASE" | "ANNOUNCEMENT";
    category: string | null;
    severity: string;
    title: string;
    body: string;
    notes: ReleaseNote[];
    version: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    publishedAt: string;
    endsAt: string | null;
    seen: boolean;
    banner: boolean;
};

export type FeedOffer = {
    id: string;
    tag: string;
    title: string;
    state: Exclude<OfferState, "none">;
    migration: boolean;
    security: boolean;
    deadline: string | null;
    window: string | null;
    decision: string | null;
    postponedUntil: string | null;
    decidedBy: string | null;
    canDecide: boolean;
};

function toFeed(e: InstanceChangelogEntry, seen: boolean, now: Date): FeedEntry {
    return {
        id: e.externalId,
        kind: e.kind as FeedEntry["kind"],
        category: e.category,
        severity: e.severity,
        title: e.title,
        body: e.body,
        notes: Array.isArray(e.notes) ? (e.notes as unknown as ReleaseNote[]) : [],
        version: e.version,
        ctaLabel: e.ctaLabel,
        ctaUrl: e.ctaUrl,
        publishedAt: e.publishedAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        seen,
        banner: isBanner(e, now),
    };
}

export async function feedFor(user: { id: string; role: string }) {
    const now = new Date();
    const rows = await prisma.instanceChangelogEntry.findMany({
        where: { publishedAt: { lte: now } },
        orderBy: { publishedAt: "desc" },
        take: 100,
    });
    const visible = rows.filter((e) => isForRole(e, user.role) && isLive(e, now));
    const seenRows = await prisma.instanceChangelogSeen.findMany({
        where: { userId: user.id, entryId: { in: visible.map((e) => e.externalId) } },
        select: { entryId: true },
    });
    const seen = new Set(seenRows.map((s) => s.entryId));

    // The newest pending offer, for managers only (others are told nothing: it is not their call).
    const version = runningVersion();
    let offer: FeedOffer | null = null;
    if (user.role === OFFER_ROLE) {
        for (const e of rows) {
            const state = offerState(e, version, now);
            if (state === "none" || !e.offerTag) continue;
            offer = {
                id: e.externalId,
                tag: e.offerTag,
                title: e.title,
                state,
                migration: e.offerMigration,
                security: e.offerSecurity,
                deadline: e.offerDeadline?.toISOString() ?? null,
                window: e.offerWindow,
                decision: e.decision,
                postponedUntil: e.postponedUntil?.toISOString() ?? null,
                decidedBy: e.decidedByName,
                canDecide: true,
            };
            break;
        }
    }

    const entries = visible.map((e) => toFeed(e, seen.has(e.externalId), now));
    return { entries, unseen: entries.filter((e) => !e.seen).length, offer, version };
}

export async function markSeen(userId: string, ids: string[]): Promise<number> {
    const clean = [...new Set(ids.filter((id) => typeof id === "string" && id.length <= 100))].slice(0, 100);
    if (!clean.length) return 0;
    const existing = await prisma.instanceChangelogEntry.findMany({ where: { externalId: { in: clean } }, select: { externalId: true } });
    const res = await prisma.instanceChangelogSeen.createMany({
        data: existing.map((e) => ({ entryId: e.externalId, userId })),
        skipDuplicates: true,
    });
    return res.count;
}

export type DecideResult = { ok: true; offer: FeedOffer | null } | { ok: false; status: number; error: string };

export async function decide(user: { id: string; name: string; role: string }, entryId: string, rawDecision: unknown): Promise<DecideResult> {
    if (user.role !== OFFER_ROLE) return { ok: false, status: 403, error: "Seul un manager peut répondre à une mise à jour" };
    const row = await prisma.instanceChangelogEntry.findUnique({ where: { externalId: entryId } });
    if (!row) return { ok: false, status: 404, error: "Mise à jour introuvable" };
    const now = new Date();
    if (offerState(row, runningVersion(), now) === "none") return { ok: false, status: 409, error: "Cette version est déjà installée" };
    const r = resolveDecision(row, rawDecision, now);
    if (!r.ok) return { ok: false, status: 422, error: r.error };
    await prisma.instanceChangelogEntry.update({
        where: { externalId: entryId },
        data: { decision: r.decision, decisionAt: now, postponedUntil: r.postponedUntil, decidedById: user.id, decidedByName: user.name },
    });
    const feed = await feedFor(user);
    return { ok: true, offer: feed.offer };
}
