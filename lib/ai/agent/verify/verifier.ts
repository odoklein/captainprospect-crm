/**
 * Deterministic verification of an answer against the turn's evidence.
 *
 * A figure counts as verified only when a fact from the evidence has
 *   - the same value at the precision the answer used,
 *   - a compatible unit (a percentage is not a count),
 *   - a compatible reporting period (from the sentence, else the paragraph,
 *     else the question — "ce mois-ci" is not "30 derniers jours"),
 *   - the same entity when the sentence names one (Karim's figure is not
 *     Julie's, nor the team total),
 *   - a metric the sentence actually talks about (14,6 % RDV/connects is not
 *     "% des actions").
 * A percentage may also be recomputed from two counts of the same source
 * (numerator / denominator), which is how a correct "3,3 % des actions" is
 * verified when the tool only stored 14 and 420.
 *
 * Dates and person/company names are checked for presence in the payloads the
 * turn retrieved. Everything is pure: no I/O, no model.
 */

import type { UnverifiedClaim } from "../protocol";
import { addDays, parisDay, type EvidencePeriod, type Fact } from "../evidence/facts";
import { describePeriod } from "../evidence/summary";
import {
    describeClaimPeriod,
    findDates,
    findNumbers,
    findPeriods,
    fold,
    mondayOf,
    normalizeKeepLength,
    type ClaimPeriod,
    type NumberToken,
} from "./text";

export interface VerifiableEvidence {
    label: string;
    status: "OK" | "EMPTY" | "ERROR";
    facts: Fact[];
    /** Payload strings, when the payload was in memory this turn. */
    strings: string[] | null;
    period: EvidencePeriod | null;
}

export type ClaimStatus =
    | "verified"
    | "unsupported"
    | "mismatch_period"
    | "mismatch_entity"
    | "mismatch_metric"
    | "ambiguous";

export interface NumberClaimResult {
    kind: "number";
    token: NumberToken;
    sentence: string;
    period: ClaimPeriod | null;
    entity: string | null;
    citations: string[];
    status: ClaimStatus;
    reason: string;
    /** Evidence label that supports (or best explains the failure of) the claim. */
    evidence: string | null;
}

export interface TokenClaimResult {
    kind: "date" | "entity";
    start: number;
    end: number;
    raw: string;
    status: "verified" | "unsupported";
    reason: string;
}

export interface VerificationResult {
    numbers: NumberClaimResult[];
    others: TokenClaimResult[];
    /** Labels the answer cited that resolve. */
    citedLabels: string[];
    /** Labels the answer cited that do not exist — the model invented them. */
    invalidCitations: Array<{ label: string; start: number; end: number }>;
    checked: number;
    verified: number;
    failed: number;
}

export interface VerifyOptions {
    question: string;
    now: Date;
    /** Names the answer may use without a source: user, client, mission, brand. */
    knownNames: string[];
}

// -- Metric vocabulary --------------------------------------------------------

type TermGroups = string[][];

const RDV_TERMS = ["rdv", "rendez-vous", "rendez vous", "meeting"];

