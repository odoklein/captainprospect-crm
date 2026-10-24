/**
 * Weekly client bilan — text rendering (pure, npm run test:weekly-bilan).
 *
 * The client portal shows a session CR as raw text (a <pre>), so the markdown
 * must read well unrendered: headings and bullets, never tables. Every number
 * comes from the stats block; the AI only writes prose around it, and
 * findUnverifiedNumbers flags any figure it may have invented.
 */

export interface WeeklyBilanMeeting {
    company: string;
    contactTitle: string | null;
    at: string | null;
    missionName: string;
}

export interface WeeklyBilanStats {
    calls: number;
    previousCalls: number;
    conversations: number;
    meetings: number;
    meetingsConfirmed: number;
    meetingsPending: number;
    prospects: number;
    /** Below this many calls a rate is not shown. */
    lowVolume: boolean;
}

export interface WeeklyBilanData {
    clientId: string;
    clientName: string;
    week: { start: string; end: string; label: string };
    stats: WeeklyBilanStats;
    meetings: WeeklyBilanMeeting[];
    highlights: string[];
    /** Call notes, AI context only — never printed. */
    notes: string[];
}

export interface BilanNarrative {
    synthese: string;
    pointsForts: string[];
    vigilance: string[];
    prochainesEtapes: string[];
}

const fmtInt = (n: number) => n.toLocaleString("fr-FR");

function pct(a: number, b: number): string | null {
    if (b <= 0) return null;
    return `${(Math.round((a / b) * 1000) / 10).toLocaleString("fr-FR")} %`;
}

export function formatMeetingAt(iso: string | null): string {
    if (!iso) return "date à confirmer";
    const d = new Date(iso);
    const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
    const time = d
        .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
        .replace(":", " h ")
        .replace(/ h 00$/, " h");
    return `${day} à ${time}`;
}

/** The figures block — also what the AI is allowed to quote. */
export function renderStatsLines(s: WeeklyBilanStats): string[] {
    const lines = [`- Appels passés : ${fmtInt(s.calls)} (semaine précédente : ${fmtInt(s.previousCalls)})`];
    if (s.lowVolume) {
        lines.push(`- Conversations : ${fmtInt(s.conversations)} (volume trop faible pour un taux fiable)`);
    } else {
        lines.push(`- Conversations : ${fmtInt(s.conversations)}, soit ${pct(s.conversations, s.calls)} des appels`);
    }
    const detail =
        s.meetingsPending > 0
            ? ` (${fmtInt(s.meetingsConfirmed)} confirmés, ${fmtInt(s.meetingsPending)} en attente de confirmation)`
            : "";
    lines.push(`- Rendez-vous pris : ${fmtInt(s.meetings)}${detail}`);
    if (!s.lowVolume && s.conversations > 0) {
        lines.push(`- Taux de transformation : ${pct(s.meetings, s.conversations)} des conversations`);
    }
    lines.push(`- Prospects contactés : ${fmtInt(s.prospects)}`);
    return lines;
}

const TODO = "À rédiger.";

function bullets(items: string[] | undefined): string {
    return items && items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${TODO}`;
}

export function renderBilanMarkdown(d: WeeklyBilanData, ai: BilanNarrative | null, aiUnavailable?: string): string {
    const todo = aiUnavailable ? `${TODO} (synthèse IA indisponible : ${aiUnavailable})` : TODO;
    const meetings = d.meetings.length
        ? d.meetings
              .map((m) => `- ${m.company}${m.contactTitle ? `, ${m.contactTitle}` : ""} : RDV le ${formatMeetingAt(m.at)}`)
              .join("\n")
        : "- Aucun rendez-vous confirmé cette semaine.";

    return [
        `# Bilan hebdomadaire — ${d.clientName}`,
        d.week.label,
        "",
        "## En bref",
        ai?.synthese?.trim() || todo,
        "",
        "## Les chiffres de la semaine",
        ...renderStatsLines(d.stats),
        "",
        "## Rendez-vous obtenus",
        meetings,
        "",
        "## Ce qui a bien fonctionné",
        ai ? bullets(ai.pointsForts) : `- ${todo}`,
        "",
        "## Points de vigilance",
        ai ? bullets(ai.vigilance) : `- ${todo}`,
        "",
        "## Prochaines étapes",
        ai ? bullets(ai.prochainesEtapes) : `- ${todo}`,
        "",
    ].join("\n");
}

/** Plain-text e-mail version, to paste or send. */
export function renderBilanEmail(d: WeeklyBilanData, ai: BilanNarrative | null): string {
    const lines = [
        "Bonjour,",
        "",
        `Voici le bilan de la semaine (${d.week.label.replace(/^Semaine du /, "du ")}).`,
        "",
    ];
    if (ai?.synthese) lines.push(ai.synthese.trim(), "");
    lines.push(...renderStatsLines(d.stats).map((l) => l.replace(/^- /, "• ")), "");
    if (d.meetings.length) {
        lines.push("Rendez-vous obtenus :");
        lines.push(...d.meetings.map((m) => `• ${m.company} — ${formatMeetingAt(m.at)}`), "");
    }
    if (ai?.prochainesEtapes?.length) {
        lines.push("Prochaines étapes :", ...ai.prochainesEtapes.map((s) => `• ${s}`), "");
    }
    lines.push("Le détail est disponible sur votre espace client.", "", "Bonne fin de semaine,");
    return lines.join("\n");
}

/** Numbers in `text` (French formats "7,3", "1 204", "23 %") absent from the allowed set. */
export function findUnverifiedNumbers(text: string, allowed: Iterable<string | number>): string[] {
    const norm = (v: string) => v.replace(/[\s  ]/g, "").replace(",", ".").replace(/\.0+$/, "");
    const ok = new Set<string>();
    for (const a of allowed) ok.add(norm(String(a)));
    const found = text.match(/\d{1,3}(?:[\s  ]\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? [];
    const out: string[] = [];
    for (const raw of found) {
        const n = norm(raw);
        // Small ordinal-like numbers (1, 2, 3) are prose, not statistics.
        if (Number(n) <= 3 && !n.includes(".")) continue;
        if (!ok.has(n) && !out.includes(raw.trim())) out.push(raw.trim());
    }
    return out;
}

/** Every figure the bilan is allowed to state. */
export function allowedNumbers(d: WeeklyBilanData): string[] {
    const s = d.stats;
    const values: Array<string | number> = [
        s.calls,
        s.previousCalls,
        s.conversations,
        s.meetings,
        s.meetingsConfirmed,
        s.meetingsPending,
        s.prospects,
    ];
    for (const line of renderStatsLines(s)) for (const m of line.match(/\d+(?:,\d+)?/g) ?? []) values.push(m);
    for (const word of `${d.week.label} ${d.week.start} ${d.week.end}`.match(/\d+/g) ?? []) values.push(word);
    for (const m of d.meetings) for (const n of formatMeetingAt(m.at).match(/\d+/g) ?? []) values.push(n);
    return values.map(String);
}
