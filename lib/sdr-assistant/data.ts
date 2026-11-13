// ============================================
// SDR ASSISTANT — scoped data loaders (server-only).
//
// What the SDR assistant panel may read, and only for the signed-in user:
//
//   loadFollowUps     their own pending callbacks / relances — the Rappels
//                     page rules: callback statuses of the effective config,
//                     superseded by any newer action on the same prospect
//   loadNextCall      the prospect at the top of their File d'actions (the
//                     queue's own eligibility and mission scope), or one they
//                     name, with history and mission pitch for the call
//   loadTodayOutreach what they logged today (Paris day), with recommended
//                     next actions computed from the rows
//
// Every query takes the user id from the session context, never from the
// model's arguments. Rows carry `/sdr/...` links so the answer can point at
// the record.
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import { loadActionQueue, type ActionQueueItem } from "@/lib/sdr-queue/load-action-queue";
import { collectBriefInput } from "@/lib/sdr-assistant/brief";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import {
    companyPath,
    contactPath,
    daysLate,
    excerpt,
    familyCounts,
    followUpBucket,
    frWhen,
    recommendNextActions,
    startOfParisDay,
    type OutreachRow,
} from "./signals";
import { OUTCOME_META } from "@/lib/manager-home/outcomes";

const DEFAULT_CALLBACK_CODES = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"];

/** Result code → label, from the effective (global) status config, then the built-in labels. */
async function resultLabels(): Promise<(code: string) => string> {
    let configured = new Map<string, string>();
    try {
        const cfg = await statusConfigService.getEffectiveStatusConfig({});
        configured = new Map(cfg.statuses.map((s) => [s.code, s.label]));
    } catch {
        // Built-in labels are enough to answer.
    }
    return (code) => configured.get(code) ?? ACTION_RESULT_LABELS[code] ?? code;
}

async function callbackCodes(): Promise<string[]> {
    const codes = new Set(DEFAULT_CALLBACK_CODES);
    try {
        const cfg = await statusConfigService.getEffectiveStatusConfig({});
        for (const s of cfg.statuses) if (s.triggersCallback) codes.add(s.code);
    } catch {
        // Defaults.
    }
    return [...codes];
}

function personName(contact: { firstName: string | null; lastName: string | null } | null | undefined): string | null {
    if (!contact) return null;
    const n = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    return n || null;
}

// ── Follow-ups ───────────────────────────────────────────────────────────────

export interface FollowUpItem {
    callbackId: string;
    prospect: string;
    company: string | null;
    link: string | null;
    mission: string | null;
    client: string | null;
    when: string | null;
    joursDeRetard: number | null;
    statut: string;
    note: string | null;
}

export interface FollowUpsResult {
    enRetard: number;
    aujourdhui: number;
    aVenir: number;
    sansDate: number;
    rappels: FollowUpItem[];
    pageRappels: string;
}

