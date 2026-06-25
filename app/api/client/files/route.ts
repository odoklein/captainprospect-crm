import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    AuthError,
    getPaginationParams,
} from "@/lib/api-utils";

// ============================================
// GET /api/client/files - List files for logged-in client
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);

    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search")?.trim();
    const type = searchParams.get("type")?.trim();

    const where: Prisma.FileWhereInput = {
        clientId,
        deletedAt: null,
    };

    if (search) {
        where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { originalName: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { tags: { hasSome: [search] } },
        ];
    }

    if (type === "file") {
        where.mimeType = { not: "text/uri-list" };
    } else if (type === "link") {
        where.mimeType = "text/uri-list";
    } else if (type === "image") {
        where.mimeType = { startsWith: "image/" };
    } else if (type === "video") {
        where.mimeType = { startsWith: "video/" };
    } else if (type === "audio") {
        where.mimeType = { startsWith: "audio/" };
    } else if (type === "document") {
        where.OR = [
            ...(where.OR ?? []),
            { mimeType: "application/pdf" },
            { mimeType: "application/msword" },
            { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
            { mimeType: "application/vnd.ms-excel" },
            { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
            { mimeType: "application/vnd.ms-powerpoint" },
            { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
            { mimeType: "text/plain" },
            { mimeType: "text/csv" },
        ];
    }

    const [files, total] = await Promise.all([
        prisma.file.findMany({
            where,
            include: {
                uploadedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                folder: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.file.count({
            where,
        }),
    ]);

    const filesWithFormattedSize = files.map((file) => {
        const isLink = file.mimeType === "text/uri-list" && !!file.url;
        return {
            ...file,
            isLink,
            externalUrl: isLink ? file.url : null,
            formattedSize: isLink ? "Lien" : storageService.formatSize(file.size),
        };
    });

    return successResponse({
        files: filesWithFormattedSize,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total,
        },
    });
});

// ============================================
// POST /api/client/files - Share a link for logged-in client
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);

    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("AccÃ¨s non autorisÃ©", 403);
    }

    const body = await request.json().catch(() => null) as {
        title?: string;
        url?: string;
        description?: string | null;
    } | null;

    const rawUrl = body?.url?.trim();
    const title = body?.title?.trim() || rawUrl;
    if (!rawUrl || !title) {
        return errorResponse("Titre et lien requis", 400);
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return errorResponse("Lien invalide", 400);
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
        return errorResponse("Le lien doit commencer par http:// ou https://", 400);
    }

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true },
    });
    const folderName = client?.name?.trim() || "Portail Client";
    let folder = await prisma.folder.findFirst({
        where: { clientId, parentId: null, name: folderName },
    });
    if (!folder) {
        folder = await prisma.folder.create({ data: { name: folderName, clientId } });
    }

    const link = await prisma.file.create({
        data: {
            name: title,
            originalName: title,
            mimeType: "text/uri-list",
            size: 0,
            path: rawUrl,
            url: rawUrl,
            uploadedById: session.user.id,
            folderId: folder.id,
            clientId,
            description: body?.description?.trim() || undefined,
            tags: ["link"],
        },
    });

    return successResponse({
        ...link,
        isLink: true,
        externalUrl: rawUrl,
        formattedSize: "Lien",
    }, 201);
});
