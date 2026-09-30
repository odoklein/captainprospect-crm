import { prisma } from "@/lib/prisma";
import { PACE_DEFAULTS, PACE_LIMITS } from "./pace";

// Manager-editable, applies to every SDR. Stored in SystemConfig (key/value), so
// no migration. Deliberately separate from HrProfile.dailyQuota, which is the
// per-person payroll quota.
export const PACE_CONFIG_KEYS = {
  dailyQuota: "sdrPaceDailyQuota",
  targetHours: "sdrPaceTargetHours",
} as const;

export interface PaceConfig {
  dailyQuota: number;
  targetHours: number;
}

function parseBounded(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export async function getPaceConfig(): Promise<PaceConfig> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: Object.values(PACE_CONFIG_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  return {
    dailyQuota: Math.round(
      parseBounded(
        byKey.get(PACE_CONFIG_KEYS.dailyQuota),
        PACE_LIMITS.dailyQuota.min,
        PACE_LIMITS.dailyQuota.max,
        PACE_DEFAULTS.dailyQuota,
      ),
    ),
    targetHours: parseBounded(
      byKey.get(PACE_CONFIG_KEYS.targetHours),
      PACE_LIMITS.targetHours.min,
      PACE_LIMITS.targetHours.max,
      PACE_DEFAULTS.targetHours,
    ),
  };
}

export async function savePaceConfig(config: PaceConfig): Promise<void> {
  await prisma.$transaction([
    prisma.systemConfig.upsert({
      where: { key: PACE_CONFIG_KEYS.dailyQuota },
      update: { value: String(config.dailyQuota) },
      create: { key: PACE_CONFIG_KEYS.dailyQuota, value: String(config.dailyQuota) },
    }),
    prisma.systemConfig.upsert({
      where: { key: PACE_CONFIG_KEYS.targetHours },
      update: { value: String(config.targetHours) },
      create: { key: PACE_CONFIG_KEYS.targetHours, value: String(config.targetHours) },
    }),
  ]);
}
