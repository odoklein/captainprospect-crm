// ============================================
// ACCESS VAULT — Captain Prospect portal accounts
//
// `POST /api/clients/[id]/interlocuteurs/[iid]/activate-portal` already creates
// a COMMERCIAL account, but it shows the generated password exactly once and
// then it is gone forever (only the bcrypt hash survives). This module does the
// same creation AND files the credential in the vault, so the password stays
// recoverable by a manager instead of ending up in a private message.
// ============================================

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import type { VaultCredentialDTO } from "./types";
import {
    createCredential,
    generateStrongPassword,
    getCredential,
    recordVaultAudit,
} from "./service";

/** Where a portal user signs in. Used as the credential's `url`. */
export function portalLoginUrl(): string {
    const base =
        process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://app.captainprospect.fr";
    return `${base.replace(/\/$/, "")}/login`;
}

interface InterlocuteurEmail {
    value?: string;
    isPrimary?: boolean;
}

/** Primary email if one is flagged, otherwise the first one on file. */
export function primaryEmailOf(emails: unknown): string | null {
    if (!Array.isArray(emails)) return null;
    const list = emails as InterlocuteurEmail[];
    const primary = list.find((e) => e?.isPrimary && e.value)?.value;
    return (primary || list.find((e) => e?.value)?.value || null)?.trim() || null;
}

export interface PortalAccountResult {
    created: boolean;
    /** Only present when the account was created in this call. */
    password: string | null;
    user: { id: string; email: string; name: string; role: string };
    credential: VaultCredentialDTO | null;
    message: string;
}

/**
 * Creates the COMMERCIAL portal account for a client's commercial and stores
 * the credential in the vault.
 *
 * Idempotent: if the account already exists, nothing is created or rotated —
 * the caller is told to rotate instead, which is the recoverable operation.
 */
export async function createPortalAccountForInterlocuteur(
    interlocuteurId: string,
    actorId: string,
    options: { email?: string; missionId?: string | null } = {},
): Promise<PortalAccountResult> {
    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            emails: true,
            clientId: true,
            client: { select: { id: true, name: true } },
            portalUser: { select: { id: true, email: true, name: true, role: true } },
        },
    });
    if (!interlocuteur) throw new NotFoundError("Commercial introuvable");

    const fullName = `${interlocuteur.firstName} ${interlocuteur.lastName}`.trim();

    if (interlocuteur.portalUser) {
        // Already has portal access. Surface the existing vault entry if we
        // have one, so the caller can reveal or rotate rather than recreate.
        const existingCredential = await prisma.vaultCredential.findFirst({
            where: { userId: interlocuteur.portalUser.id, type: "PORTAL" },
            select: { id: true },
        });
        return {
            created: false,
            password: null,
            user: interlocuteur.portalUser,
            credential: existingCredential ? await getCredentialSafe(existingCredential.id) : null,
            message: existingCredential
                ? `${fullName} a déjà un compte portail (${interlocuteur.portalUser.email}). Utilise « révéler » ou « régénérer » sur l'accès existant.`
                : `${fullName} a déjà un compte portail (${interlocuteur.portalUser.email}), mais aucun mot de passe n'est enregistré dans le coffre. Régénère-le pour en stocker un.`,
        };
    }

    const email = (options.email?.trim() || primaryEmailOf(interlocuteur.emails))?.toLowerCase();
    if (!email) {
        throw new ValidationError(
            `${fullName} n'a pas d'email renseigné. Ajoute-lui une adresse avant de créer son accès portail.`,
        );
    }

    const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) {
        throw new ValidationError(`L'email ${email} est déjà utilisé par un autre compte.`);
    }

    if (options.missionId) {
        const mission = await prisma.mission.findUnique({
            where: { id: options.missionId },
            select: { clientId: true },
        });
        if (!mission || mission.clientId !== interlocuteur.clientId) {
            throw new ValidationError("Cette mission n'appartient pas à ce client");
        }
    }

    const password = generateStrongPassword();
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            name: fullName,
            role: "COMMERCIAL",
            isActive: true,
            interlocuteurId: interlocuteur.id,
            clientId: interlocuteur.clientId,
        },
        select: { id: true, email: true, name: true, role: true },
    });

    const credential = await createCredential(
        {
            clientId: interlocuteur.clientId,
            missionId: options.missionId ?? null,
            type: "PORTAL",
            label: `Portail Captain Prospect — ${fullName}`,
            login: email,
            password,
            url: portalLoginUrl(),
            interlocuteurId: interlocuteur.id,
            userId: user.id,
        },
        actorId,
    );

    await recordVaultAudit({
        action: "PORTAL_ACCOUNT_CREATED",
        summary: `Compte portail créé — ${fullName} (${interlocuteur.client.name})`,
        actorId,
        credentialId: credential.id,
        clientId: interlocuteur.clientId,
        metadata: { email, userId: user.id },
    });

    return {
        created: true,
        password,
        user,
        credential,
        message: `Compte portail créé pour ${fullName} (${email}). Le mot de passe est enregistré dans le coffre.`,
    };
}

/** Re-read that tolerates a row vanishing between the two queries. */
async function getCredentialSafe(id: string): Promise<VaultCredentialDTO | null> {
    try {
        return await getCredential(id);
    } catch {
        return null;
    }
}

// ============================================
// Email address proposals
// ============================================

/** Strips accents and anything that has no business in a local part. */
function slugifyNamePart(value: string): string {
    return value
        // NFD splits "é" into "e" + a combining mark; dropping everything
        // outside printable ASCII then leaves the bare letters behind.
        .normalize("NFD")
        .replace(/[^\x20-\x7E]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

/**
 * Builds the usual candidate addresses for a person on a domain, skipping any
 * that a `User` already owns. Proposals only — creating the mailbox itself
 * happens with the provider, not here.
 */
export async function proposeEmailAddresses(params: {
    firstName: string;
    lastName: string;
    domain: string;
}): Promise<{ available: string[]; taken: string[] }> {
    const first = slugifyNamePart(params.firstName);
    const last = slugifyNamePart(params.lastName);
    const domain = params.domain.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "");

    if (!first && !last) throw new ValidationError("Prénom ou nom requis");
    if (!domain) throw new ValidationError("Domaine requis");

    const locals = [
        first && last ? `${first}.${last}` : "",
        first && last ? `${first[0]}${last}` : "",
        first && last ? `${first}${last[0]}` : "",
        first || last,
    ].filter(Boolean);

    const candidates = Array.from(new Set(locals.map((local) => `${local}@${domain}`)));

    const existing = await prisma.user.findMany({
        where: { email: { in: candidates } },
        select: { email: true },
    });
    const takenSet = new Set(existing.map((u) => u.email.toLowerCase()));

    return {
        available: candidates.filter((c) => !takenSet.has(c)),
        taken: candidates.filter((c) => takenSet.has(c)),
    };
}
