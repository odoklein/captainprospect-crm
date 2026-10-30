// ============================================
// GET  /api/manager/assistant/memories?folderId=&scope=&q=&includeDeleted=1
//      → the three layers visible from that folder (MemoriesResponse)
// POST /api/manager/assistant/memories — a manager writes a memory (CreateMemoryBody → MemoryItem)
//
// Layers: AGENCY (everyone), FOLDER (the folder's, only with folderId), USER
// (the viewer's own). `scope` keeps one layer; `q` filters the content.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import type { AssistantMemory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError, requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { assistantRoute, flag } from "@/lib/assistant/conversations/http";
import { AssistantAccessError } from "@/lib/assistant/folders/service";
import { MEMORY_MAX_CHARS, updateMemory, upsertMemory } from "@/lib/assistant/memory/service";
import type { MemoriesResponse, MemoryScope } from "@/lib/assistant/api-contract";
import { MEMORY_UNAVAILABLE, toMemoryItem } from "./_shared";

export const dynamic = "force-dynamic";

const LAYER_LIMIT = 300;
const SCOPES = ["AGENCY", "FOLDER", "USER"] as const;
const KINDS = ["FACT", "PREFERENCE", "DECISION", "CONTACT", "GOAL"] as const;

export const GET = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId")?.trim() || null;
    const scopeParam = searchParams.get("scope");
    const only = SCOPES.find((s) => s === scopeParam) ?? null;
    const q = searchParams.get("q")?.trim().slice(0, 200) || null;
    const includeDeleted = flag(searchParams.get("includeDeleted"));

    const wanted = (scope: MemoryScope) => !only || only === scope;
    const common: Prisma.AssistantMemoryWhereInput[] = [];
    if (!includeDeleted) {
        common.push({ deletedAt: null }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });
    }
    if (q) common.push({ content: { contains: q, mode: "insensitive" } });
    const layer = (where: Prisma.AssistantMemoryWhereInput) =>
        prisma.assistantMemory.findMany({
            where: { AND: [where, ...common] },
            orderBy: [{ deletedAt: { sort: "asc", nulls: "first" } }, { pinned: "desc" }, { updatedAt: "desc" }],
            take: LAYER_LIMIT,
        });
    const none = Promise.resolve([] as AssistantMemory[]);

    const data = await optional<MemoriesResponse>(
        "memories.layers",
        async () => {
            const [agency, folder, user] = await Promise.all([
                wanted("AGENCY") ? layer({ scope: "AGENCY" }) : none,
                folderId && wanted("FOLDER") ? layer({ scope: "FOLDER", folderId }) : none,
                wanted("USER") ? layer({ scope: "USER", userId: session.user.id }) : none,
            ]);
            return { agency: agency.map(toMemoryItem), folder: folder.map(toMemoryItem), user: user.map(toMemoryItem) };
        },
        { agency: [], folder: [], user: [], degraded: true },
    );
    return successResponse(data);
});

const CreateBody = z.object({
    scope: z.enum(SCOPES),
    folderId: z.string().max(64).nullable().optional(),
    kind: z.enum(KINDS),
    content: z.string().min(1).max(MEMORY_MAX_CHARS * 2),
    pinned: z.boolean().optional(),
});

export const POST = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, CreateBody);

    let folderId: string | null = null;
    if (body.scope === "FOLDER") {
        if (!body.folderId) throw new NotFoundError("Dossier introuvable");
        const folder = await optional(
            "memories.create.folder",
            () => prisma.assistantFolder.findUnique({ where: { id: body.folderId as string }, select: { id: true } }),
            null,
        );
        if (!folder) throw new NotFoundError("Dossier introuvable");
        folderId = folder.id;
    }

    let row = await upsertMemory({
        scope: body.scope,
        folderId,
        userId: body.scope === "USER" ? session.user.id : null,
        kind: body.kind,
        content: body.content,
        source: { by: "user" },
        by: session.user.id,
    });
    if (!row) throw new AssistantAccessError(MEMORY_UNAVAILABLE, 503);
    if (body.pinned !== undefined && body.pinned !== row.pinned) {
        row = (await updateMemory(row.id, { pinned: body.pinned }, { id: session.user.id })) ?? row;
    }
    return successResponse(toMemoryItem(row), 201);
});