export async function loadFollowUps(
    userId: string,
    options: { window?: "overdue_and_today" | "next_7_days" | "all"; limit?: number },
    now = new Date(),
): Promise<FollowUpsResult> {
    const codes = await callbackCodes();
    const label = await resultLabels();
    const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    const rows = await prisma.action.findMany({
        where: { sdrId: userId, result: { in: codes as never[] } },
        orderBy: [{ callbackDate: "asc" }, { createdAt: "desc" }],
        take: 500,
        select: {
            id: true,
            result: true,
            note: true,
            callbackDate: true,
            createdAt: true,
            contact: { select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } } },
            company: { select: { id: true, name: true } },
            campaign: { select: { mission: { select: { name: true, client: { select: { name: true } } } } } },
        },
    });
    if (rows.length === 0) {
        return { enRetard: 0, aujourdhui: 0, aVenir: 0, sansDate: 0, rappels: [], pageRappels: "/sdr/callbacks" };
    }

    // Same rule as GET /api/sdr/callbacks: a newer action on the prospect closes the callback.
    const superseded = await prisma.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM "Action" a
        WHERE a.id IN (${Prisma.join(rows.map((r) => r.id))})
        AND (
            (a."contactId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Action" b WHERE b."contactId" = a."contactId" AND b."createdAt" > a."createdAt"))
            OR
            (a."companyId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Action" b WHERE b."companyId" = a."companyId" AND b."createdAt" > a."createdAt"))
        )
    `;
    const closed = new Set(superseded.map((r) => r.id));
    const pending = rows.filter((r) => !closed.has(r.id));

    const counts = { overdue: 0, today: 0, upcoming: 0, undated: 0 };
    const items: Array<FollowUpItem & { bucket: string; at: number }> = [];
    for (const r of pending) {
        const bucket = followUpBucket(r.callbackDate, now);
        counts[bucket] += 1;
        const companyName = r.contact?.company?.name ?? r.company?.name ?? null;
        const contactId = r.contact?.id ?? null;
        const companyId = r.contact?.company?.id ?? r.company?.id ?? null;
        items.push({
            callbackId: r.id,
            prospect: personName(r.contact) ?? companyName ?? "Prospect",
            company: personName(r.contact) ? companyName : null,
            link: contactId ? contactPath(contactId) : companyId ? companyPath(companyId) : null,
            mission: r.campaign?.mission?.name ?? null,
            client: r.campaign?.mission?.client?.name ?? null,
            when: frWhen(r.callbackDate, now),
            joursDeRetard: bucket === "overdue" && r.callbackDate ? daysLate(r.callbackDate, now) : null,
            statut: label(r.result),
            note: excerpt(r.note, 180),
            bucket,
            at: r.callbackDate?.getTime() ?? Number.MAX_SAFE_INTEGER,
        });
    }

    const window = options.window ?? "overdue_and_today";
    const selected = items.filter((i) => {
        if (window === "all") return true;
        if (window === "overdue_and_today") return i.bucket === "overdue" || i.bucket === "today";
        return i.bucket !== "undated" && i.at <= horizon.getTime();
    });
    selected.sort((a, b) => a.at - b.at);
    const limit = Math.min(Math.max(options.limit ?? 15, 1), 30);

    return {
        enRetard: counts.overdue,
        aujourdhui: counts.today,
        aVenir: counts.upcoming,
        sansDate: counts.undated,
        rappels: selected.slice(0, limit).map((item) => {
            const { bucket, at, ...rest } = item;
            void bucket;
            void at;
            return rest;
        }),
        pageRappels: "/sdr/callbacks",
    };
}

// ── Next call ────────────────────────────────────────────────────────────────

export interface NextCallResult {
    trouve: boolean;
    raison?: string;
    prospect?: {
        nom: string;
        poste: string | null;
        societe: string;
        secteur: string | null;
        taille: string | null;
        lien: string;
        lienSociete: string;
        aDesCoordonnees: boolean;
    };
    mission?: { nom: string; objectif: string | null; pitch: string | null; cible: string | null; script: string | null };
    pourquoiMaintenant?: string;
    historique?: Array<{ date: string; statut: string; note: string | null; resume: string | null }>;
    resteDansLaFile?: number;
    pageFile: string;
}

function whyNow(item: ActionQueueItem, label: (c: string) => string): string {
    if (item.priority === "ABSENT_RDV") return "RDV non honoré à replanifier";
    const q = item.qualification as { reasons?: Array<{ label?: string }> } | null;
    const reason = q?.reasons?.find((r) => r.label)?.label;
    if (item.lastAction?.callbackDate) return `rappel prévu (${label(item.lastAction.result)})`;
    if (item.lastAction) return reason ?? `dernier statut : ${label(item.lastAction.result)}`;
    return reason ?? "premier contact";
}

function matches(item: ActionQueueItem, needle: string): boolean {
    const hay = [item.contact?.firstName, item.contact?.lastName, item.company.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return needle
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((part) => hay.includes(part));
}

export async function loadNextCall(userId: string, role: string, search?: string | null): Promise<NextCallResult> {
    const needle = search?.trim() || null;
    const queue = await loadActionQueue({ sdrId: userId, role, search: needle });
    const items = queue.items.filter((i) => i.channel === "CALL" || !i.channel);
    const pool = items.length > 0 ? items : queue.items;
    const item = needle ? pool.find((i) => matches(i, needle)) ?? pool[0] : pool[0];

    if (!item) {
        return {
            trouve: false,
            raison: needle
                ? `Aucun prospect « ${needle} » dans votre file d'actions du jour (missions de votre planning).`
                : queue.paused
                  ? "La file est vide pour l'instant : les prospects appelés récemment sont en pause 24 h."
                  : "Votre file d'actions est vide : aucune mission planifiée aujourd'hui ou plus aucun prospect éligible.",
            pageFile: "/sdr/action",
        };
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: item.campaignId }, select: { missionId: true } });
    const input = campaign
        ? await collectBriefInput({ contactId: item.contactId, companyId: item.companyId, missionId: campaign.missionId })
        : null;
    const label = await resultLabels();
    const name = personName(item.contact) ?? item.company.name;

    return {
        trouve: true,
        prospect: {
            nom: name,
            poste: item.contact?.title ?? null,
            societe: item.company.name,
            secteur: item.company.industry ?? null,
            taille: item.company.size ?? null,
            lien: item.contactId ? contactPath(item.contactId) : companyPath(item.companyId),
            lienSociete: companyPath(item.companyId),
            aDesCoordonnees: !!item.hasContactInfo,
        },
        mission: input
            ? {
                  nom: input.mission.name,
                  objectif: input.mission.objective,
                  pitch: excerpt(input.mission.offer, 600),
                  cible: excerpt(input.mission.target, 300),
                  script: excerpt(input.mission.script, 600),
              }
            : { nom: item.missionName ?? "Mission", objectif: null, pitch: null, cible: null, script: null },
        pourquoiMaintenant: whyNow(item, label),
        historique: (input?.history ?? []).map((h) => ({
            date: h.date,
            statut: h.status,
            note: excerpt(h.note, 200),
            resume: excerpt(h.summary, 300),
        })),
        resteDansLaFile: Math.max(0, pool.length - 1),
        pageFile: "/sdr/action",
    };
}

