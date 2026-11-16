// ============================================
// « NOUVEAUTÉS » — storage and reads.
//   upsertFromConsole / retractFromConsole   signed Console API
//   consoleStats                             how many people saw each entry (Console)
//   feedFor / markSeen / dismissBanner       the signed-in user's panel and banner
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audienceIncludes, isLive, wantsBanner, type ChangelogPayload } from "./contract";

export async function upsertFromConsole(p: ChangelogPayload): Promise<{ id: string; created: boolean }> {
    const data = {
        kind: p.kind === "release" ? "RELEASE" : "ANNOUNCEMENT",
        title: p.title,
        summary: p.summary ?? null,
        version: p.kind === "release" ? (p.version ?? null) : null,
        items: p.kind === "release" && p.items?.length ? (p.items as Prisma.InputJsonValue) : undefined,
        category: p.kind === "announcement" ? (p.category ?? "info") : null,
        severity: p.severity,
        audience: p.audience,
        ctaLabel: p.cta?.label ?? null,
        ctaUrl: p.cta?.url ?? null,
        startsAt: p.startsAt ?? null,
        endsAt: p.endsAt ?? null,
        publishedAt: p.publishedAt,
    };
    const existing = await prisma.changelogEntry.findUnique({ where: { externalId: p.externalId }, select: { id: true } });
    const row = await prisma.changelogEntry.upsert({
        where: { externalId: p.externalId },
        create: { externalId: p.externalId, ...data },
        update: { ...data, items: data.items ?? Prisma.DbNull },
        select: { id: true },
    });
    return { id: row.id, created: !existing };
}

export async function retractFromConsole(externalId: string): Promise<boolean> {
    const r = await prisma.changelogEntry.deleteMany({ where: { externalId } });
    return r.count > 0;
}

/** Who could see each entry and who did — the Console shows it on its delivery page. */
export async function consoleStats() {
    const [entries, users] = await Promise.all([
        prisma.changelogEntry.findMany({
            orderBy: { publishedAt: "desc" },
            take: 200,
            select: { externalId: true, kind: true, title: true, audience: true, publishedAt: true, _count: { select: { seen: true } } },
        }),
        prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
    ]);
    const audienceSize = (audience: string) =>
        users.filter((u) => audienceIncludes(audience, u.role)).reduce((sum, u) => sum + u._count._all, 0);
    return entries.map((e) => ({
        externalId: e.externalId,
        kind: e.kind === "RELEASE" ? "release" : "announcement",
        title: e.title,
        publishedAt: e.publishedAt.toISOString(),
        seen: e._count.seen,
        audienceSize: audienceSize(e.audience),
    }));
}

export type FeedItem = {
    id: string;
    kind: "release" | "announcement";
    title: string;
    summary: string | null;
    version: string | null;
    items: { type: string; title: string; body?: string | null; module?: string | null }[];
    category: string | null;
    severity: "info" | "warning";
    cta: { label: string; url: string } | null;
    startsAt: string | null;
    endsAt: string | null;
    publishedAt: string;
    seen: boolean;
    banner: boolean;
};

const FEED_LIMIT = 40;

export async function feedFor(user: { id: string; role: string }, now = new Date()): Promise<{ items: FeedItem[]; unread: number }> {
    const rows = await prisma.changelogEntry.findMany({
        where: {
            publishedAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        orderBy: { publishedAt: "desc" },
        take: FEED_LIMIT * 2,
        include: { seen: { where: { userId: user.id }, select: { seenAt: true, bannerDismissedAt: true } } },
    });
    const items = rows
        .filter((r) => audienceIncludes(r.audience, user.role) && isLive(r, now))
        .slice(0, FEED_LIMIT)
        .map((r): FeedItem => {
            const mine = r.seen[0];
            return {
                id: r.id,
                kind: r.kind === "RELEASE" ? "release" : "announcement",
                title: r.title,
                summary: r.summary,
                version: r.version,
                items: Array.isArray(r.items) ? (r.items as FeedItem["items"]) : [],
                category: r.category,
                severity: r.severity === "warning" ? "warning" : "info",
                cta: r.ctaLabel && r.ctaUrl ? { label: r.ctaLabel, url: r.ctaUrl } : null,
                startsAt: r.startsAt?.toISOString() ?? null,
                endsAt: r.endsAt?.toISOString() ?? null,
                publishedAt: r.publishedAt.toISOString(),
                seen: Boolean(mine),
                banner: wantsBanner(r, now) && !mine?.bannerDismissedAt,
            };
        });
    return { items, unread: items.filter((i) => !i.seen).length };
}

export async function markSeen(userId: string, entryIds: string[], opts: { banner?: boolean } = {}): Promise<number> {
    const ids = [...new Set(entryIds)].slice(0, FEED_LIMIT);
    if (!ids.length) return 0;
    const existing = await prisma.changelogEntry.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const now = new Date();
    await prisma.$transaction(
        existing.map((e) =>
            prisma.changelogSeen.upsert({
                where: { entryId_userId: { entryId: e.id, userId } },
                create: { entryId: e.id, userId, seenAt: now, bannerDismissedAt: opts.banner ? now : null },
                update: opts.banner ? { bannerDismissedAt: now } : {},
            }),
        ),
    );
    return existing.length;
}
