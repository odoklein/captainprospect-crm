/**
 * "Actualiser" on a pinned visual: one bounded agent turn that calls the
 * visual's source tool again (period moved to today) and redraws it with
 * show_visual. Only those two tools are allowed, the deadline is at most 60 s,
 * nothing is written to a conversation. A failure is stored on the pin
 * (refreshError, French) and the pin is returned as-is, so the card shows it.
 */

import { randomUUID } from "node:crypto";
import type { AssistantPin, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { buildTurnContextMessage } from "@/lib/ai/tools/loop";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import { getBrand } from "@/lib/brand/server";
import { getAssistantModelConfig, planTurn } from "@/lib/ai/agent/models";
import { providerChat, runAgentTurn } from "@/lib/ai/agent/runtime";
import { isConfigured } from "@/lib/ai/providers";
import { recordAiUsage } from "@/lib/ai/ledger";
import type { StoredVisual } from "../visuals/spec";
import type { Viewer } from "../folders/rules";
import type { PinItem } from "../api-contract";
import { parsePinSource, refreshInstruction, toPinItem } from "./validate";
import type { PinFolder } from "./service";

export const PIN_REFRESH_DEADLINE_MS = 60_000;
export const NO_SOURCE = "Ce visuel n'a pas de source rafraîchissable";

async function settle(pin: AssistantPin, data: Prisma.AssistantPinUpdateInput): Promise<PinItem> {
    return toPinItem(await prisma.assistantPin.update({ where: { id: pin.id }, data }));
}

export async function refreshPin(pin: AssistantPin, folder: PinFolder, viewer: Viewer): Promise<PinItem> {
    const visual = pin.visual as unknown as StoredVisual;
    const source = parsePinSource(pin.source) ?? parsePinSource(visual?.source);
    if (!source || !visual?.spec) throw new ValidationError(NO_SOURCE);

    if (!isConfigured("openai")) {
        return settle(pin, { refreshError: "L'assistant n'est pas configuré sur ce serveur : actualisation impossible." });
    }

    try {
        const ctx = await buildAssistantContext({
            userId: viewer.id,
            clientId: folder.clientId,
            folderId: folder.id,
            toolAllowlist: new Set([source.tool, "show_visual"]),
        });
        const brand = await getBrand();
        const config = getAssistantModelConfig();
        const base = planTurn(config, "standard");
        const plan = {
            ...base,
            deadlineMs: Math.min(base.deadlineMs, PIN_REFRESH_DEADLINE_MS),
            providerTimeoutMs: Math.min(base.providerTimeoutMs, PIN_REFRESH_DEADLINE_MS),
        };
        const question =
            pin.question?.trim() || visual.question?.trim() || `Actualise le visuel « ${visual.spec.title} ».`;

        const result = await runAgentTurn(
            {
                systemPrompt: [getAssistantSystemPrompt(ctx, brand), refreshInstruction(source, visual)].join("\n\n"),
                history: [{ role: "user", content: question }],
                ctx,
                config,
                plan,
                runId: randomUUID(),
                toolNames: new Set([source.tool, "show_visual"]),
                contextMessage: buildTurnContextMessage({ ctx, depth: "standard", sections: [] }),
                knownNames: [ctx.userName, ctx.project?.clientName, brand.name].filter((n): n is string => !!n),
            },
            { chat: providerChat(), store: null, ledger: recordAiUsage, surface: "assistant.pin_refresh" },
        );

        const redrawn = result.visuals[0];
        if (!redrawn || (result.error && result.status !== "partial")) {
            const why = result.error?.message ?? "l'assistant n'a pas redessiné le visuel";
            return settle(pin, { refreshError: `Actualisation impossible : ${why}` });
        }
        const next: StoredVisual = {
            ...redrawn,
            source: redrawn.source ?? source,
            question: visual.question ?? pin.question ?? null,
        };
        return settle(pin, {
            visual: next as unknown as Prisma.InputJsonValue,
            source: (next.source ?? source) as unknown as Prisma.InputJsonValue,
            refreshedAt: new Date(),
            refreshError: null,
        });
    } catch (error) {
        console.error("[assistant.pin_refresh] failed", error);
        return settle(pin, { refreshError: "Actualisation impossible : erreur pendant le calcul. Réessaie plus tard." });
    }
}
