// ============================================
// NOTE-TAKERS — ProviderMeeting → the call shape the wizard already knows
// (lib/leexi/normalize). Pure, no I/O: npm run test:notetakers.
//
// Leexi separates our people from the client's; the other providers give one
// list of attendees. Our people are told apart here (agency email domain or a
// CRM user's name), the rest becomes « customers », and Leexi's normalizer
// does the bot filtering, the company guess and the match keys.
// ============================================

import {
    emailDomain,
    personKey,
    toLeexiCallDetail,
    toLeexiCallSummary,
    type LeexiCallDetail,
    type LeexiCallSummary,
    type NormalizeContext,
    type RawLeexiCall,
} from "@/lib/leexi/normalize";
import type { ProviderMeeting } from "./types";

function toRaw(m: ProviderMeeting, ctx: NormalizeContext): RawLeexiCall {
    const internal = new Set(ctx.internalDomains.map((d) => d.toLowerCase()));
    const ourNames = new Set((ctx.internalNames ?? []).map(personKey).filter(Boolean));
    const isOurs = (p: { name: string; email: string | null }) => {
        const d = emailDomain(p.email);
        return (d !== null && internal.has(d)) || ourNames.has(personKey(p.name));
    };
    const host = m.host && (m.host.name || m.host.email) ? m.host : null;
    const people = m.attendees.filter((p) => !(host && p.email && host.email && p.email.toLowerCase() === host.email.toLowerCase()));
    return {
        uuid: m.id,
        title: m.title,
        performed_at: m.date,
        duration: m.durationSec,
        leexi_url: m.url,
        summary: m.summary ?? "",
        simple_transcript: m.transcript ?? "",
        owner: host ? { name: host.name || host.email, email: host.email } : null,
        participating_users: people.filter(isOurs).map((p) => ({ name: p.name || p.email, email: p.email })),
        customers: people.filter((p) => !isOurs(p)).map((p) => ({ name: p.name, email: p.email })),
        tasks: (m.actionItems ?? []).map((subject) => ({ subject })),
    };
}

export function toCallSummary(m: ProviderMeeting, ctx: NormalizeContext): LeexiCallSummary {
    const summary = toLeexiCallSummary(toRaw(m, ctx), ctx);
    // A list endpoint that doesn't return notes says nothing about them: no « Sans résumé » badge.
    return m.summary === undefined ? { ...summary, hasSummary: true } : summary;
}

export function toCallDetail(m: ProviderMeeting, ctx: NormalizeContext): LeexiCallDetail {
    return toLeexiCallDetail(toRaw(m, ctx), ctx);
}

/** "Speaker: text" lines, consecutive turns of one speaker merged. */
export function transcriptLines(turns: Array<{ speaker: string; text: string }>): string {
    const out: Array<{ speaker: string; text: string }> = [];
    for (const t of turns) {
        const text = t.text.trim();
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.speaker === t.speaker) last.text += ` ${text}`;
        else out.push({ speaker: t.speaker, text });
    }
    return out.map((t) => (t.speaker ? `${t.speaker} : ${t.text}` : t.text)).join("\n");
}
