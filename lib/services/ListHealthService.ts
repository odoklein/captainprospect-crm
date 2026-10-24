// ============================================
// LIST HEALTH SERVICE
// ============================================
//
// Computes Prospection Health metrics for lists entirely from the
// existing Action/Contact/Company data — no additional DB columns needed.
//
// Architecture:
//   computeRawMetrics()      → runs efficient SQL aggregation
//   computeHealthFromRaw()   → pure deterministic computation (fully testable)
//   computeListHealth()      → full ListHealthMetrics for a single list
//   computeBulkSummaries()   → lightweight summaries for the lists table
//   computeClientIntelligence() → cross-list aggregation for client view
//
// Performance notes:
//   • Single CTE query per call (avoids N+1)
//   • Bulk variant fetches all lists in one query
//   • Future: add ListHealthSnapshot table + BullMQ job for background refresh
//
// All SQL uses parameterised Prisma.sql to prevent injection.

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
    HEALTH_THRESHOLDS,
    type HealthStatus,
    type VelocityTrend,
    type ConfidenceLevel,
    type ActionResultBreakdown,
    type VelocityMetrics,
    type ETAPrediction,
    type ActionableHint,
    type SDRContribution,
    type ListHealthMetrics,
    type ListHealthSummary,
    type ClientListsIntelligence,
    type StagnationAlert,
    type RawListHealthRow,
    type HealthQueryOptions,
    type BulkHealthQueryOptions,
} from '@/lib/types/health';

// ============================================
// RESULT CATEGORY SETS
// ============================================

const POSITIVE_RESULTS = [
    'INTERESTED', 'CALLBACK_REQUESTED', 'MEETING_BOOKED', 'REPLIED',
    'PROJET_A_SUIVRE', 'RELANCE', 'RAPPEL',
];
const NEGATIVE_RESULTS = [
    'NOT_INTERESTED', 'REFUS', 'REFUS_ARGU', 'REFUS_CATEGORIQUE',
    'DISQUALIFIED', 'HORS_CIBLE',
];
const BAD_CONTACT_RESULTS = [
    'BAD_CONTACT', 'NUMERO_KO', 'FAUX_NUMERO', 'MAUVAIS_INTERLOCUTEUR', 'INVALIDE',
];

const STALE_LIST_LABEL: Record<HealthStatus, string> = {
    FULLY_PROSPECTED: 'Prospecté',
    IN_PROGRESS: 'En cours',
    AT_RISK: 'À risque',
    STALLED: 'Stagnante',
    INSUFFICIENT_DATA: 'Données insuffisantes',
};

// ============================================
// PURE COMPUTATION FUNCTIONS (testable, no DB)
// ============================================

/** Convert a BigInt DB value to a plain number */
function toNum(v: bigint | number | null | undefined): number {
    if (v == null) return 0;
    return typeof v === 'bigint' ? Number(v) : v;
}

