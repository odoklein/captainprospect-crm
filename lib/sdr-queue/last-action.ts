/**
 * "Dernière action" resolution shared by the SDR table queue
 * (/api/sdr/action-queue) and the card view (/api/actions/next).
 *
 * Two different things are computed per queue row and must never be mixed:
 *   - the row's OWN last action: what the row displays as its history (result,
 *     note, "Contacté par", callback date) and what drives priority/cooldown;
 *   - the COMPANY's last action (any contact of the same company): only the
 *     "Entreprise déjà contactée" warning before calling.
 *
 * When a contact row fell back to the company's action, a company with many
 * contacts showed every contact with a sibling's note, and a contact whose own
 * last action had no note got a sibling's note under its own result.
 */

/**
 * CTEs to append after an `all_targets` CTE (one row per contact, or per
 * company that has no contacts; columns `contact_id`, `company_id`). Produces
 * `targets_with_last_action`: `all_targets.*` plus `last_action_*` (the row's
 * own last action) and `company_last_action_*` (the company-wide one).
 */
export const LAST_ACTION_CTES = `
        last_actions_contacts AS (
            -- Last action per contact (with SDR who did it)
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
            -- Last action per company across all its history (direct company actions and actions on its contacts)
            SELECT DISTINCT ON (COALESCE(a."companyId", c_lookup."companyId"))
                COALESCE(a."companyId", c_lookup."companyId") as company_id_resolved,
                a.result,
                a.note,
                a."createdAt",
                a."callbackDate",
                a."sdrId",
                u.name as sdr_name
            FROM "Action" a
            LEFT JOIN "Contact" c_lookup ON a."contactId" = c_lookup.id
            INNER JOIN "User" u ON u.id = a."sdrId"
            WHERE COALESCE(a."companyId", c_lookup."companyId") IN (SELECT company_id FROM all_targets)
            ORDER BY COALESCE(a."companyId", c_lookup."companyId"), a."createdAt" DESC
        ),
        targets_with_last_action AS (
            SELECT
                at.*,
                -- The row's own last action, every column from the same Action:
                -- a contact row takes its contact's, a company row (no contacts) the company's.
                -- Never COALESCE the two per column — that pairs a sibling contact's note
                -- with this contact's result.
                (CASE WHEN at.contact_id IS NOT NULL THEN lac.result ELSE lac2.result END)::text as last_action_result,
                CASE WHEN at.contact_id IS NOT NULL THEN lac.note ELSE lac2.note END as last_action_note,
                CASE WHEN at.contact_id IS NOT NULL THEN lac."createdAt" ELSE lac2."createdAt" END as last_action_created,
                CASE WHEN at.contact_id IS NOT NULL THEN lac."callbackDate" ELSE lac2."callbackDate" END as last_action_callback_date,
                CASE WHEN at.contact_id IS NOT NULL THEN lac."sdrId" ELSE lac2."sdrId" END as last_action_sdr_id,
                CASE WHEN at.contact_id IS NOT NULL THEN lac.sdr_name ELSE lac2.sdr_name END as last_action_sdr_name,
                CASE
                    WHEN at.contact_id IS NOT NULL AND lac.result IS NOT NULL THEN 'CONTACT'
                    WHEN at.contact_id IS NULL AND lac2.result IS NOT NULL THEN 'COMPANY'
                    ELSE NULL
                END as last_action_scope,
                -- Company-wide last action (possibly on a sibling contact): warning only.
                lac2.result::text as company_last_action_result,
                lac2.note as company_last_action_note,
                lac2."createdAt" as company_last_action_created,
                lac2."sdrId" as company_last_action_sdr_id,
                lac2.sdr_name as company_last_action_sdr_name
            FROM all_targets at
            LEFT JOIN last_actions_contacts lac ON at.contact_id = lac."contactId"
            LEFT JOIN last_actions_companies lac2 ON at.company_id = lac2.company_id_resolved
        )`;

interface RowLastAction {
    result: string;
    note?: string | null;
    createdAt: string;
    callbackDate?: string | null;
    scope?: "CONTACT" | "COMPANY" | null;
}

interface RowCompanyLastAction {
    result: string;
    note?: string | null;
    createdAt: string;
    sdrId?: string | null;
    sdrName?: string | null;
}

interface ActionBy {
    id: string;
    name: string | null;
}

/**
 * The action the "already contacted" warning checks for a contact row: its own
 * last action, or — when it has none — the company's (typically a sibling
 * contact's), flagged COMPANY so the warning reads "Entreprise déjà contactée".
 * `lastActionBy` always belongs to the returned action.
 *
 * For the warning only: a row displays its own `lastAction`, never this.
 */
export function contactedWarningContext(row: {
    lastAction?: RowLastAction | null;
    lastActionBy?: ActionBy | null;
    companyLastAction?: RowCompanyLastAction | null;
}): { lastAction: RowLastAction | null; lastActionBy: ActionBy | null } {
    if (row.lastAction) {
        return { lastAction: row.lastAction, lastActionBy: row.lastActionBy ?? null };
    }
    const company = row.companyLastAction;
    if (!company) return { lastAction: null, lastActionBy: null };
    return {
        lastAction: {
            result: company.result,
            note: company.note,
            createdAt: company.createdAt,
            scope: "COMPANY",
        },
        lastActionBy: company.sdrId ? { id: company.sdrId, name: company.sdrName ?? null } : null,
    };
}
