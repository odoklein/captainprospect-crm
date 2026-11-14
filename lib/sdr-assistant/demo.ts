// ============================================
// SDR ASSISTANT — development demo model (server-only).
//
// Enabled ONLY with SDR_ASSISTANT_DEMO=1 and never when NODE_ENV=production.
// It replaces the language model and nothing else: the route, the guard, the
// four SDR tools, the evidence ledger, the confirmation card and the
// conversation storage all run for real, on the signed-in user's real data.
// The "model" picks a tool from keywords and writes the answer from the
// tool's JSON, so the panel can be developed and tested without an OpenAI or
// DeepSeek key. Every answer it writes says it is a demo.
//
// Test hooks (dev only): a message containing « [demo:erreur] » fails once
// (to exercise error + retry); « [demo:lent] » streams slowly (to exercise
// Stop).
// ============================================

import type { ChatCallRequest, ChatCallResponse, ChatMessage, ToolCall } from "@/lib/ai/providers/types";
import { EMPTY_USAGE } from "@/lib/ai/providers/types";
import { ProviderError } from "@/lib/ai/providers/errors";
import { runtimeEnv } from "@/lib/runtime-config/env";
import type { FollowUpsResult, NextCallResult, TodayOutreachResult } from "./data";

/** The explicit development setting. Off in production whatever the variable says. */
export function isSdrAssistantDemo(): boolean {
    return runtimeEnv("SDR_ASSISTANT_DEMO") === "1" && process.env.NODE_ENV !== "production";
}

export const DEMO_MODEL = "demo-sdr";
const DEMO_NOTE = "\n\n*Réponse de démonstration (modèle simulé, données réelles du CRM).*";

const failedOnce = new Set<string>();

type Intent =
    | { tool: "sdr_list_follow_ups"; args: Record<string, unknown> }
    | { tool: "sdr_prepare_next_call"; args: Record<string, unknown> }
    | { tool: "sdr_today_outreach"; args: Record<string, unknown> }
    | { tool: "reschedule" }
    | { tool: null };

function normalize(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function demoIntent(question: string): Intent {
    const q = normalize(question);
    if (/\b(report|decal|deplac)/.test(q) && /\brappel/.test(q)) return { tool: "reschedule" };
    if (/(prochain appel|prepar|brief|appel avec|appeler)/.test(q)) {
        const named = /(?:avec|appeler)\s+([^?.,!]{2,60})/i.exec(question)?.[1]?.trim();
        const search = named && !/^(le|la|mon|ma|mes|qui)\b/i.test(named) ? named : undefined;
        return { tool: "sdr_prepare_next_call", args: search ? { search } : {} };
    }
    if (/(rappel|relanc|follow|suivi|attente)/.test(q)) {
        return { tool: "sdr_list_follow_ups", args: { window: /semaine|7 jours|a venir/.test(q) ? "next_7_days" : "overdue_and_today" } };
    }
    if (/(aujourd|journee|bilan|activite|outreach|prochaines actions|recap|quoi faire|que faire)/.test(q)) {
        return { tool: "sdr_today_outreach", args: {} };
    }
    return { tool: null };
}

/** Messages the runtime adds itself: the turn context and the verifier's rewrite request. */
const RUNTIME_MESSAGE = /^(\[Contexte|Vérification automatique)/;

function lastUserQuestion(messages: ChatMessage[]): { question: string; index: number } {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === "user" && !RUNTIME_MESSAGE.test(m.content)) return { question: m.content, index: i };
    }
    return { question: "", index: -1 };
}

function toolResults(messages: ChatMessage[], after: number): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (let i = after + 1; i < messages.length; i++) {
        const m = messages[i];
        if (m.role !== "tool") continue;
        try {
            const parsed = JSON.parse(m.content) as { tool?: string; data?: unknown; error?: { message?: string } };
            if (parsed.tool) out.set(parsed.tool, parsed.error ? { error: parsed.error.message ?? "erreur" } : parsed.data);
        } catch {
            // ignore a malformed payload
        }
    }
    return out;
}

const link = (name: string, href: string | null | undefined) => (href ? `[${name}](${href})` : name);