/** Days elapsed since a given date */
function daysSince(date: Date | null): number | null {
    if (!date) return null;
    const ms = Date.now() - date.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function computeHealthStatus(params: {
    totalContacts: number;
    contactedContacts: number;
    totalActions: number;
    daysSinceLastAction: number | null;
}): { status: HealthStatus; explanation: string } {
    const { totalContacts, contactedContacts, totalActions, daysSinceLastAction } = params;

    if (totalContacts < HEALTH_THRESHOLDS.SPARSE_CONTACT_MIN) {
        return {
            status: 'INSUFFICIENT_DATA',
            explanation: `Seulement ${totalContacts} contact(s) dans cette liste. Un minimum de ${HEALTH_THRESHOLDS.SPARSE_CONTACT_MIN} contacts est requis pour un bilan fiable.`,
        };
    }

    if (totalActions === 0 || daysSinceLastAction === null) {
        return {
            status: 'STALLED',
            explanation: 'Aucune action n\'a jamais été enregistrée sur cette liste.',
        };
    }

    if (daysSinceLastAction > HEALTH_THRESHOLDS.STALLED_INACTIVITY_DAYS) {
        return {
            status: 'STALLED',
            explanation: `Dernière action il y a ${daysSinceLastAction} jours (seuil : ${HEALTH_THRESHOLDS.STALLED_INACTIVITY_DAYS} jours).`,
        };
    }

    const coverageRate = totalContacts > 0 ? (contactedContacts / totalContacts) * 100 : 0;

    if (coverageRate >= HEALTH_THRESHOLDS.FULLY_PROSPECTED_COVERAGE) {
        return {
            status: 'FULLY_PROSPECTED',
            explanation: `${coverageRate.toFixed(1)}% des contacts ont été contactés (seuil : ${HEALTH_THRESHOLDS.FULLY_PROSPECTED_COVERAGE}%).`,
        };
    }

    if (
        daysSinceLastAction > HEALTH_THRESHOLDS.AT_RISK_INACTIVITY_DAYS &&
        coverageRate < HEALTH_THRESHOLDS.AT_RISK_COVERAGE_MAX
    ) {
        return {
            status: 'AT_RISK',
            explanation: `Couverture faible (${coverageRate.toFixed(1)}%) et inactive depuis ${daysSinceLastAction} jours.`,
        };
    }

    return {
        status: 'IN_PROGRESS',
        explanation: `Prospection en cours — ${coverageRate.toFixed(1)}% de couverture, dernière activité il y a ${daysSinceLastAction} jour(s).`,
    };
}

export function computeVelocityTrend(params: {
    actionsPerDay7d: number;
    actionsPerDay30d: number;
}): { trend: VelocityTrend; explanation: string } {
    const { actionsPerDay7d, actionsPerDay30d } = params;

    if (actionsPerDay30d === 0 && actionsPerDay7d === 0) {
        return { trend: 'UNKNOWN', explanation: 'Aucune activité sur les 30 derniers jours.' };
    }

    if (actionsPerDay30d === 0) {
        return {
            trend: 'RISING',
            explanation: `Nouvelle activité détectée : ${actionsPerDay7d.toFixed(1)} action(s)/jour cette semaine.`,
        };
    }

    const ratio = actionsPerDay7d / actionsPerDay30d;

    if (ratio >= 1 + HEALTH_THRESHOLDS.VELOCITY_RISING_THRESHOLD) {
        const pct = Math.round((ratio - 1) * 100);
        return {
            trend: 'RISING',
            explanation: `Cadence en hausse : +${pct}% vs moyenne 30 jours (${actionsPerDay30d.toFixed(1)} → ${actionsPerDay7d.toFixed(1)} actions/jour).`,
        };
    }

    if (ratio <= 1 + HEALTH_THRESHOLDS.VELOCITY_DECLINING_THRESHOLD) {
        const pct = Math.round(Math.abs(ratio - 1) * 100);
        return {
            trend: 'DECLINING',
            explanation: `Cadence en baisse : -${pct}% vs moyenne 30 jours (${actionsPerDay30d.toFixed(1)} → ${actionsPerDay7d.toFixed(1)} actions/jour).`,
        };
    }

    return {
        trend: 'STABLE',
        explanation: `Cadence stable : ${actionsPerDay7d.toFixed(1)} action(s)/jour cette semaine vs ${actionsPerDay30d.toFixed(1)} en moyenne sur 30 jours.`,
    };
}

export function computeETAPrediction(params: {
    totalContacts: number;
    contactedContacts: number;
    newContactsPerDay7d: number;
    newContactsPerDay30d: number;
    totalActions: number;
    isNewList: boolean;
}): ETAPrediction {
    const { totalContacts, contactedContacts, newContactsPerDay7d, newContactsPerDay30d, totalActions, isNewList } = params;
    const remainingContacts = Math.max(0, totalContacts - contactedContacts);

    // Cannot predict if remaining is 0
    if (remainingContacts === 0) {
        return {
            etaDays: 0,
            etaDate: new Date().toISOString(),
            remainingContacts: 0,
            confidence: 'HIGH',
            confidenceExplanation: 'Tous les contacts ont déjà été prospectés.',
        };
    }

    // Determine confidence level
    const determineConfidence = (): { confidence: ConfidenceLevel; explanation: string } => {
        if (totalActions < HEALTH_THRESHOLDS.SPARSE_ACTION_MIN || newContactsPerDay7d === 0) {
            return {
                confidence: 'INSUFFICIENT',
                explanation: `Données insuffisantes : ${totalActions} action(s) enregistrée(s), cadence actuelle = 0 contact/jour.`,
            };
        }
        if (isNewList) {
            return {
                confidence: 'LOW',
                explanation: 'Liste récente — l\'historique est trop court pour une prédiction fiable.',
            };
        }
        if (totalActions < 10 || newContactsPerDay7d < 1) {
            return {
                confidence: 'LOW',
                explanation: `Cadence faible (${newContactsPerDay7d.toFixed(2)} contact(s)/jour) sur peu d\'actions (${totalActions}).`,
            };
        }
        // Consistency check: is recent velocity close to the 30d average?
        const consistencyRatio = newContactsPerDay30d > 0
            ? newContactsPerDay7d / newContactsPerDay30d
            : 0;

        if (totalActions >= 20 && consistencyRatio >= 0.7 && consistencyRatio <= 1.5) {
            return {
                confidence: 'HIGH',
                explanation: `Cadence régulière et données suffisantes : ${newContactsPerDay7d.toFixed(1)} contact(s)/jour (cohérent avec la moyenne 30j).`,
            };
        }
        return {
            confidence: 'MEDIUM',
            explanation: `Cadence modérée ou variable : ${newContactsPerDay7d.toFixed(1)} contact(s)/jour (7j) vs ${newContactsPerDay30d.toFixed(1)} (30j).`,
        };
    };

    const { confidence, explanation } = determineConfidence();

    if (newContactsPerDay7d <= 0) {
        return {
            etaDays: null,
            etaDate: null,
            remainingContacts,
            confidence,
            confidenceExplanation: explanation,
        };
    }

    const etaDays = Math.ceil(remainingContacts / newContactsPerDay7d);
    const etaDate = new Date(Date.now() + etaDays * 24 * 60 * 60 * 1000).toISOString();

    return {
        etaDays,
        etaDate,
        remainingContacts,
        confidence,
        confidenceExplanation: explanation,
    };
}

export function computeActivityScore(params: {
    coverageRate: number | null;
    totalContacts: number;
    actions7d: number;
    positiveRate: number | null;
    trend: VelocityTrend;
    hasSparseData: boolean;
}): { score: number; explanation: string } {
    const { coverageRate, totalContacts, actions7d, positiveRate, trend, hasSparseData } = params;

    if (hasSparseData || totalContacts === 0) {
        return {
            score: 0,
            explanation: 'Score non calculable — données insuffisantes.',
        };
    }

    // Component 1: coverage (40%)
    const coverageComponent = (coverageRate ?? 0) * 0.4;

    // Component 2: recent activity intensity (20%)
    // "Intensity" = how many actions per contact in the last 7 days
    // Target: at least 5% of contacts actioned per day
    const activityTarget = Math.max(totalContacts * 0.05, 1);
    const recentActivityRate = Math.min((actions7d / activityTarget) * 100, 100);
    const recentActivityComponent = recentActivityRate * 0.2;

    // Component 3: positive outcome rate (20%)
    const positiveComponent = (positiveRate ?? 0) * 0.2;

    // Component 4: velocity trend (20%)
    const trendScore = trend === 'RISING' ? 100 : trend === 'STABLE' ? 50 : trend === 'DECLINING' ? 10 : 0;
    const trendComponent = trendScore * 0.2;

    const score = Math.round(coverageComponent + recentActivityComponent + positiveComponent + trendComponent);
    const capped = Math.max(0, Math.min(100, score));

    const parts = [
        `Couverture : ${(coverageRate ?? 0).toFixed(0)}% × 40% = ${coverageComponent.toFixed(0)}pts`,
        `Activité récente : ${recentActivityRate.toFixed(0)}% × 20% = ${recentActivityComponent.toFixed(0)}pts`,
        `Taux positif : ${(positiveRate ?? 0).toFixed(0)}% × 20% = ${positiveComponent.toFixed(0)}pts`,
        `Tendance (${trend}) : ${trendScore}pts × 20% = ${trendComponent.toFixed(0)}pts`,
    ];

    return {
        score: capped,
        explanation: `Score = ${parts.join(' | ')} → Total = ${capped}/100`,
    };
}

export function generateHints(params: {
    status: HealthStatus;
    coverageRate: number | null;
    badContactRate: number | null;
    meetingRate: number | null;
    positiveRate: number | null;
    daysSinceLastAction: number | null;
    trend: VelocityTrend;
    actionsPerDay7d: number;
    actionsPerDay30d: number;
    totalContacts: number;
    contactedContacts: number;
    uniqueSdrCount: number;
    hasSparseData: boolean;
    isNewList: boolean;
}): ActionableHint[] {
    const hints: ActionableHint[] = [];

    if (params.isNewList) {
        hints.push({
            type: 'INFO',
            message: 'Liste récente — les prédictions seront fiables après quelques jours d\'activité.',
        });
        return hints;
    }

    if (params.hasSparseData) {
        hints.push({
            type: 'INFO',
            message: 'Données insuffisantes pour des métriques fiables. Commencez à prospecter pour débloquer les indicateurs.',
        });
        return hints;
    }

    // Stalled list
    if (params.status === 'STALLED' && params.daysSinceLastAction !== null) {
        hints.push({
            type: 'CRITICAL',
            message: `Aucune activité depuis ${params.daysSinceLastAction} jours.`,
            detail: 'Réassignez cette liste à un SDR ou archivez-la si elle est épuisée.',
        });
    }

    // At-risk
    if (params.status === 'AT_RISK') {
        hints.push({
            type: 'WARNING',
            message: `Seulement ${(params.coverageRate ?? 0).toFixed(0)}% de couverture et inactivité depuis ${params.daysSinceLastAction} jours.`,
            detail: 'Augmentez la cadence ou affectez un SDR supplémentaire.',
        });
    }

    // Bad contact rate too high
    if (params.badContactRate !== null && params.badContactRate > HEALTH_THRESHOLDS.BAD_CONTACT_HINT_THRESHOLD * 100) {
        hints.push({
            type: 'WARNING',
            message: `${params.badContactRate.toFixed(0)}% de contacts invalides (numéros KO, mauvais interlocuteurs…).`,
            detail: 'Vérifiez la qualité des données de la liste. Un taux élevé réduit le ROI de la prospection.',
        });
    }

    // Declining velocity
    if (params.trend === 'DECLINING') {
        const drop = params.actionsPerDay30d > 0
            ? Math.round((1 - params.actionsPerDay7d / params.actionsPerDay30d) * 100)
            : 0;
        hints.push({
            type: 'WARNING',
            message: `Cadence en baisse de ${drop}% cette semaine vs la moyenne mensuelle.`,
            detail: `${params.actionsPerDay7d.toFixed(1)} action(s)/jour (7j) vs ${params.actionsPerDay30d.toFixed(1)} action(s)/jour (30j).`,
        });
    }

    // Rising velocity — celebrate
    if (params.trend === 'RISING' && params.actionsPerDay7d > 2) {
        hints.push({
            type: 'POSITIVE',
            message: 'Cadence en hausse cette semaine — bonne dynamique !',
        });
    }

    // Good meeting rate
    if (params.meetingRate !== null && params.meetingRate >= 5) {
        hints.push({
            type: 'POSITIVE',
            message: `Excellent taux de RDV : ${params.meetingRate.toFixed(1)}% des actions ont abouti à un rendez-vous.`,
        });
    }

    // High coverage — near done
    if (params.coverageRate !== null && params.coverageRate >= 60 && params.coverageRate < 80) {
        hints.push({
            type: 'INFO',
            message: `${params.coverageRate.toFixed(0)}% des contacts ont été traités — presque terminé !`,
            detail: `Il reste ${params.totalContacts - params.contactedContacts} contact(s) à prospecter.`,
        });
    }

    // Only one SDR on a large list
    if (params.uniqueSdrCount === 1 && params.totalContacts > 100) {
        hints.push({
            type: 'INFO',
            message: 'Un seul SDR affecté à cette liste volumineuse.',
            detail: 'Envisagez d\'assigner un SDR supplémentaire pour accélérer la prospection.',
        });
    }

    // No coverage at all but recent activity
    if (params.coverageRate !== null && params.coverageRate < 5 && params.daysSinceLastAction !== null && params.daysSinceLastAction <= 3) {
        hints.push({
            type: 'INFO',
            message: 'Liste tout juste démarrée — continuez sur cette lancée.',
        });
    }

    return hints;
}

// ============================================
// RAW DB QUERY
// ============================================

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Health aggregation for a set of lists, as one parameterised query.
 *
 * The scan starts from the lists' members, never from the whole Action table:
 *   • contact actions — list contacts ⋈ Action on "contactId"
 *   • company actions — list companies ⋈ Action on "companyId", no contact
 * so Postgres walks the (contactId, createdAt) / (companyId, createdAt) indexes.
 * An action that names a contact belongs to that contact's list only.
 *
 * Actions are rolled up per contact/company first (first & last touch, counts
 * per result family), then per list. "New contacts" over 7 / 30 days are the
 * contacts whose FIRST action falls in the window — re-calls don't count, so
 * the ETA pace isn't inflated.
 *
 * Pure: `now` is a parameter, nothing reads the clock.
 */
export function bulkHealthSql(listIds: string[], sdrIds: string[], now: Date): Prisma.Sql {
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const since30d = new Date(now.getTime() - 30 * DAY_MS);

    const sdrFilter = sdrIds.length > 0
        ? Prisma.sql`AND a."sdrId" IN (${Prisma.join(sdrIds)})`
        : Prisma.empty;

    const positiveList = Prisma.join(POSITIVE_RESULTS);
    const badContactList = Prisma.join(BAD_CONTACT_RESULTS);
    const negativeList = Prisma.join(NEGATIVE_RESULTS);
    const listIdList = Prisma.join(listIds);

    return Prisma.sql`
        WITH target_lists AS (
            SELECT id AS list_id FROM "List" WHERE id IN (${listIdList})
        ),
        list_companies AS (
            SELECT id, "listId" AS list_id
            FROM "Company"
            WHERE "listId" IN (${listIdList})
        ),
        list_contacts AS (
            SELECT c.id, c."companyId" AS company_id, co.list_id
            FROM "Contact" c
            INNER JOIN list_companies co ON c."companyId" = co.id
        ),
        contact_counts AS (
            SELECT list_id, COUNT(*) AS total_contacts
            FROM list_contacts
            GROUP BY list_id
        ),
        company_counts AS (
            SELECT list_id, COUNT(*) AS total_companies
            FROM list_companies
            GROUP BY list_id
        ),
        member_actions AS (
            SELECT
                lc.list_id,
                TRUE                    AS is_contact,
                lc.id                   AS entity_id,
                lc.company_id,
                a."sdrId",
                a."createdAt",
                CAST(a.result AS TEXT)  AS result
            FROM list_contacts lc
            INNER JOIN "Action" a ON a."contactId" = lc.id
            WHERE TRUE ${sdrFilter}
            UNION ALL
            SELECT
                co.list_id,
                FALSE                   AS is_contact,
                co.id                   AS entity_id,
                co.id                   AS company_id,
                a."sdrId",
                a."createdAt",
                CAST(a.result AS TEXT)  AS result
            FROM list_companies co
            INNER JOIN "Action" a ON a."companyId" = co.id AND a."contactId" IS NULL
            WHERE TRUE ${sdrFilter}
        ),
        entity_agg AS (
            SELECT
                list_id,
                is_contact,
                entity_id,
                company_id,
                COUNT(*)                                                            AS n,
                COUNT(*) FILTER (WHERE "createdAt" >= ${since7d})                   AS n_7d,
                COUNT(*) FILTER (WHERE "createdAt" >= ${since30d})                  AS n_30d,
                MIN("createdAt")                                                    AS first_at,
                MAX("createdAt")                                                    AS last_at,
                COUNT(*) FILTER (WHERE result IN (${positiveList}))                 AS positive_count,
                COUNT(*) FILTER (WHERE result = 'MEETING_BOOKED')                   AS meetings_count,
                COUNT(*) FILTER (WHERE result IN (${badContactList}))               AS bad_contact_count,
                COUNT(*) FILTER (WHERE result IN (${negativeList}))                 AS negative_count,
                COUNT(*) FILTER (
                    WHERE result NOT IN (${positiveList})
                    AND result NOT IN (${badContactList})
                    AND result NOT IN (${negativeList})
                )                                                                   AS neutral_count
            FROM member_actions
            GROUP BY list_id, is_contact, entity_id, company_id
        ),
        list_agg AS (
            SELECT
                list_id,
                SUM(n)                                                              AS total_actions,
                SUM(n_7d)                                                           AS actions_7d,
                SUM(n_30d)                                                          AS actions_30d,
                MAX(last_at)                                                        AS last_action_at,
                COUNT(*) FILTER (WHERE is_contact)                                  AS contacted_contacts,
                COUNT(DISTINCT company_id)                                          AS contacted_companies,
                COUNT(*) FILTER (WHERE is_contact AND first_at >= ${since7d})       AS new_contacts_7d,
                COUNT(*) FILTER (WHERE is_contact AND first_at >= ${since30d})      AS new_contacts_30d,
                SUM(positive_count)                                                 AS positive_count,
                SUM(meetings_count)                                                 AS meetings_count,
                SUM(bad_contact_count)                                              AS bad_contact_count,
                SUM(negative_count)                                                 AS negative_count,
                SUM(neutral_count)                                                  AS neutral_count
            FROM entity_agg
            GROUP BY list_id
        ),
        sdr_agg AS (
            SELECT list_id, COUNT(DISTINCT "sdrId") AS unique_sdrs
            FROM member_actions
            GROUP BY list_id
        )
        SELECT
            tl.list_id,
            COALESCE(cc.total_contacts, 0)                  AS total_contacts,
            COALESCE(co2.total_companies, 0)                AS total_companies,
            COALESCE(la.total_actions, 0)::bigint           AS total_actions,
            COALESCE(la.actions_7d, 0)::bigint              AS actions_7d,
            COALESCE(la.actions_30d, 0)::bigint             AS actions_30d,
            la.last_action_at                               AS last_action_at,
            COALESCE(sa.unique_sdrs, 0)                     AS unique_sdrs,
            COALESCE(la.contacted_contacts, 0)              AS contacted_contacts,
            COALESCE(la.contacted_companies, 0)             AS contacted_companies,
            COALESCE(la.new_contacts_7d, 0)                 AS new_contacts_7d,
            COALESCE(la.new_contacts_30d, 0)                AS new_contacts_30d,
            COALESCE(la.positive_count, 0)::bigint          AS positive_count,
            COALESCE(la.meetings_count, 0)::bigint          AS meetings_count,
            COALESCE(la.bad_contact_count, 0)::bigint       AS bad_contact_count,
            COALESCE(la.negative_count, 0)::bigint          AS negative_count,
            COALESCE(la.neutral_count, 0)::bigint           AS neutral_count
        FROM target_lists tl
        LEFT JOIN contact_counts cc ON tl.list_id = cc.list_id
        LEFT JOIN company_counts co2 ON tl.list_id = co2.list_id
        LEFT JOIN list_agg la ON tl.list_id = la.list_id
        LEFT JOIN sdr_agg sa ON tl.list_id = sa.list_id
    `;
}

/** Single list — same query as the bulk one, so the detail view and the table agree. */
async function fetchRawMetrics(
    listId: string,
    options: HealthQueryOptions = {}
): Promise<RawListHealthRow | null> {
    const rows = await prisma.$queryRaw<RawListHealthRow[]>(
        bulkHealthSql([listId], options.sdrIds ?? [], new Date())
    );
    return rows[0] ?? null;
}

// ============================================
// BULK RAW DB QUERY (multiple lists at once)
// ============================================

async function fetchBulkRawMetrics(
    listIds: string[],
    options: HealthQueryOptions = {}
): Promise<Map<string, RawListHealthRow>> {
    if (listIds.length === 0) return new Map();

    const rows = await prisma.$queryRaw<RawListHealthRow[]>(
        bulkHealthSql(listIds, options.sdrIds ?? [], new Date())
    );

    const map = new Map<string, RawListHealthRow>();
    for (const row of rows) {
        map.set(row.list_id, row);
    }
    return map;
}

// ============================================
// SDR BREAKDOWN QUERY
// ============================================

async function fetchSDRBreakdown(listId: string, limit = 5): Promise<SDRContribution[]> {
    const rows = await prisma.$queryRaw<{
        sdr_id: string;
        sdr_name: string;
        action_count: bigint;
        contacts_reached: bigint;
        meetings_booked: bigint;
    }[]>`
        WITH list_companies AS (
            SELECT id FROM "Company" WHERE "listId" = ${listId}
        ),
        list_contacts AS (
            SELECT c.id FROM "Contact" c
            INNER JOIN list_companies co ON c."companyId" = co.id
        ),
        sdr_stats AS (
            SELECT
                a."sdrId",
                COUNT(*) AS action_count,
                COUNT(DISTINCT a."contactId") FILTER (WHERE a."contactId" IS NOT NULL) AS contacts_reached,
                COUNT(*) FILTER (WHERE CAST(a.result AS TEXT) = 'MEETING_BOOKED') AS meetings_booked
            FROM "Action" a
            WHERE (
                a."contactId" IN (SELECT id FROM list_contacts)
                OR a."companyId" IN (SELECT id FROM list_companies)
            )
            GROUP BY a."sdrId"
            ORDER BY action_count DESC
            LIMIT ${limit}
        )
        SELECT
            ss."sdrId" AS sdr_id,
            u.name AS sdr_name,
            ss.action_count,
            ss.contacts_reached,
            ss.meetings_booked
        FROM sdr_stats ss
        INNER JOIN "User" u ON u.id = ss."sdrId"
    `;

    return rows.map(r => ({
        sdrId: r.sdr_id,
        sdrName: r.sdr_name,
        actionCount: toNum(r.action_count),
        contactsReached: toNum(r.contacts_reached),
        meetingsBooked: toNum(r.meetings_booked),
    }));
}

// ============================================
// CORE COMPUTATION FROM RAW ROW
// ============================================

function buildHealthFromRow(
    row: RawListHealthRow,
    meta: { listId: string; listName: string; createdAt: Date },
    topSdrs: SDRContribution[] = []
): ListHealthMetrics {
    const now = new Date();
    const totalContacts = toNum(row.total_contacts);
    const totalCompanies = toNum(row.total_companies);
    const totalTargets = totalContacts + totalCompanies;
    const totalActions = toNum(row.total_actions);
    const actions7d = toNum(row.actions_7d);
    const actions30d = toNum(row.actions_30d);
    const contactedContacts = toNum(row.contacted_contacts);
    const contactedCompanies = toNum(row.contacted_companies);
    const contactedTargets = contactedContacts + contactedCompanies;
    const newContacts7d = toNum(row.new_contacts_7d);
    const newContacts30d = toNum(row.new_contacts_30d);
    const positiveCount = toNum(row.positive_count);
    const meetingsCount = toNum(row.meetings_count);
    const badContactCount = toNum(row.bad_contact_count);
    const negativeCount = toNum(row.negative_count);
    const neutralCount = toNum(row.neutral_count);
    const uniqueSdrCount = toNum(row.unique_sdrs);

    const daysSinceLastActionVal = daysSince(row.last_action_at ?? null);

    const isNewList = (now.getTime() - meta.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        < HEALTH_THRESHOLDS.NEW_LIST_DAYS;

    const hasSparseData =
        totalTargets < HEALTH_THRESHOLDS.SPARSE_CONTACT_MIN ||
        totalActions < HEALTH_THRESHOLDS.SPARSE_ACTION_MIN;

    // Rates
    const coverageRate = totalTargets > 0 ? (contactedTargets / totalTargets) * 100 : null;
    const positiveRate = totalActions > 0 ? (positiveCount / totalActions) * 100 : null;
    const badContactRate = totalActions > 0 ? (badContactCount / totalActions) * 100 : null;
    const meetingRate = totalActions > 0 ? (meetingsCount / totalActions) * 100 : null;

    const resultBreakdown: ActionResultBreakdown = {
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
        badContact: badContactCount,
        meetings: meetingsCount,
    };

    // Velocity
    const actionsPerDay7d = actions7d / 7;
    const actionsPerDay30d = actions30d / 30;
    const newContactsPerDay7d = newContacts7d / 7;
    const newContactsPerDay30d = newContacts30d / 30;

    const { trend, explanation: trendExplanation } = computeVelocityTrend({
        actionsPerDay7d,
        actionsPerDay30d,
    });

    const velocity: VelocityMetrics = {
        actionsPerDay7d,
        actionsPerDay30d,
        newContactsPerDay7d,
        newContactsPerDay30d,
        trend,
        trendExplanation,
    };

    // Health status
    const { status, explanation: statusExplanation } = computeHealthStatus({
        totalContacts: totalTargets,
        contactedContacts: contactedTargets,
        totalActions,
        daysSinceLastAction: daysSinceLastActionVal,
    });

    // Activity score
    const { score: activityScore, explanation: activityScoreExplanation } = computeActivityScore({
        coverageRate,
        totalContacts: totalTargets,
        actions7d,
        positiveRate,
        trend,
        hasSparseData,
    });

    // ETA prediction
    const eta = computeETAPrediction({
        totalContacts: totalTargets,
        contactedContacts: contactedTargets,
        newContactsPerDay7d,
        newContactsPerDay30d,
        totalActions,
        isNewList,
    });

    // Hints
    const hints = generateHints({
        status,
        coverageRate,
        badContactRate,
        meetingRate,
        positiveRate,
        daysSinceLastAction: daysSinceLastActionVal,
        trend,
        actionsPerDay7d,
        actionsPerDay30d,
        totalContacts: totalTargets,
        contactedContacts: contactedTargets,
        uniqueSdrCount,
        hasSparseData,
        isNewList,
    });

    return {
        listId: meta.listId,
        listName: meta.listName,
        computedAt: now.toISOString(),
        totalContacts,
        totalCompanies,
        totalTargets,
        contactedContacts,
        contactedCompanies,
        contactedTargets,
        coverageRate,
        totalActions,
        actions7d,
        actions30d,
        daysSinceLastAction: daysSinceLastActionVal,
        lastActionAt: row.last_action_at ? row.last_action_at.toISOString() : null,
        resultBreakdown,
        positiveRate,
        badContactRate,
        meetingRate,
        velocity,
        eta,
        activityScore,
        activityScoreExplanation,
        status,
        statusLabel: STALE_LIST_LABEL[status],
        statusExplanation,
        topSdrs,
        uniqueSdrCount,
        hints,
        isNewList,
        hasSparseData,
    };
}

function buildSummaryFromMetrics(
    metrics: ListHealthMetrics,
    listMeta: { missionId: string; missionName: string; clientId: string; clientName: string }
): ListHealthSummary {
    return {
        listId: metrics.listId,
        listName: metrics.listName,
        missionId: listMeta.missionId,
        missionName: listMeta.missionName,
        clientId: listMeta.clientId,
        clientName: listMeta.clientName,
        status: metrics.status,
        statusLabel: metrics.statusLabel,
        coverageRate: metrics.coverageRate,
        activityScore: metrics.activityScore,
        totalContacts: metrics.totalContacts,
        totalCompanies: metrics.totalCompanies,
        totalTargets: metrics.totalTargets,
        contactedContacts: metrics.contactedContacts,
        contactedCompanies: metrics.contactedCompanies,
        contactedTargets: metrics.contactedTargets,
        actions7d: metrics.actions7d,
        daysSinceLastAction: metrics.daysSinceLastAction,
        velocity: {
            trend: metrics.velocity.trend,
            actionsPerDay7d: metrics.velocity.actionsPerDay7d,
            trendExplanation: metrics.velocity.trendExplanation,
        },
        eta: {
            etaDays: metrics.eta.etaDays,
            etaDate: metrics.eta.etaDate,
            confidence: metrics.eta.confidence,
        },
        hints: metrics.hints,
        hasSparseData: metrics.hasSparseData,
        isNewList: metrics.isNewList,
    };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Full health metrics for a single list.
 * Includes SDR breakdown and detailed explanations.
 */
export async function computeListHealth(
    listId: string,
    options: HealthQueryOptions = {}
): Promise<ListHealthMetrics | null> {
    const list = await prisma.list.findUnique({
        where: { id: listId },
        select: { id: true, name: true, createdAt: true },
    });
    if (!list) return null;

    const [row, topSdrs] = await Promise.all([
        fetchRawMetrics(listId, options),
        fetchSDRBreakdown(listId),
    ]);

    // If no row returned (empty list), build metrics with zero row
    const safeRow: RawListHealthRow = row ?? {
        list_id: listId,
        total_contacts: BigInt(0),
        total_companies: BigInt(0),
        total_actions: BigInt(0),
        actions_7d: BigInt(0),
        actions_30d: BigInt(0),
        last_action_at: null,
        unique_sdrs: BigInt(0),
        contacted_contacts: BigInt(0),
        contacted_companies: BigInt(0),
        new_contacts_7d: BigInt(0),
        new_contacts_30d: BigInt(0),
        positive_count: BigInt(0),
        meetings_count: BigInt(0),
        bad_contact_count: BigInt(0),
        negative_count: BigInt(0),
        neutral_count: BigInt(0),
    };

    return buildHealthFromRow(safeRow, { listId: list.id, listName: list.name, createdAt: list.createdAt }, topSdrs);
}

/**
 * Lightweight health summaries for all lists matching the filter.
 * Uses a single efficient bulk SQL query — safe to use on the lists page.
 */
export async function computeBulkHealthSummaries(
    options: BulkHealthQueryOptions = {}
): Promise<ListHealthSummary[]> {
    const { missionId, clientId, listIds: explicitListIds, includeArchived = false } = options;

    // Fetch list metadata
    const lists = await prisma.list.findMany({
        where: {
            ...(missionId && { missionId }),
            ...(clientId && { mission: { clientId } }),
            ...(explicitListIds && { id: { in: explicitListIds } }),
            ...(!includeArchived && { isArchived: false }),
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            mission: {
                select: {
                    id: true,
                    name: true,
                    clientId: true,
                    client: { select: { id: true, name: true } },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (lists.length === 0) return [];

    const listIdList = lists.map(l => l.id);
    const rawMap = await fetchBulkRawMetrics(listIdList, options);

    const now = new Date();
    const summaries: ListHealthSummary[] = [];

    for (const list of lists) {
        const row = rawMap.get(list.id) ?? {
            list_id: list.id,
            total_contacts: BigInt(0),
            total_companies: BigInt(0),
            total_actions: BigInt(0),
            actions_7d: BigInt(0),
            actions_30d: BigInt(0),
            last_action_at: null,
            unique_sdrs: BigInt(0),
            contacted_contacts: BigInt(0),
            contacted_companies: BigInt(0),
            new_contacts_7d: BigInt(0),
            new_contacts_30d: BigInt(0),
            positive_count: BigInt(0),
            meetings_count: BigInt(0),
            bad_contact_count: BigInt(0),
            negative_count: BigInt(0),
            neutral_count: BigInt(0),
        };

        const metrics = buildHealthFromRow(row, {
            listId: list.id,
            listName: list.name,
            createdAt: list.createdAt,
        });

        summaries.push(buildSummaryFromMetrics(metrics, {
            missionId: list.mission.id,
            missionName: list.mission.name,
            clientId: list.mission.client.id,
            clientName: list.mission.client.name,
        }));
    }

    return summaries;
}

/**
 * Client-level intelligence: cross-list aggregation, rankings, stagnation alerts.
 */
export async function computeClientListsIntelligence(
    clientId: string,
    options: HealthQueryOptions = {}
): Promise<ClientListsIntelligence | null> {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true },
    });
    if (!client) return null;

    const now = new Date();
    const fromDate = options.from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = options.to ?? now;

    const summaries = await computeBulkHealthSummaries({
        clientId,
        ...options,
        includeArchived: false,
    });

    // Status counts
    const statusCounts = {
        fullyProspectedCount: 0,
        inProgressCount: 0,
        atRiskCount: 0,
        stalledCount: 0,
        insufficientDataCount: 0,
    };

    let totalContacts = 0;
    let totalCompanies = 0;
    let totalTargets = 0;
    let totalContactedContacts = 0;
    let totalContactedCompanies = 0;
    let totalContactedTargets = 0;
    let totalActions = 0;
    let totalActions7d = 0;
    let totalMeetings = 0;

    for (const s of summaries) {
        totalContacts += s.totalContacts;
        totalCompanies += s.totalCompanies;
        totalTargets += s.totalTargets;
        totalContactedContacts += s.contactedContacts;
        totalContactedCompanies += s.contactedCompanies;
        totalContactedTargets += s.contactedTargets;
        totalActions7d += s.actions7d;

        switch (s.status) {
            case 'FULLY_PROSPECTED': statusCounts.fullyProspectedCount++; break;
            case 'IN_PROGRESS': statusCounts.inProgressCount++; break;
            case 'AT_RISK': statusCounts.atRiskCount++; break;
            case 'STALLED': statusCounts.stalledCount++; break;
            case 'INSUFFICIENT_DATA': statusCounts.insufficientDataCount++; break;
        }
    }

    // Fetch total actions + meetings in the date range for this client
    const clientActionStats = await prisma.$queryRaw<{ total_actions: bigint; total_meetings: bigint }[]>`
        SELECT
            COUNT(*) AS total_actions,
            COUNT(*) FILTER (WHERE CAST(a.result AS TEXT) = 'MEETING_BOOKED') AS total_meetings
        FROM "Action" a
        INNER JOIN "Campaign" c ON a."campaignId" = c.id
        INNER JOIN "Mission" m ON c."missionId" = m.id
        WHERE m."clientId" = ${clientId}
        AND a."createdAt" BETWEEN ${fromDate} AND ${toDate}
    `;
    totalActions = toNum(clientActionStats[0]?.total_actions);
    totalMeetings = toNum(clientActionStats[0]?.total_meetings);

    const overallCoverageRate = totalTargets > 0
        ? (totalContactedTargets / totalTargets) * 100
        : null;

    // Rankings
    const sortedByScore = [...summaries]
        .filter(s => !s.hasSparseData)
        .sort((a, b) => b.activityScore - a.activityScore);
    const topPerformers = sortedByScore.slice(0, 3);
    const bottomPerformers = sortedByScore.slice(-3).reverse();

    // Stagnation alerts
    const stagnationAlerts: StagnationAlert[] = summaries
        .filter(s => {
            const d = s.daysSinceLastAction;
            return d !== null && d >= HEALTH_THRESHOLDS.STAGNATION_MODERATE_DAYS;
        })
        .map(s => {
            const days = s.daysSinceLastAction!;
            const severity: StagnationAlert['severity'] =
                days >= HEALTH_THRESHOLDS.STAGNATION_CRITICAL_DAYS ? 'CRITICAL' :
                days >= HEALTH_THRESHOLDS.STAGNATION_HIGH_DAYS ? 'HIGH' : 'MODERATE';
            return {
                listId: s.listId,
                listName: s.listName,
                missionId: s.missionId,
                missionName: s.missionName,
                daysSinceLastAction: days,
                lastActionAt: null, // summary doesn't carry lastActionAt; enrich if needed
                coverageRate: s.coverageRate,
                totalContacts: s.totalContacts,
                severity,
            };
        })
        .sort((a, b) => b.daysSinceLastAction - a.daysSinceLastAction);

    return {
        clientId: client.id,
        clientName: client.name,
        computedAt: now.toISOString(),
        dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
        totalLists: summaries.length,
        ...statusCounts,
        totalContacts,
        totalCompanies,
        totalTargets,
        totalContactedContacts,
        totalContactedCompanies,
        totalContactedTargets,
        overallCoverageRate,
        totalActions,
        totalActions7d,
        totalMeetings,
        lists: summaries,
        topPerformers,
        bottomPerformers,
        stagnationAlerts,
    };
}
