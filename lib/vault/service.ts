// ============================================
// ACCESS VAULT — service layer
//
// Every read/write of a stored secret goes through here, so the two
// invariants hold in one place:
//   · a password is encrypted on the way in and only decrypted by reveal()
//   · anything that touches a secret writes a VaultAuditEvent
// ============================================

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import type { Prisma, VaultAuditAction, VaultCredentialType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import type { VaultAuditEventDTO, VaultCredentialDTO } from "./types";
import { VAULT_TYPE_LABELS } from "./types";

// ============================================
// Password generation
// ============================================

// No I/l/1/O/0: these get read aloud and retyped by hand more often than
// anyone would like.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PASSWORD_SYMBOLS = "!@#$%*-_";

/** Cryptographically random, unambiguous, and safe to dictate over the phone. */
export function generateStrongPassword(length = 16): string {
    const size = Math.min(Math.max(length, 12), 64);
    const chars: string[] = [];
    for (let i = 0; i < size - 2; i++) {
        chars.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]);
    }
    // Guarantee at least two symbols, for policies that demand them.
    chars.push(PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)]);
    chars.push(PASSWORD_SYMBOLS[randomInt(PASSWORD_SYMBOLS.length)]);

    // Fisher-Yates, so the symbols are not always the last two characters.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        const swap = chars[i];
        chars[i] = chars[j];
        chars[j] = swap;
    }
    return chars.join("");
}

// ============================================
// Selection / serialisation
// ============================================

const CREDENTIAL_SELECT = {
    id: true,
    type: true,
    label: true,
    login: true,
    url: true,
    notes: true,
    passwordEnc: true,
    lastRevealedAt: true,
    lastSentAt: true,
    lastSentTo: true,
    createdAt: true,
    updatedAt: true,
    client: { select: { id: true, name: true } },
    mission: { select: { id: true, name: true } },
    interlocuteur: { select: { id: true, firstName: true, lastName: true } },
    user: { select: { id: true, email: true, role: true } },
    createdBy: { select: { id: true, name: true } },
    updatedBy: { select: { id: true, name: true } },
    lastRevealedBy: { select: { id: true, name: true } },
} satisfies Prisma.VaultCredentialSelect;

type CredentialRow = Prisma.VaultCredentialGetPayload<{ select: typeof CREDENTIAL_SELECT }>;

