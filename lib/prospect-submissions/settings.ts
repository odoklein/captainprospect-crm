import { prisma } from "@/lib/prisma";
import type { ProspectCreationMode } from "./types";

// ============================================
// PER-MISSION SETTING — can SDRs add companies?
// SystemConfig row "mission.sdrProspectCreation:<missionId>" = "VALIDATION"
// or "DIRECT". No row means OFF. No schema migration (same pattern as the
// per-list 24 h pause in lib/sdr-queue/cooldown.ts). An unreadable setting
// keeps the feature OFF: SDRs never create rows a manager did not allow.
// ============================================

const KEY_PREFIX = "mission.sdrProspectCreation:";

function keyFor(missionId: string): string {
    return `${KEY_PREFIX}${missionId}`;
}

function parseMode(value: string | null | undefined): ProspectCreationMode {
    return value === "VALIDATION" || value === "DIRECT" ? value : "OFF";
}

export async function getProspectCreationMode(missionId: string): Promise<ProspectCreationMode> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: keyFor(missionId) } });
        return parseMode(row?.value);
    } catch (err) {
        console.warn("[prospect-submissions] mission setting unreadable, keeping it OFF", err);
        return "OFF";
    }
}

export async function setProspectCreationMode(missionId: string, mode: ProspectCreationMode): Promise<void> {
    const key = keyFor(missionId);
    if (mode === "OFF") {
        await prisma.systemConfig.deleteMany({ where: { key } });
        return;
    }
    await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: mode },
        update: { value: mode },
    });
}