function writeFollowUps(r: FollowUpsResult): string {
    if (r.rappels.length === 0) {
        return `Aucun rappel en retard ni prévu aujourd'hui. ${r.aVenir > 0 ? `${r.aVenir} rappel(s) à venir cette semaine.` : ""}\n\nVoir la page [Rappels](${r.pageRappels}).`;
    }
    const head = `**${r.enRetard} en retard · ${r.aujourdhui} aujourd'hui** (${r.aVenir} à venir).`;
    const lines = r.rappels.map((c) => {
        const late = c.joursDeRetard ? ` — en retard de ${c.joursDeRetard} j` : "";
        const meta = [c.company, c.mission].filter(Boolean).join(" · ");
        return `- ${link(c.prospect, c.link)}${meta ? ` (${meta})` : ""} : ${c.when ?? "sans date"}${late}${c.note ? `\n  « ${c.note} »` : ""}`;
    });
    return `${head}\n\n${lines.join("\n")}\n\nCommencez par les plus anciens : un rappel dépassé de plusieurs jours refroidit vite. Tout est aussi sur la page [Rappels](${r.pageRappels}).\n\n:::suivi\n- Prépare mon appel avec ${r.rappels[0].prospect}\n- Reporte le premier rappel à demain 10h\n:::`;
}

function writeNextCall(r: NextCallResult): string {
    if (!r.trouve || !r.prospect) return `${r.raison ?? "Aucun prospect trouvé."}\n\nOuvrir la [file d'actions](${r.pageFile}).`;
    const p = r.prospect;
    const m = r.mission;
    const hist = r.historique ?? [];
    const parts = [
        `**${link(p.nom, p.lien)}**${p.poste ? `, ${p.poste}` : ""} chez ${link(p.societe, p.lienSociete)}${p.secteur ? ` (${p.secteur})` : ""}.`,
        `Pourquoi maintenant : ${r.pourquoiMaintenant}. Mission : ${m?.nom ?? "—"}.`,
        "",
        "**Historique**",
        hist.length
            ? hist.slice(0, 3).map((h) => `- ${h.date} · ${h.statut}${h.note ? ` — « ${h.note} »` : ""}`).join("\n")
            : "- Premier contact : aucun échange enregistré.",
        "",
        "**Accroche**",
        m?.pitch ? `- « ${m.pitch} »` : "- Pas de pitch renseigné sur la mission : présentez l'objectif de l'appel en une phrase.",
    ];
    if (!p.aDesCoordonnees) parts.push("", "⚠️ Aucune coordonnée exploitable sur la fiche : enrichissez-la avant d'appeler.");
    parts.push("", `${r.resteDansLaFile ?? 0} autre(s) prospect(s) dans votre [file d'actions](${r.pageFile}).`);
    parts.push("", ":::suivi\n- Quels rappels sont en retard ?\n- Fais le bilan de ma journée\n:::");
    return parts.join("\n");
}

function writeOutreach(r: TodayOutreachResult): string {
    const head = `**${r.actionsAujourdhui} action(s) aujourd'hui** : ${r.appels} appel(s), ${r.emails} email(s), ${r.linkedin} LinkedIn · ${r.rdvPris} RDV pris.`;
    const families = r.parResultat.length ? r.parResultat.map((f) => `${f.famille} : ${f.nombre}`).join(" · ") : "aucun résultat enregistré";
    const recs = r.prochainesActions.map((rec, i) => {
        const who = rec.prospects.length ? ` — ${rec.prospects.map((p) => link(p.name, p.link)).join(", ")}` : "";
        return `${i + 1}. ${rec.action} (${rec.reason})${who}`;
    });
    const latest = r.actions.slice(0, 5).map((a) => `- ${a.heure} · ${a.canal} · ${link(a.prospect, a.lien)} : ${a.statut}`);
    return [
        head,
        families,
        r.rappelsEnRetard + r.rappelsAujourdhui > 0 ? `Rappels : ${r.rappelsEnRetard} en retard, ${r.rappelsAujourdhui} prévus aujourd'hui.` : null,
        "",
        "**Prochaines actions**",
        recs.length ? recs.join("\n") : "Rien d'urgent : continuez la file d'actions.",
        latest.length ? "\n**Dernières actions**" : null,
        latest.length ? latest.join("\n") : null,
        "\n:::suivi\n- Quels rappels sont en retard ?\n- Prépare mon prochain appel\n:::",
    ]
        .filter((x) => x !== null)
        .join("\n");
}

