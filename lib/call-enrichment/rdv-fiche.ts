// ============================================
// Fills an RDV's « fiche » from its call transcription — never over a fiche
// someone already wrote. Shared by every path that brings a transcript onto an
// RDV: the Twilio softphone (lib/telephony/summary), the call-source fallback
// chain (auto-enrichment) and the manager's manual call link.
// ============================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateFicheFromTranscription, type FicheData } from "@/lib/ai/mistral-fiche";

const RDV_RESULTS = ["MEETING_BOOKED", "MEETING_CANCELLED"] as const;

/** True when the stored fiche has at least one non-blank section. */
export function ficheHasContent(fiche: unknown): boolean {
    if (!fiche || typeof fiche !== "object" || Array.isArray(fiche)) return false;
    return Object.values(fiche as Record<string, unknown>).some((v) => typeof v === "string" && v.trim().length > 0);
}

/**
 * Generates and stores the fiche of an RDV from its transcription when the fiche
 * is still empty. Returns the fiche written, or null (not an RDV, no transcript,
 * fiche already filled, AI unavailable). Never throws: the call data is already
 * saved, a missing fiche only means the manager clicks « Générer IA ».
 */
export async function fillRdvFicheIfEmpty(actionId: string): Promise<FicheData | null> {
    try {
        const action = await prisma.action.findUnique({
            where: { id: actionId },
            select: { result: true, rdvFiche: true, callTranscription: true },
        });
        if (!action || !(RDV_RESULTS as readonly string[]).includes(action.result)) return null;
        if (ficheHasContent(action.rdvFiche)) return null;
        const transcription = action.callTranscription?.trim();
        if (!transcription) return null;

        const result = await generateFicheFromTranscription(transcription);
        if (!result.ok || !ficheHasContent(result.fiche)) {
            if (!result.ok) console.warn(`[rdv-fiche] not generated actionId=${actionId}: ${result.message}`);
            return null;
        }

        // Someone may have typed the fiche while the model was answering: re-check, never overwrite.
        const latest = await prisma.action.findUnique({ where: { id: actionId }, select: { rdvFiche: true } });
        if (ficheHasContent(latest?.rdvFiche)) return null;

        await prisma.action.update({
            where: { id: actionId },
            data: { rdvFiche: result.fiche as unknown as Prisma.InputJsonValue, rdvFicheUpdatedAt: new Date() },
        });
        return result.fiche;
    } catch (err) {
        console.error(`[rdv-fiche] failed actionId=${actionId}`, err);
        return null;
    }
}
