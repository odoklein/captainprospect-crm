import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from '@/lib/api-utils';
import { statusConfigService } from '@/lib/services/StatusConfigService';

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

// ============================================
// OPTIMIZED QUEUE QUERY - PHASE 2.5
// ============================================
// Single SQL query using CTEs for performance
// Now supports missionId and listId filters
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('missionId');
    const listId = searchParams.get('listId');
    const channelParam = searchParams.get('channel')?.toUpperCase();
    const VALID_CHANNELS = ['CALL', 'EMAIL', 'LINKEDIN'] as const;
    const isValidChannel = (value: string | undefined): value is (typeof VALID_CHANNELS)[number] =>
        !!value && VALID_CHANNELS.includes(value as (typeof VALID_CHANNELS)[number]);
    const channelFilter = isValidChannel(channelParam)
        ? `AND ('${channelParam}' = ANY(m.channels))`
        : '';

    // Cooldown configuration (should move to env/config)
    const COOLDOWN_HOURS = 24;
    const cooldownDate = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const sdrId = session.user.id;
    const isBooker = session.user.role === "BOOKER";

    // Build dynamic where clauses
    const missionFilter = missionId
        ? `AND m.id = '${missionId.replace(/'/g, "''")}'`
        : '';
    const listFilter = listId
        ? `AND l.id = '${listId.replace(/'/g, "''")}'`
        : '';

    const shouldBypassAssignmentGate = Boolean(missionId);

    // Booker and mission-filtered requests: no SDRAssignment join
    const sdrAssignmentJoin = isBooker || shouldBypassAssignmentGate
        ? ""
        : `INNER JOIN "SDRAssignment" sa ON sa."missionId" = m.id`;
    const sdrAssignmentWhere = isBooker || shouldBypassAssignmentGate
        ? ""
        : `AND sa."sdrId" = $1`;

    // ============================================
    // OPTIMIZED QUERY: Single CTE-based query
    // Now includes both contacts AND companies (for direct company calls)
    // ============================================
    const result = await prisma.$queryRawUnsafe<Array<{
        contact_id: string;
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
        campaign_script: string | null;
        mission_name: string;
        mission_channel: string;
        client_id: string;
        client_booking_url: string | null;
        last_action_result: string | null;
        last_action_note: string | null;
        last_action_created: Date | null;
        last_action_callback_date: Date | null;
        last_action_sdr_id?: string | null;
        last_action_sdr_name?: string | null;
        priority: number;
        priority_label: string;
    }>>(`
        WITH sdr_contacts AS (
            -- Get all contacts for active missions
            SELECT DISTINCT
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
                camp.script as campaign_script,
                m.name as mission_name,
                m.channel as mission_channel,
                cl.id as client_id,
                cl."bookingUrl" as client_booking_url
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
        ),
        sdr_companies AS (
            -- Get companies that can be called directly
            SELECT DISTINCT
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
                camp.script as campaign_script,
                m.name as mission_name,
                m.channel as mission_channel,
                cl.id as client_id,
                cl."bookingUrl" as client_booking_url
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
        ),
        all_targets AS (
            -- Combine contacts and companies
            SELECT * FROM sdr_contacts
            UNION ALL
            SELECT * FROM sdr_companies
        ),
        last_actions_contacts AS (
            -- Get last action per contact (with SDR who did it)
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
            -- Get last action per company (with SDR who did it)
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
        SELECT *
        FROM targets_with_last_action
        WHERE 1=1
        -- SQL pre-sort is a hint only; JavaScript re-sorts by config-driven priority after the fetch.
        -- LIMIT must be large enough that callbacks (which may have recent last_action_created) are not cut
        -- before the JS priority pass. 2000 covers most production lists while keeping the payload bounded.
        ORDER BY
            CASE WHEN contact_status = 'ACTIONABLE' THEN 0 WHEN contact_status = 'PARTIAL' THEN 1 WHEN contact_status = 'INCOMPLETE' THEN 2 ELSE 3 END,
            COALESCE(last_action_created, '1970-01-01'::timestamp) ASC
        LIMIT 2000
    `, ...(isBooker || shouldBypassAssignmentGate ? [cooldownDate] : [sdrId, cooldownDate]));

    // Resolve missionId for config and fetch interlocuteurs in parallel
    const configMissionIdPromise = (async () => {
        if (missionId) return missionId;
        if (listId) {
            const list = await prisma.list.findUnique({
                where: { id: listId },
                select: { missionId: true },
            });
            if (list?.missionId) return list.missionId;
        }
        if (result.length > 0) {
            const camp = await prisma.campaign.findUnique({
                where: { id: result[0].campaign_id },
                select: { missionId: true },
            });
            return camp?.missionId ?? null;
        }
        return null;
    })();

    // Sort by config once we have it
    const configMissionId = await configMissionIdPromise;
    const config = await statusConfigService.getEffectiveStatusConfig(
        configMissionId ? { missionId: configMissionId } : {}
    );

    const callbackResultCodes = buildCallbackResultCodes(config);

    const bookedContactIds = result
        .filter((r) => r.last_action_result === "MEETING_BOOKED" && r.contact_id)
        .map((r) => r.contact_id!);
    const bookedCompanyIds = result
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

    const withPriority = result.map((row) => {
        const isAbsentRdv = row.contact_id
            ? absentContactIds.has(row.contact_id)
            : absentCompanyIds.has(row.company_id);

        if (isAbsentRdv) {
            return { ...row, _priorityOrder: 0, _priorityLabel: "ABSENT_RDV" };
        }
        const { priorityOrder, priorityLabel } = statusConfigService.getPriorityForResult(
            row.last_action_result,
            config
        );
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
    const next = sorted[0];

    if (!next) {
        return successResponse({
            hasNext: false,
            message: listId
                ? 'Queue vide pour cette liste - aucun contact disponible ou tous en cooldown'
                : missionId
                    ? 'Queue vide pour cette mission - aucun contact disponible ou tous en cooldown'
                    : 'Queue vide - aucun contact disponible ou tous en cooldown',
        });
    }

    // bookingUrl comes from the raw SQL now; only fetch interlocuteurs separately
    const clientBookingUrl = next.client_booking_url || undefined;
    let clientInterlocuteurs: Array<Record<string, unknown>> = [];
    try {
        const interlocuteurs = await prisma.clientInterlocuteur.findMany({
            where: { clientId: next.client_id, isActive: true },
            orderBy: { createdAt: 'asc' },
        });
        clientInterlocuteurs = interlocuteurs as Array<Record<string, unknown>>;
    } catch (err) {
        console.warn('Could not fetch client interlocuteurs:', err);
    }

    const campaignMeta = await prisma.campaign.findUnique({
        where: { id: next.campaign_id },
        select: { script: true, rules: true, name: true },
    });

    // Source list for provenance — the company's list (one company belongs to one list)
    const sourceList = await prisma.company.findUnique({
        where: { id: next.company_id },
        select: { list: { select: { id: true, name: true, campaignId: true } } },
    });
    const sourceListName = sourceList?.list?.name ?? null;
    const sourceListId = sourceList?.list?.id ?? null;

    const onboarding = await prisma.clientOnboarding.findFirst({
        where: { clientId: next.client_id },
        orderBy: { createdAt: "desc" },
        select: { scripts: true },
    });

    const scriptFromCampaign = campaignMeta?.script ?? next.campaign_script ?? null;
    const scriptFromOnboarding = onboarding?.scripts;
    const scriptCompanion = (campaignMeta?.rules as {
        scriptCompanion?: {
            shared?: { content?: string };
            aiShared?: { content?: string };
            defaultTab?: "base" | "additional" | "ai";
        };
    } | null)?.scriptCompanion;

    const normalizedBaseScript = (() => {
        if (typeof scriptFromCampaign === "string" && scriptFromCampaign.trim()) return scriptFromCampaign;
        if (scriptFromOnboarding && typeof scriptFromOnboarding === "object") {
            const onboardingScripts = scriptFromOnboarding as Record<string, unknown>;
            if (typeof onboardingScripts.base === "string" && onboardingScripts.base.trim()) {
                return onboardingScripts.base;
            }
            const ordered = [
                ["Introduction", onboardingScripts.intro],
                ["Decouverte", onboardingScripts.discovery],
                ["Objections", onboardingScripts.objection],
                ["Closing", onboardingScripts.closing],
            ]
                .map(([label, value]) =>
                    typeof value === "string" && value.trim() ? `--- ${label} ---\n${value.trim()}` : null
                )
                .filter((v): v is string => Boolean(v));
            return ordered.join("\n\n");
        }
        return null;
    })();

    return successResponse({
        hasNext: true,
        priority: next._priorityLabel,
        missionName: next.mission_name,
        contact: next.contact_id ? {
            id: next.contact_id,
            firstName: next.contact_first_name,
            lastName: next.contact_last_name,
            title: next.contact_title,
            email: next.contact_email,
            phone: next.contact_phone,
            linkedin: next.contact_linkedin,
            status: next.contact_status,
        } : null,
        company: {
            id: next.company_id,
            name: next.company_name,
            industry: next.company_industry,
            website: next.company_website,
            country: next.company_country,
            phone: next.company_phone || null,
        },
        campaignId: next.campaign_id,
        strategyName: campaignMeta?.name ?? null,
        sourceListId,
        sourceListName,
        channel: next.mission_channel,
        script: normalizedBaseScript,
        scriptAdditional: scriptCompanion?.shared?.content ?? "",
        scriptAiEnhanced: scriptCompanion?.aiShared?.content ?? "",
        scriptDefaultTab: scriptCompanion?.defaultTab ?? "base",
        clientBookingUrl,
        clientInterlocuteurs,
        lastAction: next.last_action_result ? {
            result: next.last_action_result,
            note: next.last_action_note,
            createdAt: next.last_action_created?.toISOString(),
            callbackDate: next.last_action_callback_date?.toISOString(),
        } : null,
        lastActionBy: next.last_action_sdr_id
            ? { id: next.last_action_sdr_id, name: next.last_action_sdr_name ?? null }
            : null,
    });
});