/** Drops the ciphertext. The only conversion used on any response path. */
export function toCredentialDTO(row: CredentialRow): VaultCredentialDTO {
    return {
        id: row.id,
        type: row.type,
        label: row.label,
        login: row.login,
        url: row.url,
        notes: row.notes,
        hasPassword: !!row.passwordEnc,
        client: row.client,
        mission: row.mission,
        interlocuteur: row.interlocuteur
            ? {
                id: row.interlocuteur.id,
                name: `${row.interlocuteur.firstName} ${row.interlocuteur.lastName}`.trim(),
            }
            : null,
        portalUser: row.user
            ? { id: row.user.id, email: row.user.email, role: row.user.role }
            : null,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        lastRevealedAt: row.lastRevealedAt?.toISOString() ?? null,
        lastRevealedBy: row.lastRevealedBy,
        lastSentAt: row.lastSentAt?.toISOString() ?? null,
        lastSentTo: row.lastSentTo,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

// ============================================
// Audit
// ============================================

export async function recordVaultAudit(params: {
    action: VaultAuditAction;
    summary: string;
    actorId: string;
    credentialId?: string | null;
    clientId?: string | null;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    try {
        await prisma.vaultAuditEvent.create({
            data: {
                action: params.action,
                summary: params.summary,
                actorId: params.actorId,
                credentialId: params.credentialId ?? null,
                clientId: params.clientId ?? null,
                metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
            },
        });
    } catch (error) {
        // An audit write must never take down the operation it describes — but
        // it has to be loud, because a silent gap in the trail is the one thing
        // this table exists to prevent.
        console.error("[vault] audit write failed", params.action, error);
    }
}

export async function listVaultAudit(filters: {
    clientId?: string;
    credentialId?: string;
    limit?: number;
}): Promise<VaultAuditEventDTO[]> {
    const rows = await prisma.vaultAuditEvent.findMany({
        where: {
            ...(filters.clientId ? { clientId: filters.clientId } : {}),
            ...(filters.credentialId ? { credentialId: filters.credentialId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(filters.limit ?? 50, 200),
        select: {
            id: true,
            action: true,
            summary: true,
            credentialId: true,
            clientId: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
        },
    });

    return rows.map((row) => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        actor: row.actor,
        credentialId: row.credentialId,
        clientId: row.clientId,
        createdAt: row.createdAt.toISOString(),
    }));
}

// ============================================
// Reads
// ============================================

export async function listCredentials(filters: {
    clientId?: string;
    missionId?: string;
    interlocuteurId?: string;
    type?: VaultCredentialType;
    search?: string;
    limit?: number;
}): Promise<VaultCredentialDTO[]> {
    const search = filters.search?.trim();

    const rows = await prisma.vaultCredential.findMany({
        where: {
            ...(filters.clientId ? { clientId: filters.clientId } : {}),
            ...(filters.missionId ? { missionId: filters.missionId } : {}),
            ...(filters.interlocuteurId ? { interlocuteurId: filters.interlocuteurId } : {}),
            ...(filters.type ? { type: filters.type } : {}),
            ...(search
                ? {
                    OR: [
                        { label: { contains: search, mode: "insensitive" as const } },
                        { login: { contains: search, mode: "insensitive" as const } },
                        { client: { name: { contains: search, mode: "insensitive" as const } } },
                    ],
                }
                : {}),
        },
        orderBy: [{ client: { name: "asc" } }, { type: "asc" }, { label: "asc" }],
        take: Math.min(filters.limit ?? 200, 500),
        select: CREDENTIAL_SELECT,
    });

    return rows.map(toCredentialDTO);
}

export async function getCredential(id: string): Promise<VaultCredentialDTO> {
    const row = await prisma.vaultCredential.findUnique({
        where: { id },
        select: CREDENTIAL_SELECT,
    });
    if (!row) throw new NotFoundError("Accès introuvable");
    return toCredentialDTO(row);
}

// ============================================
// Writes
// ============================================

export interface CredentialInput {
    clientId: string;
    missionId?: string | null;
    type: VaultCredentialType;
    label?: string;
    login: string;
    password?: string | null;
    url?: string | null;
    notes?: string | null;
    interlocuteurId?: string | null;
    userId?: string | null;
}

/** Rejects a mission or commercial that belongs to a different client. */
async function assertScope(input: {
    clientId: string;
    missionId?: string | null;
    interlocuteurId?: string | null;
}) {
    const client = await prisma.client.findUnique({
        where: { id: input.clientId },
        select: { id: true, name: true },
    });
    if (!client) throw new NotFoundError("Client introuvable");

    if (input.missionId) {
        const mission = await prisma.mission.findUnique({
            where: { id: input.missionId },
            select: { clientId: true },
        });
        if (!mission) throw new NotFoundError("Mission introuvable");
        if (mission.clientId !== input.clientId) {
            throw new ValidationError("Cette mission n'appartient pas à ce client");
        }
    }

    if (input.interlocuteurId) {
        const interlocuteur = await prisma.clientInterlocuteur.findUnique({
            where: { id: input.interlocuteurId },
            select: { clientId: true },
        });
        if (!interlocuteur) throw new NotFoundError("Commercial introuvable");
        if (interlocuteur.clientId !== input.clientId) {
            throw new ValidationError("Ce commercial n'appartient pas à ce client");
        }
    }

    return client;
}

export async function createCredential(
    input: CredentialInput,
    actorId: string,
): Promise<VaultCredentialDTO> {
    const client = await assertScope(input);

    const label = input.label?.trim() || `${VAULT_TYPE_LABELS[input.type]} — ${input.login}`;

    const row = await prisma.vaultCredential.create({
        data: {
            clientId: input.clientId,
            missionId: input.missionId || null,
            type: input.type,
            label,
            login: input.login.trim(),
            passwordEnc: input.password ? encrypt(input.password) : null,
            url: input.url?.trim() || null,
            notes: input.notes?.trim() || null,
            interlocuteurId: input.interlocuteurId || null,
            userId: input.userId || null,
            createdById: actorId,
            updatedById: actorId,
        },
        select: CREDENTIAL_SELECT,
    });

    await recordVaultAudit({
        action: "CREATED",
        summary: `Accès créé — ${label} (${client.name})`,
        actorId,
        credentialId: row.id,
        clientId: input.clientId,
        metadata: { login: row.login, type: row.type },
    });

    return toCredentialDTO(row);
}

export async function updateCredential(
    id: string,
    input: Partial<Omit<CredentialInput, "clientId">>,
    actorId: string,
): Promise<VaultCredentialDTO> {
    const existing = await prisma.vaultCredential.findUnique({
        where: { id },
        select: { id: true, clientId: true, label: true },
    });
    if (!existing) throw new NotFoundError("Accès introuvable");

    await assertScope({
        clientId: existing.clientId,
        missionId: input.missionId,
        interlocuteurId: input.interlocuteurId,
    });

    // undefined → untouched · null/"" → cleared · value → re-encrypted
    const passwordEnc =
        input.password === undefined
            ? undefined
            : input.password
                ? encrypt(input.password)
                : null;

    const row = await prisma.vaultCredential.update({
        where: { id },
        data: {
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.label !== undefined ? { label: input.label.trim() } : {}),
            ...(input.login !== undefined ? { login: input.login.trim() } : {}),
            ...(input.url !== undefined ? { url: input.url?.trim() || null } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            ...(input.missionId !== undefined ? { missionId: input.missionId || null } : {}),
            ...(input.interlocuteurId !== undefined
                ? { interlocuteurId: input.interlocuteurId || null }
                : {}),
            ...(passwordEnc !== undefined ? { passwordEnc } : {}),
            updatedById: actorId,
        },
        select: CREDENTIAL_SELECT,
    });

    await recordVaultAudit({
        action: "UPDATED",
        summary: `Accès modifié — ${row.label}`,
        actorId,
        credentialId: row.id,
        clientId: row.client.id,
        metadata: { passwordChanged: passwordEnc !== undefined },
    });

    return toCredentialDTO(row);
}

/**
 * Decrypts the stored password and stamps who asked.
 *
 * The only function in the codebase that returns a vault secret in plaintext.
 */
export async function revealCredential(
    id: string,
    actorId: string,
): Promise<{ password: string; label: string; login: string }> {
    const row = await prisma.vaultCredential.findUnique({
        where: { id },
        select: { id: true, label: true, login: true, passwordEnc: true, clientId: true },
    });
    if (!row) throw new NotFoundError("Accès introuvable");
    if (!row.passwordEnc) throw new NotFoundError("Aucun mot de passe enregistré pour cet accès");

    let password: string;
    try {
        password = decrypt(row.passwordEnc);
    } catch {
        // Wrong or rotated ENCRYPTION_KEY — the row is unrecoverable, and the
        // password has to be reset at the source rather than guessed at here.
        throw new ValidationError(
            "Le mot de passe stocké n'a pas pu être déchiffré. Il doit être réinitialisé.",
        );
    }

    await prisma.vaultCredential.update({
        where: { id },
        data: { lastRevealedAt: new Date(), lastRevealedById: actorId },
    });

    await recordVaultAudit({
        action: "REVEALED",
        summary: `Mot de passe révélé — ${row.label}`,
        actorId,
        credentialId: row.id,
        clientId: row.clientId,
        metadata: { login: row.login },
    });

    return { password, label: row.label, login: row.login };
}

/**
 * Generates a new password, stores it encrypted, and — when the credential is
 * a Captain Prospect portal account — re-hashes `User.password` in the same
 * transaction, so the login the vault shows is the login that actually works.
 */
export async function rotateCredential(
    id: string,
    actorId: string,
    explicitPassword?: string,
): Promise<{ password: string; credential: VaultCredentialDTO; portalSynced: boolean }> {
    const existing = await prisma.vaultCredential.findUnique({
        where: { id },
        select: { id: true, label: true, clientId: true, userId: true, type: true },
    });
    if (!existing) throw new NotFoundError("Accès introuvable");

    const password = explicitPassword?.trim() || generateStrongPassword();
    const portalSynced = !!existing.userId;
    const passwordHash = existing.userId ? await bcrypt.hash(password, 12) : null;

    const row = await prisma.$transaction(async (tx) => {
        if (existing.userId && passwordHash) {
            await tx.user.update({
                where: { id: existing.userId },
                data: { password: passwordHash },
            });
        }
        return tx.vaultCredential.update({
            where: { id },
            data: { passwordEnc: encrypt(password), updatedById: actorId },
            select: CREDENTIAL_SELECT,
        });
    });

    await recordVaultAudit({
        action: "ROTATED",
        summary: `Mot de passe régénéré — ${row.label}${portalSynced ? " (compte portail mis à jour)" : ""}`,
        actorId,
        credentialId: row.id,
        clientId: existing.clientId,
        metadata: { portalSynced, type: existing.type },
    });

    return { password, credential: toCredentialDTO(row), portalSynced };
}

export async function deleteCredential(id: string, actorId: string): Promise<{ id: string }> {
    const existing = await prisma.vaultCredential.findUnique({
        where: { id },
        select: { id: true, label: true, clientId: true },
    });
    if (!existing) throw new NotFoundError("Accès introuvable");

    // Audited BEFORE the delete: the FK nulls `credentialId`, so the summary is
    // what keeps the trail readable afterwards.
    await recordVaultAudit({
        action: "DELETED",
        summary: `Accès supprimé — ${existing.label}`,
        actorId,
        credentialId: existing.id,
        clientId: existing.clientId,
    });

    await prisma.vaultCredential.delete({ where: { id } });
    return { id };
}