const HELP = `Je peux, sur vos propres données :
- lister les **rappels et relances** en retard ou prévus aujourd'hui ;
- **préparer votre prochain appel** (ou celui d'un prospect que vous nommez) ;
- faire le **bilan de votre journée** et proposer les prochaines actions ;
- **reporter un rappel**, après votre confirmation.

Je ne peux pas appeler, envoyer d'email ni modifier une fiche.

:::suivi
- Quels prospects attendent une relance ?
- Prépare mon prochain appel
:::`;

function tomorrowAtTen(now = new Date()): string {
    const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    paris.setDate(paris.getDate() + 1);
    const y = paris.getFullYear();
    const mo = String(paris.getMonth() + 1).padStart(2, "0");
    const d = String(paris.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}T10:00`;
}

async function stream(text: string, request: ChatCallRequest, slow: boolean): Promise<void> {
    const chunks = text.match(/\S+\s*/g) ?? [text];
    const delay = slow ? 120 : 12;
    for (const chunk of chunks) {
        if (request.signal?.aborted) throw request.signal.reason ?? new Error("aborted");
        request.onTextDelta?.(chunk);
        await new Promise((r) => setTimeout(r, delay));
    }
}

function respond(text: string | null, toolCalls: ToolCall[] = []): ChatCallResponse {
    return {
        text,
        toolCalls,
        usage: EMPTY_USAGE,
        model: DEMO_MODEL,
        provider: "openai",
        finish: toolCalls.length ? "tool_calls" : "stop",
    };
}

let callSeq = 0;
const call = (name: string, args: Record<string, unknown>): ToolCall => ({
    id: `demo_${++callSeq}`,
    name,
    arguments: JSON.stringify(args),
});

/** The scripted model. Same signature as the providers' ChatFn. */
export async function demoChat(request: ChatCallRequest): Promise<ChatCallResponse> {
    const { question, index } = lastUserQuestion(request.messages);
    const slow = question.includes("[demo:lent]");

    if (question.includes("[demo:erreur]")) {
        const key = `${request.cacheKey ?? ""}:${question}`;
        if (!failedOnce.has(key)) {
            failedOnce.add(key);
            throw new ProviderError("demo_failure", "demo failure", 503, "Le service d'IA (démo) n'a pas répondu. Réessayez.", {
                kind: "server",
                retryable: false,
            });
        }
    }

    const results = toolResults(request.messages, index);
    const intent = demoIntent(question);
    // The runtime may ask for a final answer with tools disabled: always write then.
    const canCall = (request.tools?.length ?? 0) > 0 && request.toolChoice !== "none";

    if (results.size === 0 && canCall && intent.tool) {
        if (intent.tool === "reschedule") return respond(null, [call("sdr_list_follow_ups", { window: "all", limit: 5 })]);
        return respond(null, [call(intent.tool, intent.args)]);
    }

    if (intent.tool === "reschedule") {
        const list = results.get("sdr_list_follow_ups") as FollowUpsResult | undefined;
        const first = list?.rappels?.[0];
        if (first && canCall && !results.has("sdr_reschedule_follow_up")) {
            return respond(null, [call("sdr_reschedule_follow_up", { callbackId: first.callbackId, newDate: tomorrowAtTen() })]);
        }
        const text = first ? "Voici le report que je propose :" : "Vous n'avez aucun rappel en attente à reporter.";
        await stream(text, request, slow);
        return respond(text);
    }

    let text = HELP;
    const followUps = results.get("sdr_list_follow_ups") as FollowUpsResult | { error: string } | undefined;
    const nextCall = results.get("sdr_prepare_next_call") as NextCallResult | { error: string } | undefined;
    const outreach = results.get("sdr_today_outreach") as TodayOutreachResult | { error: string } | undefined;
    const failed = [followUps, nextCall, outreach].find((r) => r && "error" in r) as { error: string } | undefined;
    if (failed) text = `Je n'ai pas pu lire vos données : ${failed.error}`;
    else if (followUps) text = writeFollowUps(followUps as FollowUpsResult);
    else if (nextCall) text = writeNextCall(nextCall as NextCallResult);
    else if (outreach) text = writeOutreach(outreach as TodayOutreachResult);

    // The follow-ups block stays last: the demo note goes before it.
    const fence = text.indexOf(":::suivi");
    text = fence >= 0 ? `${text.slice(0, fence).trimEnd()}${DEMO_NOTE}\n\n${text.slice(fence)}` : `${text}${DEMO_NOTE}`;
    await stream(text, request, slow);
    return respond(text);
}
