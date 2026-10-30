/**
 * What happens to an answer after verification: invented citations are
 * removed, claims that still fail after the repair are marked where they stand
 * and listed at the end. A failed check never leaves the text looking as sure
 * as a verified one.
 */

import type { EvidenceEntry } from "../evidence/session";
import { describePeriod } from "../evidence/summary";
import type { VerificationResult } from "./verifier";

const MARK = " *(non vérifié)*";

export function annotateAnswer(answer: string, result: VerificationResult): string {
    const edits: Array<{ at: number; remove: number; insert: string }> = [];

    for (const c of result.invalidCitations) edits.push({ at: c.start, remove: c.end - c.start, insert: "" });
    for (const n of result.numbers) {
        if (n.status !== "verified") edits.push({ at: n.token.end, remove: 0, insert: MARK });
    }
    for (const o of result.others) {
        if (o.status !== "verified") edits.push({ at: o.end, remove: 0, insert: MARK });
    }

    // Right to left, so earlier offsets stay valid.
    edits.sort((a, b) => b.at - a.at);
    let out = answer;
    const seen = new Set<number>();
    for (const e of edits) {
        if (e.remove === 0 && seen.has(e.at)) continue;
        seen.add(e.at);
        out = out.slice(0, e.at) + e.insert + out.slice(e.at + e.remove);
    }
    out = out.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ");

    const failures = [
        ...result.numbers.filter((n) => n.status !== "verified").map((n) => `- ${n.token.raw} : ${n.reason}.`),
        ...result.others.filter((o) => o.status !== "verified").map((o) => `- ${o.raw} : ${o.reason}.`),
    ];
    if (failures.length > 0) {
        out = `${out.trimEnd()}\n\n**À vérifier** — ces éléments n'ont pas pu être confirmés par les sources consultées :\n${[...new Set(failures)].join("\n")}`;
    }
    return out;
}

/** Remove invented citations only (used when nothing else failed). */
export function stripInvalidCitations(answer: string, result: VerificationResult): string {
    if (result.invalidCitations.length === 0) return answer;
    let out = answer;
    for (const c of [...result.invalidCitations].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, c.start) + out.slice(c.end);
    }
    return out.replace(/ {2,}/g, " ");
}

/** The one repair request: what failed, why, and the facts that are available. */
export function buildRepairPrompt(result: VerificationResult, evidence: EvidenceEntry[]): string {
    const failures = [
        ...result.numbers
            .filter((n) => n.status !== "verified")
            .map((n) => `- « ${n.sentence.slice(0, 200)} » → ${n.token.raw} : ${n.reason}.`),
        ...result.others.filter((o) => o.status !== "verified").map((o) => `- ${o.raw} : ${o.reason}.`),
        ...result.invalidCitations.map((c) => `- [${c.label}] : cette source n'existe pas.`),
    ];

    const sources = evidence
        .filter((e) => e.status !== "ERROR")
        .map((e) => {
            const period = describePeriod(e.period);
            const facts = e.facts
                .filter((f) => !f.derived || f.derived === "length")
                .slice(0, 30)
                .map((f) => `${f.entity ? `${f.entity} / ` : ""}${f.key} = ${f.value}${f.unit === "pct" ? " %" : ""}`)
                .join(" ; ");
            return `[${e.label}] ${e.toolLabel}${period ? ` — ${period}` : ""} : ${facts || "aucun chiffre"}`;
        });

    return `Vérification automatique : ta réponse contient des éléments qui ne correspondent pas aux sources.

${failures.join("\n")}

Sources disponibles (les seules autorisées) :
${sources.join("\n") || "(aucune)"}

Réécris ta réponse complète en corrigeant ces points : utilise le chiffre exact de la source avec sa vraie période, ou supprime l'affirmation, ou dis clairement que tu ne peux pas la vérifier. N'ajoute aucun chiffre absent des sources. Garde les citations [E#] valides après chaque chiffre. Ne mentionne pas cette vérification.`;
}
