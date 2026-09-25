// ============================================
// BROADCAST UNIFIED SERVICE LAYER
// Handles reading, compiling, saving, resetting and testing broadcasts
// ============================================

import { prisma } from "@/lib/prisma";
import {
  SYSTEM_BROADCAST_DEFINITIONS,
  BROADCAST_VARIABLES_REGISTRY,
  BroadcastDefinition,
  EmailBlock,
} from "./types";
import {
  compileBlocksToHtml,
  extractBlocksFromHtml,
  substituteVariables,
} from "./compiler";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { DEFAULT_RDV_TEMPLATE_HTML, DEFAULT_RDV_TEMPLATE_SUBJECT } from "@/lib/email/templates/rdv-notification";
import {
  DEFAULT_PASSWORD_RECOVERY_HTML,
  DEFAULT_PASSWORD_RECOVERY_SUBJECT,
  DEFAULT_PASSWORD_OTP_HTML,
  DEFAULT_PASSWORD_OTP_SUBJECT,
} from "@/lib/email/templates/security-auth";

export interface BroadcastItemView {
  key: string;
  name: string;
  description: string;
  category: string;
  triggerType: string;
  triggerEventLabel: string;
  channels: string[];
  isSystemLocked: boolean;
  isActive: boolean;
  isCustomized: boolean;
  subject: string;
  blocks: EmailBlock[];
  bodyHtml: string;
  updatedAt?: string | null;
  defaultSubject: string;
  defaultHtml: string;
}

/**
 * Returns default subject and HTML for system keys
 */
export function getDefaultSystemContent(key: string): {
  subject: string;
  bodyHtml: string;
} {
  if (key === "rdv_notification") {
    return {
      subject: DEFAULT_RDV_TEMPLATE_SUBJECT,
      bodyHtml: DEFAULT_RDV_TEMPLATE_HTML,
    };
  }
  if (key === "password_recovery") {
    return {
      subject: DEFAULT_PASSWORD_RECOVERY_SUBJECT,
      bodyHtml: DEFAULT_PASSWORD_RECOVERY_HTML,
    };
  }
  if (key === "password_otp") {
    return {
      subject: DEFAULT_PASSWORD_OTP_SUBJECT,
      bodyHtml: DEFAULT_PASSWORD_OTP_HTML,
    };
  }
  const found = SYSTEM_BROADCAST_DEFINITIONS.find((d) => d.key === key);
  return {
    subject: found?.defaultSubject || "Notification Captain Prospect",
    bodyHtml: found ? compileBlocksToHtml(found.defaultSubject, found.defaultBlocks) : "",
  };
}

/**
 * List all broadcast rules with their customized or default state
 */
export async function getAllBroadcasts(): Promise<BroadcastItemView[]> {
  const dbTemplates = await (prisma as any).systemEmailTemplate.findMany();
  const dbMap = new Map<string, any>(
    dbTemplates.map((t: any) => [t.key, t])
  );

  const result: BroadcastItemView[] = [];

  // 1. Process known system broadcasts
  for (const def of SYSTEM_BROADCAST_DEFINITIONS) {
    const dbRecord = dbMap.get(def.key);
    const defaults = getDefaultSystemContent(def.key);

    const isCustomized = Boolean(dbRecord);
    const subject = dbRecord?.subject || defaults.subject;
    const bodyHtml = dbRecord?.bodyHtml || defaults.bodyHtml;

    const { blocks } = extractBlocksFromHtml(bodyHtml, def.defaultBlocks);

    result.push({
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      triggerType: def.triggerType,
      triggerEventLabel: def.triggerEventLabel,
      channels: def.channels,
      isSystemLocked: def.isSystemLocked,
      isActive: true,
      isCustomized,
      subject,
      blocks,
      bodyHtml,
      updatedAt: dbRecord?.updatedAt ? new Date(dbRecord.updatedAt).toISOString() : null,
      defaultSubject: defaults.subject,
      defaultHtml: defaults.bodyHtml,
    });

    dbMap.delete(def.key);
  }

  // 2. Process custom manager-created broadcasts (saved with custom_ keys)
  for (const [key, record] of dbMap.entries()) {
    const { blocks } = extractBlocksFromHtml(record.bodyHtml);

    result.push({
      key,
      name: record.name || key,
      description: "Broadcast personnalisé créé par l'équipe",
      category: "CUSTOM",
      triggerType: "MANUAL_CAMPAIGN",
      triggerEventLabel: "Envoi manuel",
      channels: ["EMAIL"],
      isSystemLocked: false,
      isActive: true,
      isCustomized: true,
      subject: record.subject,
      blocks,
      bodyHtml: record.bodyHtml,
      updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      defaultSubject: record.subject,
      defaultHtml: record.bodyHtml,
    });
  }

  return result;
}

