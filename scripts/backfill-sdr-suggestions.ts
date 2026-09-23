/**
 * Backfill: SDR suggestions that were only ever notifications.
 *
 * Until TC-0033, POST /api/sdr/suggestions created no Ticket — it only called
 * notifyAllManagers(). Those suggestions are visible in the manager Alertes
 * panel and nowhere else. This script rebuilds a PENDING ticket from each one
 * so it lands in the "À valider" queue of Support technique, and repoints the
 * notifications at the ticket it created.
 *
 * What cannot be recovered: the notification only stored the first 200 chars of
 * the description, and the requester as a display name. Truncated descriptions
 * are marked in the ticket; unresolvable requesters are skipped and listed.
 *
 *   npx tsx scripts/backfill-sdr-suggestions.ts           # dry run, writes nothing
 *   npx tsx scripts/backfill-sdr-suggestions.ts --apply   # actually creates them
 *
 * Reads DATABASE_URL — check you are pointed at the right database before
 * running with --apply.
 */
import { PrismaClient, type TicketCategory } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

const TITLE_PREFIX = "Suggestion SDR : ";

/** Marks a ticket as rebuilt from a notification, so re-runs can recognise it. */
const BACKFILL_MARKER = "<!-- backfilled-from-notification -->";

/** The labels the route wrote into the message, mapped back to a category. */
const LABEL_TO_CATEGORY: Record<string, TicketCategory> = {
    "Idée d'amélioration": "IMPROVEMENT",
    "Bug / Problème technique": "BUG",
    "Donnée manquante": "TECHNICAL_SUPPORT",
    "Autre suggestion": "TECHNICAL_SUPPORT",
};

/** `${sdrName} (${typeLabel}) :\n${description}` — the old message format. */
const MESSAGE_RE = /^(.*?) \(([^()]+)\) :\r?\n([\s\S]*)$/;

interface ParsedSuggestion {
    title: string;
    sdrName: string;
    typeLabel: string;
    description: string;
    createdAt: Date;
    notificationIds: string[];
    isUrgent: boolean;
}