// ── Today's outreach ─────────────────────────────────────────────────────────

export interface TodayOutreachResult {
    actionsAujourdhui: number;
    appels: number;
    emails: number;
    linkedin: number;
    rdvPris: number;
    parResultat: Array<{ famille: string; nombre: number }>;
    rappelsEnRetard: number;
    rappelsAujourdhui: number;
    actions: Array<{ heure: string; canal: string; prospect: string; lien: string | null; statut: string; note: string | null }>;
    prochainesActions: ReturnType<typeof recommendNextActions>;
}

export async function loadTodayOutreach(userId: string, now = new Date()): Promise<TodayOutreachResult> {
    const since = startOfParisDay(now);
    const [rows, label, followUps] = await Promise.all([
        prisma.action.findMany({
            where: { sdrId: userId, createdAt: { gte: since } },
            orderBy: { createdAt: "desc" },
            take: 300,
            select: {
                result: true,
                channel: true,
                note: true,
                createdAt: true,
                confirmationStatus: true,
                contact: { select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } } },
                company: { select: { id: true, name: true } },
            },
        }),
        resultLabels(),
        loadFollowUps(userId, { window: "overdue_and_today", limit: 1 }, now),
    ]);

    const outreach: OutreachRow[] = rows.map((r) => {
        const company = r.contact?.company?.name ?? r.company?.name ?? null;
        const person = personName(r.contact);
        const contactId = r.contact?.id ?? null;
        const companyId = r.contact?.company?.id ?? r.company?.id ?? null;
        return {
            result: r.result,
            channel: r.channel,
            who: person ? (company ? `${person} · ${company}` : person) : company ?? "Prospect",
            link: contactId ? contactPath(contactId) : companyId ? companyPath(companyId) : null,
            note: excerpt(r.note, 160),
        };
    });

    const channelLabel: Record<string, string> = { CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" };
    return {
        actionsAujourdhui: rows.length,
        appels: rows.filter((r) => r.channel === "CALL").length,
        emails: rows.filter((r) => r.channel === "EMAIL").length,
        linkedin: rows.filter((r) => r.channel === "LINKEDIN").length,
        rdvPris: rows.filter((r) => r.result === "MEETING_BOOKED" && r.confirmationStatus !== "CANCELLED").length,
        parResultat: familyCounts(rows).map((f) => ({ famille: OUTCOME_META[f.family].label, nombre: f.count })),
        rappelsEnRetard: followUps.enRetard,
        rappelsAujourdhui: followUps.aujourdhui,
        actions: rows.slice(0, 25).map((r, i) => ({
            heure: r.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
            canal: channelLabel[r.channel] ?? r.channel,
            prospect: outreach[i].who,
            lien: outreach[i].link,
            statut: label(r.result),
            note: outreach[i].note,
        })),
        prochainesActions: recommendNextActions(outreach, {
            overdueFollowUps: followUps.enRetard,
            dueTodayFollowUps: followUps.aujourdhui,
        }),
    };
}

// ── Reschedule (confirmed write) ─────────────────────────────────────────────

/**
 * The callback the SDR may reschedule: their own, still a callback status.
 * Returns null otherwise, so the tool answers « introuvable » instead of
 * revealing someone else's callback.
 */
export async function findOwnCallback(userId: string, callbackId: string) {
    const codes = await callbackCodes();
    const row = await prisma.action.findFirst({
        where: { id: callbackId, sdrId: userId, result: { in: codes as never[] } },
        select: {
            id: true,
            callbackDate: true,
            note: true,
            contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
            company: { select: { name: true } },
        },
    });
    if (!row) return null;
    const company = row.contact?.company?.name ?? row.company?.name ?? null;
    const person = personName(row.contact);
    return { ...row, who: person ? (company ? `${person} · ${company}` : person) : company ?? "Prospect" };
}