/**
 * Get single broadcast by key
 */
export async function getBroadcastByKey(key: string): Promise<BroadcastItemView | null> {
  const dbRecord = await (prisma as any).systemEmailTemplate.findUnique({
    where: { key },
  });

  const sysDef = SYSTEM_BROADCAST_DEFINITIONS.find((d) => d.key === key);
  const defaults = getDefaultSystemContent(key);

  if (!sysDef && !dbRecord) {
    return null;
  }

  const isCustomized = Boolean(dbRecord);
  const subject = dbRecord?.subject || defaults.subject;
  const bodyHtml = dbRecord?.bodyHtml || defaults.bodyHtml;
  const { blocks } = extractBlocksFromHtml(bodyHtml, sysDef?.defaultBlocks || []);

  return {
    key,
    name: dbRecord?.name || sysDef?.name || key,
    description: sysDef?.description || "Broadcast personnalisé",
    category: sysDef?.category || "CUSTOM",
    triggerType: sysDef?.triggerType || "AUTOMATED_EVENT",
    triggerEventLabel: sysDef?.triggerEventLabel || "Événement automatique",
    channels: sysDef?.channels || ["EMAIL"],
    isSystemLocked: sysDef?.isSystemLocked ?? false,
    isActive: true,
    isCustomized,
    subject,
    blocks,
    bodyHtml,
    updatedAt: dbRecord?.updatedAt ? new Date(dbRecord.updatedAt).toISOString() : null,
    defaultSubject: defaults.subject,
    defaultHtml: defaults.bodyHtml,
  };
}

/**
 * Save / Update a broadcast (compiles blocks to responsive HTML)
 */
export async function saveBroadcast(
  key: string,
  data: {
    name?: string;
    subject: string;
    blocks?: EmailBlock[];
    rawHtml?: string;
    accentColor?: string;
  }
) {
  const sysDef = SYSTEM_BROADCAST_DEFINITIONS.find((d) => d.key === key);
  const displayName = data.name || sysDef?.name || key;

  // Decide HTML body: if blocks are provided, compile them
  let finalHtml = data.rawHtml || "";
  if (data.blocks && data.blocks.length > 0) {
    finalHtml = compileBlocksToHtml(data.subject, data.blocks, data.accentColor);
  }

  if (!finalHtml.trim()) {
    throw new Error("Le contenu du broadcast ne peut pas être vide");
  }

  const record = await (prisma as any).systemEmailTemplate.upsert({
    where: { key },
    update: {
      name: displayName,
      subject: data.subject,
      bodyHtml: finalHtml,
    },
    create: {
      key,
      name: displayName,
      subject: data.subject,
      bodyHtml: finalHtml,
    },
  });

  return record;
}

/**
 * Reset a broadcast to its default system template
 */
export async function resetBroadcast(key: string) {
  await (prisma as any).systemEmailTemplate.deleteMany({
    where: { key },
  });
  return { reset: true };
}

/**
 * Sends a test email to the manager with realistic dummy data substituted
 */
export async function sendTestBroadcast(
  key: string,
  targetEmail: string,
  overrideData?: {
    subject?: string;
    blocks?: EmailBlock[];
    rawHtml?: string;
    accentColor?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const broadcast = await getBroadcastByKey(key);
  const subject = overrideData?.subject || broadcast?.subject || "Test Broadcast";

  let bodyHtml = overrideData?.rawHtml;
  if (!bodyHtml && overrideData?.blocks && overrideData.blocks.length > 0) {
    bodyHtml = compileBlocksToHtml(
      subject,
      overrideData.blocks,
      overrideData.accentColor
    );
  } else if (!bodyHtml) {
    bodyHtml = broadcast?.bodyHtml || "";
  }

  // Build realistic sample values map from registry
  const variablesRegistry =
    BROADCAST_VARIABLES_REGISTRY[key] || BROADCAST_VARIABLES_REGISTRY.general || [];

  const sampleMap: Record<string, string> = {};
  for (const v of variablesRegistry) {
    sampleMap[v.key] = v.sampleValue;
  }

  const testSubject = `[TEST] ${substituteVariables(subject, sampleMap)}`;
  const testHtml = substituteVariables(bodyHtml, sampleMap);

  const ok = await sendTransactionalEmail({
    to: targetEmail,
    subject: testSubject,
    html: testHtml,
  });

  if (!ok) {
    return {
      ok: false,
      message: "Échec de l'envoi SMTP du message de test. Vérifiez la configuration SMTP.",
    };
  }

  return {
    ok: true,
    message: `Email de test envoyé avec succès à ${targetEmail}`,
  };
}
