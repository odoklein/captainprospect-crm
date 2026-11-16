// ============================================
// ONOFF BUSINESS — storage and lookup of the calls Onoff pushes.
//   ingestOnoffEvent  webhook → OnoffCall (idempotent on Onoff's event id)
//   findOnoffCalls    a prospect's Onoff calls in a time window (call sources)
//   onoffAudioUrl     the audio behind a stored "onoff:<id>" reference
// ============================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { integrationKey } from "@/lib/integrations/keys";
import { matchOnoffUser, onoffRecordingRef, type OnoffCallEvent } from "./webhook";

export const isOnoffConfigured = () => Boolean(integrationKey("ONOFF_WEBHOOK_KEY")?.trim());

export async function ingestOnoffEvent(event: OnoffCallEvent): Promise<{ id: string; sdrId: string | null }> {
    const users = await prisma.user.findMany({
        where: {
            isActive: true,
            role: { notIn: ["CLIENT", "COMMERCIAL"] },
            OR: [
                ...(event.onoffUserEmail ? [{ email: { equals: event.onoffUserEmail, mode: "insensitive" as const } }] : []),
                { onoffPhoneNumber: { not: null } },
            ],
        },
        select: { id: true, email: true, onoffPhoneNumber: true },
    });
    const sdrId = matchOnoffUser(event, users);

    const data = {
        event: event.event,
        sdrId,
        onoffUserEmail: event.onoffUserEmail,
        onoffUserNumber: event.onoffUserNumber,
        externalNumber: event.externalNumber,
        externalKey: event.externalKey,
        externalName: event.externalName,
        direction: event.direction,
        status: event.status,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        durationSec: event.durationSec,
        voicemailUrl: event.voicemailUrl,
        notes: event.notes,
        tags: (event.tags ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    // A retry or a later RECORDING event for the same id never erases a recording already received.
    await prisma.onoffCall.upsert({
        where: { id: event.id },
        create: { id: event.id, ...data, recordingUrl: event.recordingUrl },
        update: { ...data, ...(event.recordingUrl ? { recordingUrl: event.recordingUrl } : {}) },
    });
    return { id: event.id, sdrId };
}

export interface OnoffCallMatch {
    id: string;
    sdrId: string | null;
    fromNumber: string;
    toNumber: string;
    direction: "INBOUND" | "OUTBOUND";
    status: string;
    durationSec: number;
    startedAt: string;
    notes: string | null;
    /** Stable reference ("onoff:<id>"), never Onoff's own link. Null when Onoff sent no audio. */
    recordingUrl: string | null;
}

export interface OnoffSearch {
    phones: string[];
    windowStart: Date;
    windowEnd: Date;
    /** Restrict to this SDR's calls, plus calls whose Onoff user could not be matched. */
    sdrId?: string | null;
    limit?: number;
}

export async function findOnoffCalls(search: OnoffSearch): Promise<OnoffCallMatch[]> {
    const keys = [...new Set(search.phones.map((p) => phoneKey(p)).filter((k): k is string => !!k))];
    if (!keys.length) return [];
    const rows = await prisma.onoffCall.findMany({
        where: {
            externalKey: { in: keys },
            startedAt: { gte: search.windowStart, lte: search.windowEnd },
            ...(search.sdrId ? { OR: [{ sdrId: search.sdrId }, { sdrId: null }] } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: search.limit ?? 30,
    });
    return rows.map((c) => {
        const line = c.onoffUserNumber ?? "Onoff";
        const outbound = c.direction !== "INBOUND";
        return {
            id: c.id,
            sdrId: c.sdrId,
            fromNumber: outbound ? line : c.externalNumber,
            toNumber: outbound ? c.externalNumber : line,
            direction: outbound ? "OUTBOUND" : "INBOUND",
            status: c.status,
            durationSec: c.durationSec ?? 0,
            startedAt: c.startedAt.toISOString(),
            notes: c.notes,
            recordingUrl: c.recordingUrl || c.voicemailUrl ? onoffRecordingRef(c.id) : null,
        };
    });
}

/** This SDR's call > has audio > answered > longer > newer. */
export function rankOnoffMatches(calls: OnoffCallMatch[], sdrId?: string | null): OnoffCallMatch[] {
    const score = (c: OnoffCallMatch) =>
        (sdrId && c.sdrId === sdrId ? 1_000_000 : 0) +
        (c.recordingUrl ? 100_000 : 0) +
        (c.status === "ANSWERED" ? 10_000 : 0) +
        Math.min(c.durationSec, 9_999);
    return [...calls].sort((a, b) => score(b) - score(a) || b.startedAt.localeCompare(a.startedAt));
}

/** The audio link Onoff sent for a stored call (recording first, else voicemail). */
export async function onoffAudioUrl(callId: string): Promise<string | null> {
    const c = await prisma.onoffCall.findUnique({ where: { id: callId }, select: { recordingUrl: true, voicemailUrl: true } });
    return c?.recordingUrl || c?.voicemailUrl || null;
}
