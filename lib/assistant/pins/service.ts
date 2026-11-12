/**
 * Folder pins (the "Tableau", Captain AI v4): visuals pinned from a chat
 * answer to a folder's board. A folder is agency-wide, so any active manager
 * sees, reorders and removes its pins. Missing tables: lists are empty and
 * writes answer 503.
 */

import { randomUUID } from "node:crypto";
import type { AssistantPin, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import { optional } from "../store/missing";
import type { Viewer } from "../folders/rules";
import { AssistantAccessError, FOLDERS_UNAVAILABLE, touchFolder } from "../folders/service";
import { findReadableConversation } from "../conversations/service";
import type { CreatePinBody, PatchPinBody, PinItem } from "../api-contract";
import { parseStoredVisual, pinTitle, toPinItem } from "./validate";

export const PINS_PER_FOLDER_MAX = 60;

export interface PinFolder {
    id: string;
    clientId: string | null;
}

/** The folder of a pin route: 404 when missing, 503 when the tables are. */
export async function requirePinFolder(folderId: string): Promise<PinFolder> {
    const folder = await optional<PinFolder | null | "missing">(
        "pins.folder",
        () => prisma.assistantFolder.findUnique({ where: { id: folderId }, select: { id: true, clientId: true } }),
        "missing",
    );
    if (folder === "missing") throw new AssistantAccessError(FOLDERS_UNAVAILABLE, 503);
    if (!folder) throw new NotFoundError("Dossier introuvable");
    return folder;
}

export async function listPins(folderId: string): Promise<PinItem[]> {
    const rows = await optional<AssistantPin[]>(
        "pins.list",
        () =>
            prisma.assistantPin.findMany({
                where: { folderId },
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                take: PINS_PER_FOLDER_MAX,
            }),
        [],
    );
    return rows.map(toPinItem);
}

/** The pin when it belongs to the folder, else 404. */
export async function requirePin(folderId: string, pinId: string): Promise<AssistantPin> {
    const pin = await optional<AssistantPin | null>(
        "pins.get",
        () => prisma.assistantPin.findFirst({ where: { id: pinId, folderId } }),
        null,
    );
    if (!pin) throw new NotFoundError("Visuel épinglé introuvable");
    return pin;
}

export async function createPin(folder: PinFolder, viewer: Viewer, body: CreatePinBody): Promise<PinItem> {
    const parsed = parseStoredVisual(body.visual, randomUUID);
    if (!parsed.ok) throw new ValidationError(parsed.error);
    const visual = parsed.visual;

    // A link to the answer it came from only when the viewer can read that thread.
    let conversationId: string | null = null;
    let messageId: string | null = null;
    if (body.conversationId) {
        const conv = await findReadableConversation(body.conversationId, viewer);
        if (!conv) throw new NotFoundError("Conversation introuvable");
        conversationId = conv.id;
        if (body.messageId) {
            const message = await prisma.assistantMessage.findFirst({
                where: { id: body.messageId, conversationId: conv.id },
                select: { id: true },
            });
            if (!message) throw new NotFoundError("Message introuvable");
            messageId = message.id;
        }
    }

    const created = await optional<AssistantPin | null>(
        "pins.create",
        async () => {
            const count = await prisma.assistantPin.count({ where: { folderId: folder.id } });
            if (count >= PINS_PER_FOLDER_MAX) {
                throw new ValidationError(`Le tableau est plein (${PINS_PER_FOLDER_MAX} visuels) : retires-en un d'abord.`);
            }
            const last = await prisma.assistantPin.findFirst({
                where: { folderId: folder.id },
                orderBy: { position: "desc" },
                select: { position: true },
            });
            return prisma.assistantPin.create({
                data: {
                    folderId: folder.id,
                    title: pinTitle(body.title, visual),
                    visual: visual as unknown as Prisma.InputJsonValue,
                    source: (visual.source ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
                    question: visual.question ?? null,
                    conversationId,
                    messageId,
                    createdById: viewer.id,
                    position: (last?.position ?? -1) + 1,
                },
            });
        },
        null,
    );
    if (!created) throw new AssistantAccessError(FOLDERS_UNAVAILABLE, 503);
    await touchFolder(folder.id);
    return toPinItem(created);
}

export async function patchPin(folderId: string, pinId: string, body: PatchPinBody): Promise<PinItem> {
    const pin = await requirePin(folderId, pinId);
    const data: Prisma.AssistantPinUpdateInput = {};
    if (body.title !== undefined) {
        const title = body.title.replace(/\s+/g, " ").trim();
        if (!title) throw new ValidationError("Le titre est vide.");
        data.title = title.slice(0, 120);
    }
    if (body.position !== undefined) data.position = body.position;
    if (Object.keys(data).length === 0) return toPinItem(pin);
    return toPinItem(await prisma.assistantPin.update({ where: { id: pin.id }, data }));
}

export async function deletePin(folderId: string, pinId: string): Promise<void> {
    const pin = await requirePin(folderId, pinId);
    await prisma.assistantPin.delete({ where: { id: pin.id } });
}