const LEXICON: Array<[RegExp, TermGroups]> = [
    // CRM data tools (public API keys)
    [/^change_pct$/i, [["evolution", "hausse", "baisse", "variation", "progress", "recul", "augment", "diminu", "plus que", "moins que"]]],
    [/^appointments_per_100_calls$/i, [["100 appels", "cent appels", "pour 100"]]],
    [/^appointments_cancelled$/i, [["annul"]]],
    [/^appointments_confirmed$/i, [["confirm", "valid"]]],
    [/^appointments_pending_review$/i, [["attente", "valider", "validation", "sas"]]],
    [/^appointments_rejected$/i, [["rejet", "refus"]]],
    [/^(appointments_booked|appointments|total)$/i, [RDV_TERMS]],
    [/^(upcoming_confirmed|upcoming_pending)$/i, [["a venir", "prevu", "futur", "prochain"]]],
    [/^(no_show|open)$/i, [["absen", "no show", "lapin"]]],
    [/^(positive|positive_rate)$/i, [["positi"]]],
    [/^negative$/i, [["negati"]]],
    [/^neutral$/i, [["neutre"]]],
    [/^no_feedback$/i, [["sans retour", "pas de retour", "retour"]]],
    [/^show_rate$/i, [["presence", "honore", "tenu", "show"]]],
    [/^calls_per_contact$/i, [["appel"], ["contact", "personne", "prospect"]]],
    [/^(calls|reached_calls)$/i, [["appel", "call", "tentative", "numerot"]]],
    [/^reach_rate_pct$/i, [["joign", "joint", "conversation", "decroch", "atteint", "connect"]]],
    [/^emails$/i, [["email", "mail"]]],
    [/^contacts$/i, [["contact", "personne", "prospect", "interlocut"]]],
    [/^companies$/i, [["societe", "entreprise", "compte", "structure"]]],
    // Project tools (French keys)
    [/^tauxrdvsurconnect/i, [["rdv", "rendez"], ["connect", "joint", "decroch", "conversation"]]],
    [/^tauxconnect/i, [["connect", "joign", "joint", "decroch"]]],
    [/annul/i, [["annul"]]],
    [/^(rdv|rdvpris|rdvcemois|rdvsurlaperiode|meeting)/i, [["rdv", "rendez-vous", "rendez vous", "meeting"]]],
    [/^(actions|actionsrealisees)$/i, [["action", "appel", "tentative", "call"]]],
    [/^connects?$/i, [["connect", "joint", "joignab", "decroch", "conversation"]]],
    [/sanscompte|commerciauxsanscompteportail/i, [["sans compte", "sans acces", "acces", "compte", "portail"]]],
    [/^(clientsactifs|totalclientsactifs)$/i, [["client"]]],
    [/^missionsactives$/i, [["mission"]]],
    [/^sdractifs$/i, [["sdr", "commerciaux", "teleprospect"]]],
    [/enattentedeconfirmation/i, [["attente", "confirm"]]],
    [/^societes$/i, [["societe", "entreprise", "compte", "fiche"]]],
    [/^nombre$/i, []],
];

const STOP_TOKENS = new Set(["de", "du", "des", "la", "le", "les", "sur", "par", "en", "length", "sum", "nombre", "total", "totaux"]);

function camelTokens(key: string): string[] {
    return key
        .replace(/\.length$|:sum$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t))
        .map((t) => (t.length > 5 ? t.slice(0, 5) : t));
}

function lookup(key: string): TermGroups | null {
    for (const [pattern, groups] of LEXICON) {
        if (pattern.test(key)) return groups;
    }
    return null;
}

export function termsFor(fact: Fact): TermGroups {
    const base = fact.key.replace(/\.length$/, "");
    // "calls.before" / "appointments_booked.change_pct": the leaf qualifies the parent.
    const [parent, leaf] = base.includes(".") ? base.split(".", 2) : [base, ""];
    if (leaf === "change_pct") return [...(lookup(leaf) ?? []), ...(lookup(parent) ?? [])];
    const groups = lookup(parent);
    if (groups && groups.length > 0) return groups;
    if (groups) return [];
    const tokens = camelTokens(parent);
    return tokens.length > 0 ? [tokens] : [];
}

function matchesTerms(groups: TermGroups, context: string): boolean {
    if (groups.length === 0) return false;
    return groups.every((group) => group.some((term) => context.includes(term)));
}

/**
 * Every word the lexicon uses to talk about a metric. A row label made of them
 * ("RDV pris", "Appels", "Conversations obtenues") names a measure, not a
 * subject: "14 RDV confirmés" is not about an entity called "RDV pris".
 */
