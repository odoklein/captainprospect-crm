// ============================================
// POST /api/manager/assistant/conversations/[id]/pdf — the thread (or some answers) as a branded PDF
//
// Body (optional): { messageIds?: string[] }
//   none          → the whole thread: one section per question (« Question N »),
//                   the answers below it with their visuals
//   messageIds    → those ASSISTANT messages only, each under its question
// Response: application/pdf attachment (« titre-de-la-conversation-2026-10-29.pdf »).
// Readable by the owner, or by any active manager when SHARED; anything else is a 404.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { optional } from "@/lib/assistant/store/missing";
import { getBrand } from "@/lib/brand/server";
import { renderAssistantPdf } from "@/lib/assistant/pdf/render";
import { loadPdfLogo } from "@/lib/assistant/pdf/server";
import { attachmentHeader, pdfFileName } from "@/lib/assistant/pdf/text";
import {
    MAX_EXPORT_MESSAGES,
    PdfExportError,
    conversationExport,
    type ConversationExportDeps,
    type ExportConversation,
    type ExportMessage,
} from "@/lib/assistant/pdf/exports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z
    .object({
        messageIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(200).optional(),
    })
    .strict();

const deps: ConversationExportDeps = {
    findConversation: (id) =>
        optional<ExportConversation | null>(
            "pdf.conversation",
            async () => {
                const row = await prisma.assistantConversation.findUnique({
                    where: { id },
                    select: { id: true, title: true, createdById: true, visibility: true, client: { select: { name: true } }, mission: { select: { name: true } } },
                });
                return row ? { id: row.id, title: row.title, createdById: row.createdById, visibility: row.visibility, clientName: row.client?.name ?? null, missionName: row.mission?.name ?? null } : null;
            },
            async () => {
                // Pre-v4 instance: no visibility column, every thread is private.
                const row = await prisma.assistantConversation.findUnique({
                    where: { id },
                    select: { id: true, title: true, createdById: true, client: { select: { name: true } }, mission: { select: { name: true } } },
                });
                return row ? { id: row.id, title: row.title, createdById: row.createdById, visibility: "PRIVATE" as const, clientName: row.client?.name ?? null, missionName: row.mission?.name ?? null } : null;
            },
        ),
    listMessages: async (conversationId) => {
        const select = { id: true, role: true, content: true, trace: true } as const;
        const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
        // The newest MAX_EXPORT_MESSAGES live messages, returned oldest first.
        const rows = await optional<ExportMessage[]>(
            "pdf.messages",
            () => prisma.assistantMessage.findMany({ where: { conversationId, supersededAt: null }, orderBy, take: MAX_EXPORT_MESSAGES, select }),
            () => prisma.assistantMessage.findMany({ where: { conversationId }, orderBy, take: MAX_EXPORT_MESSAGES, select }),
        );
        return rows.reverse();
    },
};

export const POST = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");

    const raw = await request.json().catch(() => ({}));
    const parsed = Body.safeParse(raw ?? {});
    if (!parsed.success) return errorResponse("Requête invalide : messageIds doit être une liste d'identifiants de réponses.", 400);

    try {
        const content = await conversationExport(deps, viewer, id, parsed.data.messageIds);
        const brand = await getBrand();
        const generatedAt = new Date();
        const buffer = await renderAssistantPdf({
            title: content.title,
            subtitle: content.subtitle,
            author: session.user.name ?? undefined,
            generatedAt,
            brand,
            logo: await loadPdfLogo(brand).catch(() => null),
            sections: content.sections,
        });
        const fileName = pdfFileName(content.fileBase, generatedAt);
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": attachmentHeader(fileName),
                "Content-Length": String(buffer.length),
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        if (error instanceof PdfExportError) return errorResponse(error.message, error.status);
        throw error;
    }
});
