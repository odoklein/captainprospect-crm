/**
 * Watch rule `client_at_risk`: the clients the chat's
 * `list_clients_needing_attention` would flag, as findings keyed by client.
 * The key has no date on purpose: the finding stays OPEN (seenCount climbing)
 * while the condition lasts and resolves the day it clears, so nobody gets
 * the same alert every morning.
 *
 *   CRITICAL  active missions, no RDV in the window, plus another gap
 *   WARN      active missions, no RDV in the window
 *   INFO      data gaps only (days/week, portal access, no active mission)
 */

import { collectClientAttention, type ClientAttentionResult } from "../signals/client-attention";
import type { DetectedFinding } from "../../types";
import type { WatchRule, WatchRuleContext } from "./types";

export interface ClientAtRiskDeps {
    collect: (options: { days: number; clientId?: string | null; now?: Date }) => Promise<ClientAttentionResult>;
}

export function daysFromConfig(config: Record<string, unknown>, fallback = 14): number {
    const raw = config.days;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 180 ? n : fallback;
}

export function createClientAtRiskRule(deps: ClientAtRiskDeps = { collect: collectClientAttention }): WatchRule {
    return {
        id: "client_at_risk",
        label: "Clients à surveiller",
        description: "Clients actifs sans RDV récent, jours contractualisés non renseignés, commerciaux sans accès portail, aucune mission active.",
        defaultSchedule: "0 8 * * 1-5",
        scopeKey: (ctx) => ctx.scope.clientId ?? "agency",
        async detect(ctx: WatchRuleContext): Promise<DetectedFinding[]> {
            const days = daysFromConfig(ctx.config);
            const result = await deps.collect({ days, clientId: ctx.scope.clientId, now: ctx.now });
            return result.clients.map((c): DetectedFinding => {
                const noMeetings = c.missionsActives > 0 && c.rdvSurLaPeriode === 0;
                const severity = noMeetings ? (c.alertes.length >= 2 ? "CRITICAL" : "WARN") : "INFO";
                return {
                    key: c.clientId,
                    severity,
                    kind: "client_at_risk",
                    title: `${c.nom} : ${c.alertes[0]}`,
                    body: `${c.nom} — ${c.alertes.join(" ; ")}. ${c.missionsActives} mission(s) active(s), ${c.rdvSurLaPeriode} RDV sur ${days} jours.`,
                    metrics: {
                        periodeJours: days,
                        missionsActives: c.missionsActives,
                        rdvSurLaPeriode: c.rdvSurLaPeriode,
                        commerciauxSansAcces: c.commerciauxSansAcces,
                        alertes: c.alertes.length,
                    },
                    clientId: c.clientId,
                };
            });
        },
    };
}

export const clientAtRiskRule = createClientAtRiskRule();