const METRIC_WORD_RES = [...new Set(LEXICON.flatMap(([, groups]) => groups.flat()))]
    .filter((term) => term.length >= 3)
    .map((term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

export function isMetricLabel(entity: string): boolean {
    const folded = fold(entity);
    return METRIC_WORD_RES.some((re) => re.test(folded));
}

// -- Periods ------------------------------------------------------------------

export function periodCompatible(claim: ClaimPeriod | null, fact: EvidencePeriod | null, now: Date): boolean {
    if (!claim || !fact) return true;
    const today = parisDay(now);
    const firstOfMonth = `${today.slice(0, 8)}01`;
    switch (claim.kind) {
        case "rolling":
            // "30 derniers jours" is either today-30 → today or 30 calendar days including today.
            return (
                (fact.kind === "rolling" && fact.days === claim.days) ||
                fact.from === addDays(fact.to, -claim.days) ||
                fact.from === addDays(fact.to, -(claim.days - 1))
            );
        case "rolling_months":
            return fact.days !== null && fact.days >= 28 * claim.months && fact.days <= 31 * claim.months;
        case "month_to_date":
            return fact.from === firstOfMonth;
        case "week_to_date":
            return fact.from === mondayOf(today);
        case "today":
            return fact.from === today || fact.days === 0 || fact.days === 1;
        case "yesterday":
            return fact.from === addDays(today, -1);
        case "last_week":
            return fact.from === addDays(mondayOf(today), -7);
        case "last_month": {
            const previous = new Date(`${firstOfMonth}T12:00:00Z`);
            previous.setUTCMonth(previous.getUTCMonth() - 1);
            return fact.from === previous.toISOString().slice(0, 10);
        }
        case "since":
            return fact.from === claim.from;
        case "named_month":
            return Number(today.slice(5, 7)) === claim.month && fact.from === firstOfMonth;
    }
}

// -- Context ------------------------------------------------------------------

interface LineInfo {
    start: number;
    end: number;
    text: string;
    norm: string;
    isList: boolean;
    isTable: boolean;
}

function splitLines(original: string, normalized: string): LineInfo[] {
    const lines: LineInfo[] = [];
    let start = 0;
    for (const raw of original.split("\n")) {
        const end = start + raw.length;
        const norm = normalized.slice(start, end);
        lines.push({
            start,
            end,
            text: raw,
            norm,
            isList: /^\s*(?:[-*•]|\d+[.)])\s/.test(raw),
            isTable: /^\s*\|/.test(raw),
        });
        start = end + 1;
    }
    return lines;
}

function sentenceBounds(norm: string, at: number, line: LineInfo): [number, number] {
    let s = line.start;
    let e = line.end;
    for (let i = at - 1; i >= line.start; i--) {
        if (/[.!?]/.test(norm[i]) && /\s/.test(norm[i + 1] ?? " ")) {
            s = i + 1;
            break;
        }
    }
    for (let i = at; i < line.end; i++) {
        if (/[.!?]/.test(norm[i]) && /\s|$/.test(norm[i + 1] ?? "") && !/\d/.test(norm[i + 1] ?? "")) {
            e = i + 1;
            break;
        }
    }
    return [s, e];
}

/** Clause = sentence cut at ; , " et " " dont " and dashes — the claim's own words. */
function clauseBounds(norm: string, at: number, sentence: [number, number]): [number, number] {
    const delim = /;|,\s|\set\s|\sdont\s|\s[-–—]\s|\|/g;
    let s = sentence[0];
    let e = sentence[1];
    const slice = norm.slice(sentence[0], sentence[1]);
    let m: RegExpExecArray | null;
    while ((m = delim.exec(slice))) {
        const pos = sentence[0] + m.index;
        if (pos < at) s = pos + m[0].length;
        else if (pos >= at) {
            e = pos;
            break;
        }
    }
    return [s, e];
}

function tableHeaderCell(lines: LineInfo[], lineIndex: number, at: number): string {
    let header = lineIndex;
    while (header > 0 && lines[header - 1].isTable) header--;
    if (header === lineIndex) return "";
    const row = lines[lineIndex];
    const cellIndex = row.norm.slice(0, at - row.start).split("|").length - 1;
    return lines[header].norm.split("|")[cellIndex] ?? "";
}

function leadLine(lines: LineInfo[], lineIndex: number): string {
    for (let i = lineIndex - 1; i >= 0; i--) {
        const l = lines[i];
        if (!l.text.trim()) continue;
        if (l.isList || l.isTable) continue;
        return l.norm;
    }
    return "";
}

// -- Entities -----------------------------------------------------------------

interface EntityMention {
    entity: string;
    start: number;
}

function entityMentions(norm: string, entities: string[]): EntityMention[] {
    const out: EntityMention[] = [];
    const firstTokens = new Map<string, string[]>();
    for (const e of entities) {
        const first = fold(e).split(/\s+/)[0];
        if (first.length >= 3) firstTokens.set(first, [...(firstTokens.get(first) ?? []), e]);
    }
    for (const e of entities) {
        const full = fold(e);
        if (full.length < 3) continue;
        let i = norm.indexOf(full);
        while (i >= 0) {
            out.push({ entity: e, start: i });
            i = norm.indexOf(full, i + full.length);
        }
    }
    for (const [first, owners] of firstTokens) {
        if (owners.length !== 1) continue; // two Julies: the first name proves nothing
        const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(norm))) {
            if (!out.some((o) => o.start === m!.index)) out.push({ entity: owners[0], start: m.index });
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

function nearestEntity(mentions: EntityMention[], at: number, from: number, to: number): string | null {
    let best: EntityMention | null = null;
    for (const m of mentions) {
        if (m.start < from || m.start >= to) continue;
        if (!best || Math.abs(m.start - at) < Math.abs(best.start - at)) best = m;
    }
    return best?.entity ?? null;
}

// -- Matching -----------------------------------------------------------------

const COMPARISON = /\b(contre|vs|versus|par rapport|compare|au lieu)\b/;

function distance(span: { start: number; end: number }, token: NumberToken): number {
    return span.start >= token.end ? span.start - token.end : Math.max(0, token.start - span.end);
}

function closeEnough(claim: NumberToken, value: number): boolean {
    const tolerance = 0.5 * 10 ** -claim.decimals + 1e-9;
    return Math.abs(value - claim.value) <= tolerance;
}

/** "en baisse de 8,3 %" quotes a change without its sign. */
function valueMatches(claim: NumberToken, fact: Fact): boolean {
    return closeEnough(claim, fact.value) || (/change_pct$/.test(fact.key) && closeEnough(claim, Math.abs(fact.value)));
}

interface Candidate {
    evidence: VerifiableEvidence;
    fact: Fact;
    denominator?: Fact;
}

function unitOk(claim: NumberToken, fact: Fact): boolean {
    return claim.unit === "pct" ? fact.unit === "pct" : fact.unit === "count";
}

function entityOk(claimEntity: string | null, fact: Fact): boolean {
    if (!claimEntity) return true;
    return !!fact.entity && fold(fact.entity) === fold(claimEntity);
}

function ratioCandidates(claim: NumberToken, evidence: VerifiableEvidence[]): Candidate[] {
    if (claim.unit !== "pct") return [];
    const out: Candidate[] = [];
    for (const ev of evidence) {
        const counts = ev.facts.filter((f) => f.unit === "count" && f.derived !== "length").slice(0, 120);
        for (const a of counts) {
            for (const b of counts) {
                if (a === b || b.value <= 0 || a.value > b.value) continue;
                if ((a.entity ?? "") !== (b.entity ?? "")) continue;
                if (closeEnough(claim, (a.value / b.value) * 100)) out.push({ evidence: ev, fact: a, denominator: b });
            }
        }
    }
    return out;
}

function reasonFor(status: ClaimStatus, claim: { period: ClaimPeriod | null; entity: string | null }, c: Candidate | null): string {
    switch (status) {
        case "unsupported":
            return "aucune source consultée ne contient ce chiffre";
        case "mismatch_period":
            return `la source porte sur ${describePeriod(c?.fact.period ?? null) ?? "une autre période"}, pas sur ${
                claim.period ? describeClaimPeriod(claim.period) : "la période annoncée"
            }`;
        case "mismatch_entity":
            return `ce chiffre concerne ${c?.fact.entity ?? "le total"}, pas ${claim.entity}`;
        case "mismatch_metric":
            return c?.denominator
                ? `ce pourcentage correspond à ${c.fact.key} / ${c.denominator.key}, pas à ce qu'affirme la phrase`
                : `ce chiffre correspond à « ${c?.fact.key} » dans la source, pas à ce qu'affirme la phrase`;
        case "ambiguous":
            return "chiffre présent dans plusieurs mesures des sources, sans indication de celle dont il s'agit";
        case "verified":
            return "";
    }
}

// -- Names --------------------------------------------------------------------

const NAME_STOP = new Set(
    "voici sur les le la pour ce cette ces aucun aucune il elle tu vous nous en au aux du des un une et mais donc si dans avec total resume projet mission client note rdv sdr point bilan chiffres taux semaine mois aujourd hier demain prochain prochains prochaine lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre confirme confirmes visio physique statut type date contact societe commercial commerciaux retour retours action actions vue agence".split(
        " ",
    ),
);

function nameCandidates(original: string): Array<{ start: number; end: number; raw: string }> {
    const out: Array<{ start: number; end: number; raw: string }> = [];
    const re = /(?<![\p{L}])(\p{Lu}[\p{Ll}'-]{2,})\s+(\p{Lu}[\p{Ll}'-]{2,})(?![\p{L}])/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(original))) {
        if (NAME_STOP.has(fold(m[1])) || NAME_STOP.has(fold(m[2]))) continue;
        out.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
    }
    return out;
}

