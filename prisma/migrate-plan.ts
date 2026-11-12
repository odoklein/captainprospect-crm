// What prisma/migrate-instance.ts does to a database, decided from three facts about it.
// Pure, so the rules that protect real databases are tested (migrate-plan.test.ts).

export type MigrationState = {
    /** "User" exists: the schema has been created (by Prisma, by hand, or by an earlier baseline). */
    hasUser: boolean;
    /** _prisma_migrations exists. */
    hasHistory: boolean;
    /** Names recorded as successfully applied. */
    applied: ReadonlySet<string>;
    /** Every migration directory in the image, any order. */
    all: readonly string[];
};

export type MigrationPlan =
    | { action: "refuse"; reason: string }
    | { action: "baseline"; recordFirst: string | null; push: boolean; record: string[] }
    | { action: "deploy" };

export function planMigration(s: MigrationState): MigrationPlan {
    if (s.hasUser && !s.hasHistory) {
        return {
            action: "refuse",
            reason:
                "The database has tables but no _prisma_migrations: it was managed by hand. Refusing to touch it. " +
                "Baseline it on purpose (prisma migrate resolve --applied <each migration>) or apply the SQL manually.",
        };
    }
    const oldestFirst = [...s.all].sort();
    // Baselining records NEWEST FIRST, so the oldest migration is the last one written:
    // "history exists but the oldest migration is missing" can only be an interrupted baseline.
    const interrupted = s.hasHistory && oldestFirst.length > 0 && !s.applied.has(oldestFirst[0]);
    if (s.hasUser && !interrupted) return { action: "deploy" };

    const newestFirst = [...oldestFirst].reverse();
    // The newest is recorded BEFORE the schema is pushed: that creates _prisma_migrations, so an
    // interruption later leaves a resumable state instead of "tables but no history".
    const recordFirst = !s.hasHistory && newestFirst.length ? newestFirst[0] : null;
    const already = new Set(s.applied);
    if (recordFirst) already.add(recordFirst);
    return { action: "baseline", recordFirst, push: !s.hasUser, record: newestFirst.filter((n) => !already.has(n)) };
}
