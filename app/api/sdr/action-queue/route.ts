import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { statusConfigService } from "@/lib/services/StatusConfigService";

// ============================================
// GET /api/sdr/action-queue
// Returns a list of queue items (same pool as /api/actions/next) for table view.
// Query: missionId?, listId?, search? (filter by name/company)
// Returns full eligible queue (no artificial limit).
// ============================================

function escapeIlikePattern(raw: string): string {
    return raw
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}

function buildCallbackResultCodes(config: { statuses: Array<{ code: string; label: string; triggersCallback?: boolean }> }) {
    const defaults = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"];
    const configured = config.statuses
        .filter((s) => {
            if (s.triggersCallback === true) return true;
            const haystack = `${s.code} ${s.label}`.toUpperCase();
            return haystack.includes("RAPPEL") || haystack.includes("RELANCE");
        })
        .map((s) => s.code);
    return new Set<string>([...defaults, ...configured]);
}

const COMPANY_PHONE_SQL = `COALESCE(NULLIF(co.phone, ''), NULLIF(co."customData"->'additionalPhones'->>0, ''))`;

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get("missionId");
    const listId = searchParams.get("listId");
    const channelParam = searchParams.get("channel")?.toUpperCase();
    const VALID_CHANNELS = ["CALL", "EMAIL", "LINKEDIN"] as const;
    const isValidChannel = (value: string | undefined): value is (typeof VALID_CHANNELS)[number] =>
        !!value && VALID_CHANNELS.includes(value as (typeof VALID_CHANNELS)[number]);
    const channelFilter = isValidChannel(channelParam)
        ? `AND ('${channelParam}' = ANY(m.channels))`
        : "";
    const search = searchParams.get("search")?.trim() ?? "";
    const hasSearch = search.length > 0;
    const COOLDOWN_HOURS = 24;
    const cooldownDate = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const sdrId = session.user.id;
    const isBooker = session.user.role === "BOOKER";

    const missionFilter = missionId ? `AND m.id = '${missionId.replace(/'/g, "''")}'` : "";
    const listFilter = listId ? `AND l.id = '${listId.replace(/'/g, "''")}'` : "";

    const shouldBypassAssignmentGate = Boolean(missionId);

    // Booker and mission-filtered requests: no SDRAssignment join
    const sdrAssignmentJoin = isBooker || shouldBypassAssignmentGate
        ? ""
        : `INNER JOIN "SDRAssignment" sa ON sa."missionId" = m.id`;
    const sdrAssignmentWhere = isBooker || shouldBypassAssignmentGate
        ? ""
        : `AND sa."sdrId" = $1`;

    const rawResult = await prisma.$queryRawUnsafe<
        Array<{
            contact_id: string | null;
            company_id: string;
            company_name: string;
            company_industry: string | null;
            company_website: string | null;
            company_country: string | null;
            company_phone: string | null;
            contact_first_name: string | null;
            contact_last_name: string | null;
            contact_title: string | null;
            contact_email: string | null;
            contact_phone: string | null;
            contact_linkedin: string | null;
            contact_status: string;
            campaign_id: string;
            mission_name: string;
            mission_channel: string;
            last_action_result: string | null;
            last_action_note: string | null;
            last_action_created: Date | null;
            last_action_callback_date: Date | null;
            last_action_sdr_id: string | null;
            last_action_sdr_name: string | null;
        }>
    >(
        `
        WITH sdr_contacts AS (
            -- One row per contact/company pair (even if multiple active campaigns exist)
            SELECT DISTINCT ON (c.id, co.id)
                c.id as contact_id,
                co.id as company_id,
                co.name as company_name,
                co.industry as company_industry,
                co.website as company_website,
                co.country as company_country,
                ${COMPANY_PHONE_SQL} as company_phone,
                c."firstName" as contact_first_name,
                c."lastName" as contact_last_name,
                c.title as contact_title,
                c.email as contact_email,
                c.phone as contact_phone,
                c.linkedin as contact_linkedin,
                c.status::text as contact_status,
                camp.id as campaign_id,
                m.name as mission_name,
                m.channel as mission_channel
            FROM "Contact" c
            INNER JOIN "Company" co ON c."companyId" = co.id
            INNER JOIN "List" l ON co."listId" = l.id
            INNER JOIN "Mission" m ON l."missionId" = m.id
            INNER JOIN "Client" cl ON m."clientId" = cl.id
            -- Strategy resolution: prefer the campaign linked to the list, fall back to
            -- the mission's first active campaign for lists still in transition.
            INNER JOIN "Campaign" camp ON camp.id = COALESCE(
                l."campaignId",
                (
                    SELECT c2."id"
                    FROM "Campaign" c2
                    WHERE c2."missionId" = m.id AND c2."isActive" = true
                    ORDER BY c2."createdAt" ASC
                    LIMIT 1
                )
            )
            ${sdrAssignmentJoin}
            WHERE m."isActive" = true
              AND (l."isActive" IS NULL OR l."isActive" = true)
              AND (l."isArchived" IS NULL OR l."isArchived" = false)
              AND camp."isActive" = true
              ${sdrAssignmentWhere}
              AND (
                  ('CALL' = ANY(m.channels) AND (c.phone IS NOT NULL AND c.phone != '' OR ${COMPANY_PHONE_SQL} IS NOT NULL)) OR
                  ('EMAIL' = ANY(m.channels) AND c.email IS NOT NULL AND c.email != '') OR
                  ('LINKEDIN' = ANY(m.channels) AND c.linkedin IS NOT NULL AND c.linkedin != '')
              )
              ${missionFilter}
              ${listFilter}
              ${channelFilter}
            ORDER BY c.id, co.id
        ),
        sdr_companies AS (
            -- One row per company (when no eligible contacts exist), regardless of campaign count
            SELECT DISTINCT ON (co.id)
                NULL::text as contact_id,
                co.id as company_id,
                co.name as company_name,
                co.industry as company_industry,
                co.website as company_website,
                co.country as company_country,
                ${COMPANY_PHONE_SQL} as company_phone,
                NULL::text as contact_first_name,
                NULL::text as contact_last_name,
                NULL::text as contact_title,
                NULL::text as contact_email,
                NULL::text as contact_phone,
                NULL::text as contact_linkedin,
                'INCOMPLETE'::text as contact_status,
                camp.id as campaign_id,
                m.name as mission_name,
                m.channel as mission_channel
            FROM "Company" co
            INNER JOIN "List" l ON co."listId" = l.id
            INNER JOIN "Mission" m ON l."missionId" = m.id
            INNER JOIN "Client" cl ON m."clientId" = cl.id
            INNER JOIN "Campaign" camp ON camp.id = COALESCE(
                l."campaignId",
                (
                    SELECT c2."id"
                    FROM "Campaign" c2
                    WHERE c2."missionId" = m.id AND c2."isActive" = true
                    ORDER BY c2."createdAt" ASC
                    LIMIT 1
                )
            )
            ${sdrAssignmentJoin}
            WHERE m."isActive" = true
              AND (l."isActive" IS NULL OR l."isActive" = true)
              AND (l."isArchived" IS NULL OR l."isArchived" = false)
              AND camp."isActive" = true
              ${sdrAssignmentWhere}
              AND 'CALL' = ANY(m.channels)
              AND ${COMPANY_PHONE_SQL} IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM "Contact" c2
                  WHERE c2."companyId" = co.id
                  AND (
                      ('CALL' = ANY(m.channels) AND c2.phone IS NOT NULL AND c2.phone != '') OR
                      ('EMAIL' = ANY(m.channels) AND c2.email IS NOT NULL AND c2.email != '') OR
                      ('LINKEDIN' = ANY(m.channels) AND c2.linkedin IS NOT NULL AND c2.linkedin != '')
                  )
              )
              ${missionFilter}
              ${listFilter}
              ${channelFilter}
            ORDER BY co.id
        ),
        all_targets AS (
            SELECT * FROM sdr_contacts
            UNION ALL
            SELECT * FROM sdr_companies
        ),
        last_actions_contacts AS (
            SELECT DISTINCT ON (a."contactId")
                a."contactId",
                a.result,
                a.note,
                a."createdAt",
                a."callbackDate",
                a."sdrId",
                u.name as sdr_name
            FROM "Action" a
            INNER JOIN "User" u ON u.id = a."sdrId"
            WHERE a."contactId" IN (SELECT contact_id FROM all_targets WHERE contact_id IS NOT NULL)
            ORDER BY a."contactId", a."createdAt" DESC
        ),
        last_actions_companies AS (
            SELECT DISTINCT ON (a."companyId")
                a."companyId",
                a.result,
                a.note,
                a."createdAt",
                a."callbackDate",
                a."sdrId",
                u.name as sdr_name
            FROM "Action" a
            INNER JOIN "User" u ON u.id = a."sdrId"
            WHERE a."companyId" IN (SELECT company_id FROM all_targets WHERE contact_id IS NULL)
              AND a."companyId" IS NOT NULL
            ORDER BY a."companyId", a."createdAt" DESC
        ),
        targets_with_last_action AS (
            SELECT
                at.*,
                COALESCE(lac.result, lac2.result)::text as last_action_result,
                COALESCE(lac.note, lac2.note) as last_action_note,
                COALESCE(lac."createdAt", lac2."createdAt") as last_action_created,
                COALESCE(lac."callbackDate", lac2."callbackDate") as last_action_callback_date,
                COALESCE(lac."sdrId", lac2."sdrId") as last_action_sdr_id,
                COALESCE(lac.sdr_name, lac2.sdr_name) as last_action_sdr_name
            FROM all_targets at
            LEFT JOIN last_actions_contacts lac ON at.contact_id = lac."contactId"
            LEFT JOIN last_actions_companies lac2 ON at.contact_id IS NULL AND at.company_id = lac2."companyId"
        )
        SELECT * FROM targets_with_last_action
        WHERE 1=1
        ${hasSearch ? `
        AND (
            (contact_first_name IS NOT NULL AND contact_first_name ILIKE $${isBooker || shouldBypassAssignmentGate ? 2 : 3})
            OR (contact_last_name IS NOT NULL AND contact_last_name ILIKE $${isBooker || shouldBypassAssignmentGate ? 2 : 3})
            OR (company_name IS NOT NULL AND company_name ILIKE $${isBooker || shouldBypassAssignmentGate ? 2 : 3})
        )` : ""}
    `,
        ...(isBooker || shouldBypassAssignmentGate
            ? (hasSearch ? [cooldownDate, `%${escapeIlikePattern(search)}%`] : [cooldownDate])
            : (hasSearch ? [sdrId, cooldownDate, `%${escapeIlikePattern(search)}%`] : [sdrId, cooldownDate])
        )
    );

    // Resolve config in parallel with result processing
    const configPromise = (async () => {
        let configMissionId = missionId ?? null;
        if (!configMissionId && listId) {
            const list = await prisma.list.findUnique({
                where: { id: listId },
                select: { missionId: true },
            });
            configMissionId = list?.missionId ?? null;
        }
        if (!configMissionId && rawResult.length > 0) {
            const camp = await prisma.campaign.findUnique({
                where: { id: rawResult[0].campaign_id },
                select: { missionId: true },
            });
            configMissionId = camp?.missionId ?? null;
        }
        return statusConfigService.getEffectiveStatusConfig(
            configMissionId ? { missionId: configMissionId } : {}
        );
    })();

    const config = await configPromise;

    const callbackResultCodes = buildCallbackResultCodes(config);

    const bookedContactIds = rawResult
        .filter((r) => r.last_action_result === "MEETING_BOOKED" && r.contact_id)
        .map((r) => r.contact_id!);
    const bookedCompanyIds = rawResult
        .filter((r) => r.last_action_result === "MEETING_BOOKED" && !r.contact_id)
        .map((r) => r.company_id);

    let absentContactIds = new Set<string>();
    let absentCompanyIds = new Set<string>();

    if (bookedContactIds.length > 0 || bookedCompanyIds.length > 0) {
        const absentActions = await prisma.action.findMany({
            where: {
                result: "MEETING_BOOKED",
                sdrId,
                meetingFeedback: { outcome: "NO_SHOW" },
                OR: [
                    ...(bookedContactIds.length > 0 ? [{ contactId: { in: bookedContactIds } }] : []),
                    ...(bookedCompanyIds.length > 0 ? [{ companyId: { in: bookedCompanyIds }, contactId: null }] : []),
                ],
            },
            select: { contactId: true, companyId: true },
        });
        absentContactIds = new Set(absentActions.filter((a) => a.contactId).map((a) => a.contactId!));
        absentCompanyIds = new Set(absentActions.filter((a) => !a.contactId && a.companyId).map((a) => a.companyId!));
    }

    const withPriority = rawResult.map((row) => {
        const isAbsentRdv = row.contact_id
            ? absentContactIds.has(row.contact_id)
            : absentCompanyIds.has(row.company_id);

        if (isAbsentRdv) {
            return { ...row, _priorityOrder: 0, _priorityLabel: "ABSENT_RDV" };
        }
        const { priorityOrder, priorityLabel } = statusConfigService.getPriorityForResult(row.last_action_result, config);
        return { ...row, _priorityOrder: priorityOrder, _priorityLabel: priorityLabel };
    });
    const filtered = withPriority.filter((r) => {
        if (r._priorityLabel === "ABSENT_RDV") return true;

        const isInCooldown = !!r.last_action_created && new Date(r.last_action_created).getTime() >= cooldownDate.getTime();
        const isOwnedCallback = !!r.last_action_result && callbackResultCodes.has(r.last_action_result) && r.last_action_sdr_id === sdrId;

        if (r._priorityOrder >= 999) return false;
        if (!isInCooldown) return true;
        return isOwnedCallback;
    });
    const sorted = filtered.sort(
        (a, b) =>
            a._priorityOrder - b._priorityOrder ||
            (a.contact_status === "ACTIONABLE" ? 0 : a.contact_status === "PARTIAL" ? 1 : 2) -
                (b.contact_status === "ACTIONABLE" ? 0 : b.contact_status === "PARTIAL" ? 1 : 2) ||
            new Date(a.last_action_created ?? 0).getTime() - new Date(b.last_action_created ?? 0).getTime()
    );
    const result = sorted;

    const items = result.map((row) => ({
        contactId: row.contact_id,
        companyId: row.company_id,
        contact: row.contact_id
            ? {
                id: row.contact_id,
                firstName: row.contact_first_name,
                lastName: row.contact_last_name,
                title: row.contact_title,
                email: row.contact_email,
                phone: row.contact_phone,
                linkedin: row.contact_linkedin,
                status: row.contact_status,
            }
            : null,
        company: {
            id: row.company_id,
            name: row.company_name,
            industry: row.company_industry,
            website: row.company_website,
            country: row.company_country,
            phone: row.company_phone || null,
        },
        campaignId: row.campaign_id,
        channel: row.mission_channel,
        missionName: row.mission_name,
        lastAction: row.last_action_result
            ? {
                result: row.last_action_result,
                note: row.last_action_note,
                createdAt: row.last_action_created?.toISOString(),
                callbackDate: row.last_action_callback_date?.toISOString(),
            }
            : null,
        lastActionBy: row.last_action_sdr_id
            ? { id: row.last_action_sdr_id, name: row.last_action_sdr_name || null }
            : null,
        priority: row._priorityLabel,
    }));

    return successResponse({ items });
});
