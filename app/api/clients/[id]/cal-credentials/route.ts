// ============================================
// Calendar account credentials for a client (created during onboarding).
//
//   GET    — metadata only; the password is NEVER part of this payload
//   POST   — { action: "reveal" } decrypts the password and stamps who asked
//   PUT    — create/update login, password, sign-in URL, notes
//   DELETE — remove the stored credentials
//
// MANAGER-only across the board: these are shared secrets, not portal settings.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from "@/lib/api-utils";
import { decrypt, encrypt } from "@/lib/encryption";

const CREDENTIAL_SELECT = {
    login: true,
    loginUrl: true,
    notes: true,
    passwordEnc: true,
    updatedAt: true,
    updatedBy: { select: { id: true, name: true } },
    lastRevealedAt: true,
    lastRevealedBy: { select: { id: true, name: true } },
} as const;

type CredentialRow = {
    login: string;
    loginUrl: string | null;
    notes: string | null;
    passwordEnc: string | null;
    updatedAt: Date;
    updatedBy: { id: string; name: string } | null;
    lastRevealedAt: Date | null;
    lastRevealedBy: { id: string; name: string } | null;
};

/** Strips the ciphertext — callers only learn whether a password is on file. */
function toDTO(row: CredentialRow) {
    return {
        login: row.login,
        loginUrl: row.loginUrl,
        notes: row.notes,
        hasPassword: !!row.passwordEnc,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
        lastRevealedAt: row.lastRevealedAt ? row.lastRevealedAt.toISOString() : null,
        lastRevealedBy: row.lastRevealedBy,
    };
}

async function assertClientExists(id: string) {
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!client) throw new NotFoundError("Client introuvable");
}

// ============================================
// GET — metadata (never the password)
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;

    const row = await prisma.clientCalCredential.findUnique({
        where: { clientId: id },
        select: CREDENTIAL_SELECT,
    });

    return successResponse(row ? toDTO(row) : null);
});

// ============================================
// POST { action: "reveal" } — decrypt the password
// ============================================

const PostBody = z.object({
    action: z.literal("reveal"),
});

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    await validateRequest(request, PostBody);

    const row = await prisma.clientCalCredential.findUnique({
        where: { clientId: id },
        select: { id: true, passwordEnc: true },
    });
    if (!row) throw new NotFoundError("Aucun accès agenda enregistré");
    if (!row.passwordEnc) {
        return errorResponse("Aucun mot de passe enregistré", 404);
    }

    let password: string;
    try {
        password = decrypt(row.passwordEnc);
    } catch {
        // Wrong/rotated ENCRYPTION_KEY, or a row written before encryption existed.
        return errorResponse(
            "Le mot de passe stocké n'a pas pu être déchiffré. Il doit être ressaisi.",
            500,
        );
    }

    await prisma.clientCalCredential.update({
        where: { id: row.id },
        data: { lastRevealedAt: new Date(), lastRevealedById: session.user.id },
    });

    return successResponse({ password });
});

// ============================================
// PUT — create or update
// ============================================

const PutBody = z.object({
    login: z.string().min(1).max(320).optional(),
    /** Omitted = leave unchanged. Empty string = clear the stored password. */
    password: z.string().max(500).optional(),
    loginUrl: z.string().url().max(500).optional().or(z.literal("")),
    notes: z.string().max(2000).optional(),
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    await assertClientExists(id);
    const body = await validateRequest(request, PutBody);

    const existing = await prisma.clientCalCredential.findUnique({
        where: { clientId: id },
        select: { id: true },
    });

    const login = body.login?.trim();
    if (!existing && !login) {
        return errorResponse("L'identifiant est requis", 400);
    }

    // undefined → untouched · "" → cleared · value → re-encrypted
    const passwordEnc =
        body.password === undefined
            ? undefined
            : body.password === ""
                ? null
                : encrypt(body.password);

    const shared = {
        ...(login !== undefined ? { login } : {}),
        ...(body.loginUrl !== undefined ? { loginUrl: body.loginUrl || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.trim() || null } : {}),
        ...(passwordEnc !== undefined ? { passwordEnc } : {}),
        updatedById: session.user.id,
    };

    const row = await prisma.clientCalCredential.upsert({
        where: { clientId: id },
        create: {
            clientId: id,
            login: login ?? "",
            ...shared,
        },
        update: shared,
        select: CREDENTIAL_SELECT,
    });

    return successResponse(toDTO(row));
});

// ============================================
// DELETE — drop the stored credentials
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;

    await prisma.clientCalCredential.deleteMany({ where: { clientId: id } });

    return successResponse({ clientId: id });
});
