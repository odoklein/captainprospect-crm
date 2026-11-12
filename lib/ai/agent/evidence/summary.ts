/**
 * The compact, privacy-safe description of one retrieval.
 *
 * Built only from the tool label, numeric facts and the period — never from a
 * payload string — so it can be stored for the retention period and shown in a
 * citation without carrying a prospect's name or a note's text.
 */

import type { EvidencePeriod, Fact } from "./facts";

const MAX_CHARS = 420;

function frDay(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

export function describePeriod(period: EvidencePeriod | null): string | null {
    if (!period) return null;
    const range = `${frDay(period.from)} → ${frDay(period.to)}`;
    if (period.kind === "month_to_date") return `mois en cours (${range})`;
    if (period.kind === "rolling" && period.days !== null) return `${period.days} derniers jours (${range})`;
    return `depuis le ${frDay(period.from)} (${range})`;
}

function formatValue(fact: Fact): string {
    const n = fact.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return fact.unit === "pct" ? `${n} %` : n;
}

export function buildEvidenceSummary(params: {
    toolLabel: string;
    status: "OK" | "EMPTY" | "ERROR";
    errorCode?: string | null;
    facts: Fact[];
    period: EvidencePeriod | null;
}): string {
    const head = params.toolLabel;
    if (params.status === "ERROR") return `${head} — échec (${params.errorCode ?? "erreur"})`;

    const parts: string[] = [];
    const period = describePeriod(params.period);
    if (period) parts.push(period);

    if (params.status === "EMPTY") {
        parts.push("aucun résultat");
        return `${head} — ${parts.join(" · ")}`;
    }

    const totals = params.facts.filter((f) => !f.entity && !f.derived).slice(0, 8);
    if (totals.length > 0) parts.push(totals.map((f) => `${f.key} ${formatValue(f)}`).join(", "));

    const lists = params.facts.filter((f) => f.derived === "length" && !f.entity && !f.path.includes("[]"));
    if (lists.length > 0) parts.push(lists.map((f) => `${f.key.replace(".length", "")} : ${f.value} ligne(s)`).join(", "));

    const text = `${head} — ${parts.join(" · ") || "résultat sans chiffre"}`;
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}