// -- Entry point --------------------------------------------------------------

export function verifyAnswer(answer: string, evidence: VerifiableEvidence[], options: VerifyOptions): VerificationResult {
    const today = parisDay(options.now);
    const norm = normalizeKeepLength(answer);
    const lines = splitLines(answer, norm);
    const usable = evidence.filter((e) => e.status !== "ERROR");
    const byLabel = new Map(evidence.map((e) => [e.label, e]));

    // Citations
    const citedLabels: string[] = [];
    const invalidCitations: VerificationResult["invalidCitations"] = [];
    const citationRe = /\[(E\d{1,3})\]/g;
    let cm: RegExpExecArray | null;
    while ((cm = citationRe.exec(answer))) {
        if (byLabel.has(cm[1])) {
            if (!citedLabels.includes(cm[1])) citedLabels.push(cm[1]);
        } else invalidCitations.push({ label: cm[1], start: cm.index, end: cm.index + cm[0].length });
    }

    const periods = findPeriods(norm, today);
    const questionPeriod = findPeriods(normalizeKeepLength(options.question), today)[0]?.period ?? null;
    // Subjects only: a metric label ("RDV pris") is matched through the metric
    // vocabulary, never as the entity a figure must belong to.
    const entities = [
        ...new Set(usable.flatMap((e) => e.facts.map((f) => f.entity).filter((x): x is string => !!x && !isMetricLabel(x)))),
    ];
    const mentions = entityMentions(norm, entities);
    const allTerms = usable.flatMap((e) => e.facts.flatMap((f) => termsFor(f).flat()));

    const numbers: NumberClaimResult[] = [];
    for (const token of findNumbers(answer, norm)) {
        if (periods.some((p) => token.start >= p.start && token.start < p.end)) continue;
        const lineIndex = lines.findIndex((l) => token.start >= l.start && token.start <= l.end);
        const line = lines[lineIndex];
        const sentence = sentenceBounds(norm, token.start, line);
        const clause = clauseBounds(norm, token.start, sentence);

        // Period: the nearest one in the sentence that is not on the other side of
        // a comparison ("11 ce mois-ci contre 12 le mois dernier"), else the
        // latest one before, else the question's.
        const inSentence = periods
            .filter((p) => p.start >= sentence[0] && p.start < sentence[1])
            .filter((p) => {
                const between = p.start > token.end ? norm.slice(token.end, p.start) : norm.slice(p.end, token.start);
                return !COMPARISON.test(between);
            })
            .sort((a, b) => distance(a, token) - distance(b, token))[0];
        const before = [...periods].reverse().find((p) => p.end <= token.start);
        const period = inSentence?.period ?? before?.period ?? questionPeriod;

        const entity =
            nearestEntity(mentions, token.start, clause[0], clause[1]) ??
            (line.isTable ? nearestEntity(mentions, token.start, line.start, line.end) : null) ??
            nearestEntity(mentions, token.start, sentence[0], sentence[1]);

        const lineCitations = [...line.text.matchAll(/\[(E\d{1,3})\]/g)].map((x) => x[1]).filter((l) => byLabel.has(l));
        const cited = lineCitations.map((l) => byLabel.get(l)!).filter((e) => e.status !== "ERROR");
        const pool = cited.length > 0 ? cited : usable;

        const clauseText = norm.slice(clause[0], clause[1]);
        const wideText = [
            clauseText,
            norm.slice(sentence[0], sentence[1]),
            line.isTable ? tableHeaderCell(lines, lineIndex, token.start) : "",
            line.isList || line.isTable ? leadLine(lines, lineIndex) : "",
        ].join(" \u0000 ");

        const result = evaluate(token, { period, entity }, pool, clauseText, wideText, options.now, allTerms);
        // Cited the wrong source but another one supports it: still verified.
        const final =
            result.status !== "verified" && cited.length > 0
                ? (() => {
                      const retry = evaluate(token, { period, entity }, usable, clauseText, wideText, options.now, allTerms);
                      return retry.status === "verified" ? retry : result;
                  })()
                : result;

        numbers.push({
            kind: "number",
            token,
            sentence: answer.slice(sentence[0], sentence[1]).trim(),
            period,
            entity,
            citations: lineCitations,
            status: final.status,
            reason: reasonFor(final.status, { period, entity }, final.candidate),
            evidence: final.candidate?.evidence.label ?? null,
        });
    }

    // Dates and names: only when this turn holds payload text to compare with.
    const others: TokenClaimResult[] = [];
    const corpus = usable.flatMap((e) => e.strings ?? []);
    if (corpus.length > 0) {
        const knownDates = new Set<string>();
        for (const s of corpus) for (const d of findDates(normalizeKeepLength(s))) knownDates.add(d.key);
        for (const p of usable.map((e) => e.period).filter((x): x is EvidencePeriod => !!x)) {
            for (const iso of [p.from, p.to]) knownDates.add(`${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`);
        }
        knownDates.add(`${Number(today.slice(8, 10))}/${Number(today.slice(5, 7))}`);
        for (const d of findDates(normalizeKeepLength(options.question))) knownDates.add(d.key);

        for (const d of findDates(norm)) {
            if (periods.some((p) => d.start >= p.start && d.start < p.end)) {
                const p = periods.find((x) => d.start >= x.start && d.start < x.end)!;
                if (p.period.kind === "since") continue; // checked as a period
            }
            const ok = knownDates.has(d.key);
            others.push({
                kind: "date",
                start: d.start,
                end: d.end,
                raw: answer.slice(d.start, d.end),
                status: ok ? "verified" : "unsupported",
                reason: ok ? "" : "date absente des sources consultées",
            });
        }

        const haystack = fold([...corpus, options.question, ...options.knownNames].join(" \u0000 "));
        for (const n of nameCandidates(answer)) {
            const ok = haystack.includes(fold(n.raw));
            others.push({
                kind: "entity",
                start: n.start,
                end: n.end,
                raw: n.raw,
                status: ok ? "verified" : "unsupported",
                reason: ok ? "" : "nom absent des sources consultées",
            });
        }
    }

    const failedNumbers = numbers.filter((n) => n.status !== "verified").length;
    const failedOthers = others.filter((o) => o.status !== "verified").length;
    return {
        numbers,
        others,
        citedLabels,
        invalidCitations,
        checked: numbers.length + others.length,
        verified: numbers.length - failedNumbers + others.length - failedOthers,
        failed: failedNumbers + failedOthers,
    };
}