async function main() {
    console.log(`\n🎫 Backfill des suggestions SDR ${APPLY ? "(APPLY)" : "(dry run)"}\n`);

    const notifications = await prisma.notification.findMany({
        where: { title: { startsWith: TITLE_PREFIX } },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, message: true, type: true, createdAt: true },
    });

    console.log(`${notifications.length} notification(s) "Suggestion SDR" en base.`);

    // notifyAllManagers writes one identical row per manager, so the same
    // suggestion appears N times. Title + message is the only stable identity:
    // createdAt differs by a few ms between recipients.
    const grouped = new Map<string, ParsedSuggestion>();
    const unparsable: string[] = [];
    let alreadyLinked = 0;

    for (const notification of notifications) {
        // Suggestions filed after the fix carry their ticket ref — nothing to do.
        if (/^#TC-\d+ · /.test(notification.message)) {
            alreadyLinked++;
            continue;
        }

        const match = MESSAGE_RE.exec(notification.message);
        if (!match) {
            unparsable.push(`${notification.id} · ${notification.title}`);
            continue;
        }

        const key = `${notification.title}\u0000${notification.message}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.notificationIds.push(notification.id);
            continue;
        }

        grouped.set(key, {
            title: notification.title.slice(TITLE_PREFIX.length).trim(),
            sdrName: match[1].trim(),
            typeLabel: match[2].trim(),
            description: match[3].trim(),
            createdAt: notification.createdAt,
            notificationIds: [notification.id],
            isUrgent: notification.type === "warning",
        });
    }

    console.log(`${grouped.size} suggestion(s) distincte(s) à traiter.`);
    if (alreadyLinked > 0) console.log(`${alreadyLinked} déjà rattachée(s) à un ticket — ignorée(s).`);
    if (unparsable.length > 0) {
        console.log(`\n⚠️  ${unparsable.length} message(s) au format inattendu, ignoré(s) :`);
        unparsable.forEach((line) => console.log(`   - ${line}`));
    }

    // Requesters are stored as a display name, so resolve against the teams that
    // are allowed to file — name first, then the email fallback the route used.
    const requesters = await prisma.user.findMany({
        where: { role: { in: ["SDR", "BUSINESS_DEVELOPER", "BOOKER"] } },
        select: { id: true, name: true, email: true },
    });
    const byName = new Map<string, string>();
    const byEmail = new Map<string, string>();
    for (const user of requesters) {
        if (user.name) byName.set(user.name.trim().toLowerCase(), user.id);
        if (user.email) byEmail.set(user.email.trim().toLowerCase(), user.id);
    }

    let created = 0;
    let skippedExisting = 0;
    const skippedNoRequester: string[] = [];

    for (const suggestion of grouped.values()) {
        const lookup = suggestion.sdrName.toLowerCase();
        const requesterId = byName.get(lookup) ?? byEmail.get(lookup);

        if (!requesterId) {
            skippedNoRequester.push(`"${suggestion.title}" — demandeur "${suggestion.sdrName}" introuvable`);
            continue;
        }

        const duplicate = await prisma.ticket.findFirst({
            where: { title: suggestion.title, requesterId },
            select: { id: true, number: true },
        });
        if (duplicate) {
            skippedExisting++;
            continue;
        }

        const category = LABEL_TO_CATEGORY[suggestion.typeLabel] ?? "TECHNICAL_SUPPORT";
        // 200 chars is exactly where notifyAllManagers cut it, so anything at
        // that length is almost certainly missing its tail.
        const wasTruncated = suggestion.description.length >= 199;
        const description = [
            `**${suggestion.typeLabel}**${suggestion.isUrgent ? " · signalé comme urgent par le demandeur" : ""}`,
            suggestion.description,
            wasTruncated
                ? "_(Reconstruit depuis une notification : la description d'origine a été tronquée. Demandez le détail au demandeur si besoin.)_"
                : "_(Reconstruit depuis une notification.)_",
            BACKFILL_MARKER,
        ].join("\n\n");

        if (!APPLY) {
            console.log(
                `   [dry] ${category.padEnd(18)} "${suggestion.title}" — ${suggestion.sdrName}` +
                    `${wasTruncated ? " (tronquée)" : ""}`,
            );
            created++;
            continue;
        }

        const ticket = await prisma.$transaction(async (tx) => {
            const ticketRow = await tx.ticket.create({
                data: {
                    title: suggestion.title,
                    description,
                    category,
                    scope: "INTERNAL",
                    affectedRoles: [],
                    requesterId,
                    validation: "PENDING",
                    // Keep the original filing date: a six-week-old suggestion
                    // must not surface as filed today in the "À valider" queue.
                    createdAt: suggestion.createdAt,
                },
                select: { id: true, number: true },
            });

            await tx.ticketHistory.create({
                data: {
                    ticketId: ticketRow.id,
                    userId: requesterId,
                    field: "created",
                    toValue: "PENDING_VALIDATION",
                },
            });

            // The alert now leads somewhere: same deep link as a fresh request.
            await tx.notification.updateMany({
                where: { id: { in: suggestion.notificationIds } },
                data: { link: `/manager/tickets?validation=PENDING&ticket=${ticketRow.id}` },
            });

            return ticketRow;
        });

        console.log(`   ✅ #TC-${String(ticket.number).padStart(4, "0")} "${suggestion.title}" — ${suggestion.sdrName}`);
        created++;
    }

    console.log("\n── Résumé ──────────────────────────────");
    console.log(`Tickets ${APPLY ? "créés" : "à créer"}      : ${created}`);
    console.log(`Déjà présents        : ${skippedExisting}`);
    console.log(`Demandeur introuvable: ${skippedNoRequester.length}`);
    skippedNoRequester.forEach((line) => console.log(`   - ${line}`));
    if (!APPLY && created > 0) {
        console.log("\nRien n'a été écrit. Relancez avec --apply pour créer ces tickets.");
    }

    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error("\n❌ Backfill interrompu :", error);
    await prisma.$disconnect();
    process.exit(1);
});