function evaluate(
    token: NumberToken,
    claim: { period: ClaimPeriod | null; entity: string | null },
    pool: VerifiableEvidence[],
    clauseText: string,
    wideText: string,
    now: Date,
    allTerms: string[],
): { status: ClaimStatus; candidate: Candidate | null } {
    const direct: Candidate[] = [];
    for (const ev of pool) {
        for (const fact of ev.facts) {
            if (valueMatches(token, fact) && unitOk(token, fact)) direct.push({ evidence: ev, fact });
        }
    }
    const candidates = [...direct, ...ratioCandidates(token, pool)];
    if (candidates.length === 0) return { status: "unsupported", candidate: null };

    const failures: Array<{ status: ClaimStatus; candidate: Candidate }> = [];
    const passing: Candidate[] = [];
    const contextHasMetricWords = allTerms.some((t) => clauseText.includes(t));

    for (const c of candidates) {
        const periods = [c.fact.period, c.denominator?.period ?? null];
        if (!periods.every((p) => periodCompatible(claim.period, p, now))) {
            failures.push({ status: "mismatch_period", candidate: c });
            continue;
        }
        if (!entityOk(claim.entity, c.fact)) {
            failures.push({ status: "mismatch_entity", candidate: c });
            continue;
        }
        const groups = c.denominator ? [...termsFor(c.fact), ...termsFor(c.denominator)] : termsFor(c.fact);
        // An entity row's label ("MEETING_BOOKED", "Julie Martin") also names the metric.
        const entityNamed = !!c.fact.entity && wideText.includes(fold(c.fact.entity));
        // …and a row labelled "RDV pris" is the metric itself, whatever its key says.
        const labelIsMetric = entityNamed && isMetricLabel(c.fact.entity!);
        if (matchesTerms(groups, clauseText) || matchesTerms(groups, wideText) || labelIsMetric || (entityNamed && groups.length === 0)) {
            passing.push(c);
            continue;
        }
        failures.push({ status: contextHasMetricWords ? "mismatch_metric" : "ambiguous", candidate: c });
    }

    if (passing.length > 0) return { status: "verified", candidate: passing[0] };

    // No metric word at all, but exactly one fact could be meant: accept it —
    // value, unit, period and entity have already been checked.
    const ambiguous = failures.filter((f) => f.status === "ambiguous");
    const distinct = new Set(ambiguous.map((f) => `${f.candidate.evidence.label}:${f.candidate.fact.path}`));
    if (ambiguous.length > 0 && distinct.size === 1 && failures.every((f) => f.status === "ambiguous")) {
        return { status: "verified", candidate: ambiguous[0].candidate };
    }

    const order: ClaimStatus[] = ["mismatch_period", "mismatch_entity", "mismatch_metric", "ambiguous"];
    for (const status of order) {
        const hit = failures.find((f) => f.status === status);
        if (hit) return hit;
    }
    return { status: "unsupported", candidate: null };
}

/** Failed claims in the shape the contract and the repair prompt use. */
export function unverifiedClaims(result: VerificationResult): UnverifiedClaim[] {
    const claims: UnverifiedClaim[] = [];
    for (const n of result.numbers) {
        if (n.status === "verified") continue;
        claims.push({ kind: "number", text: `${n.token.raw} — « ${n.sentence.slice(0, 160)} »`, reason: n.reason });
    }
    for (const o of result.others) {
        if (o.status === "verified") continue;
        claims.push({ kind: o.kind, text: o.raw, reason: o.reason });
    }
    for (const c of result.invalidCitations) {
        claims.push({ kind: "citation", text: `[${c.label}]`, reason: "source inexistante, retirée" });
    }
    return claims;
}
