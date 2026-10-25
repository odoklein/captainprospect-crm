import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// ============================================
// MAILBOX ACCESS RULES (single source of truth)
//
// Read:
//   - owner, or a MailboxPermission with canRead
//   - supervisors (MANAGER, DEVELOPER) read every mailbox ("team inbox")
//   - anyone reads a thread they sent a message in (an SDR sending from a
//     mission default mailbox they do not own still sees the replies)
// Send: getMailboxSendAccess (owner, MANAGER, canSend without approval, or an
//   SDR assigned to the mission whose default mailbox it is).
// ============================================

/** Roles that can read every mailbox of the team. */
export const MAILBOX_SUPERVISOR_ROLES = ['MANAGER', 'DEVELOPER'] as const;

export function isMailboxSupervisor(role?: string | null): boolean {
    return !!role && (MAILBOX_SUPERVISOR_ROLES as readonly string[]).includes(role);
}

type MailboxSendAccessInput = {
    mailboxId: string;
    userId: string;
    userRole?: string | null;
    missionId?: string | null;
};

type MailboxSendAccessResult = {
    allowed: boolean;
    mailboxExists: boolean;
    requiresApproval: boolean;
    reason?: string;
};

export async function getMailboxSendAccess({
    mailboxId,
    userId,
    userRole,
    missionId,
}: MailboxSendAccessInput): Promise<MailboxSendAccessResult> {
    const mailbox = await prisma.mailbox.findUnique({
        where: { id: mailboxId },
        select: {
            id: true,
            ownerId: true,
            isActive: true,
            permissions: {
                where: { userId },
                select: {
                    canSend: true,
                    requiresApproval: true,
                },
            },
        },
    });

    if (!mailbox) {
        return {
            allowed: false,
            mailboxExists: false,
            requiresApproval: false,
            reason: 'Boîte mail non trouvée',
        };
    }

    if (!mailbox.isActive) {
        return {
            allowed: false,
            mailboxExists: true,
            requiresApproval: false,
            reason: 'Cette boîte mail est désactivée',
        };
    }

    const permission = mailbox.permissions[0];
    const isOwner = mailbox.ownerId === userId;
    const isManager = userRole === 'MANAGER';

    if (!isOwner && !isManager && permission?.canSend && permission.requiresApproval) {
        return {
            allowed: false,
            mailboxExists: true,
            requiresApproval: true,
            reason: 'Cet envoi nécessite une validation manager',
        };
    }

    if (isOwner || isManager || (permission?.canSend && !permission.requiresApproval)) {
        return {
            allowed: true,
            mailboxExists: true,
            requiresApproval: false,
        };
    }

    if (missionId) {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: {
                defaultMailboxId: true,
                sdrAssignments: { select: { sdrId: true } },
            },
        });

        const isAssignedSdr = mission?.sdrAssignments.some((assignment) => assignment.sdrId === userId) ?? false;

        if (mission?.defaultMailboxId === mailboxId && isAssignedSdr) {
            return {
                allowed: true,
                mailboxExists: true,
                requiresApproval: false,
            };
        }
    }

    return {
        allowed: false,
        mailboxExists: true,
        requiresApproval: false,
        reason: 'Permission d\'envoi non autorisée',
    };
}

// ============================================
// READ ACCESS
// ============================================

type MailboxAccessShape = {
    ownerId: string;
    permissions?: { canRead: boolean }[];
};

/** Synchronous read check on a mailbox already loaded with the user's permissions. */
export function canReadLoadedMailbox(
    mailbox: MailboxAccessShape,
    userId: string,
    role?: string | null,
): boolean {
    if (isMailboxSupervisor(role)) return true;
    if (mailbox.ownerId === userId) return true;
    return (mailbox.permissions ?? []).some((p) => p.canRead);
}

/**
 * Ids of the mailboxes whose threads the user can list.
 * `team` (supervisors only) returns every active mailbox.
 */
export async function getReadableMailboxIds(
    userId: string,
    role?: string | null,
    opts: { team?: boolean } = {},
): Promise<string[]> {
    if (opts.team && isMailboxSupervisor(role)) {
        const all = await prisma.mailbox.findMany({
            where: { isActive: true },
            select: { id: true },
        });
        return all.map((m) => m.id);
    }

    const [owned, permitted] = await Promise.all([
        prisma.mailbox.findMany({
            where: { ownerId: userId, isActive: true },
            select: { id: true },
        }),
        prisma.mailboxPermission.findMany({
            where: { userId, canRead: true, mailbox: { isActive: true } },
            select: { mailboxId: true },
        }),
    ]);

    return Array.from(new Set([...owned.map((m) => m.id), ...permitted.map((p) => p.mailboxId)]));
}

/** Can the user read this single mailbox? */
export async function canReadMailbox(
    mailboxId: string,
    userId: string,
    role?: string | null,
): Promise<boolean> {
    const mailbox = await prisma.mailbox.findUnique({
        where: { id: mailboxId },
        select: {
            ownerId: true,
            permissions: { where: { userId }, select: { canRead: true } },
        },
    });
    if (!mailbox) return false;
    return canReadLoadedMailbox(mailbox, userId, role);
}

/**
 * Prisma filter for the threads a user may see.
 * `mailboxIds` are the readable mailboxes in scope; threads the user sent a
 * message in are always visible (mission default mailbox case).
 */
export function readableThreadWhere(userId: string, mailboxIds: string[]): Prisma.EmailThreadWhereInput {
    return {
        OR: [
            ...(mailboxIds.length > 0 ? [{ mailboxId: { in: mailboxIds } }] : []),
            { emails: { some: { sentById: userId } } },
        ],
    };
}

/**
 * Full read check for one thread: mailbox access, or participation
 * (the user sent at least one email of the thread).
 */
export async function canReadThread(
    thread: { id: string; mailbox: MailboxAccessShape },
    userId: string,
    role?: string | null,
): Promise<boolean> {
    if (canReadLoadedMailbox(thread.mailbox, userId, role)) return true;
    const sent = await prisma.email.findFirst({
        where: { threadId: thread.id, sentById: userId },
        select: { id: true },
    });
    return !!sent;
}

// ============================================
// SENDABLE MAILBOXES
// ============================================

export interface SendableMailbox {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    ownerId: string;
    owner: { id: string; name: string } | null;
    isOwn: boolean;
    isMissionDefault: boolean;
}

/**
 * Mailboxes the user can send from, the mission default first when the user
 * may use it. Managers get their own + shared + the mission default (not the
 * whole team: picking a colleague's mailbox stays an explicit choice in the inbox).
 */
export async function getSendableMailboxes(
    userId: string,
    role?: string | null,
    missionId?: string | null,
): Promise<SendableMailbox[]> {
    const select = {
        id: true,
        email: true,
        displayName: true,
        provider: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
    } as const;

    const [owned, permitted, mission] = await Promise.all([
        prisma.mailbox.findMany({
            where: { ownerId: userId, isActive: true },
            select,
            orderBy: { createdAt: 'asc' },
        }),
        prisma.mailboxPermission.findMany({
            where: { userId, canSend: true, requiresApproval: false, mailbox: { isActive: true } },
            select: { mailbox: { select } },
        }),
        missionId
            ? prisma.mission.findUnique({ where: { id: missionId }, select: { defaultMailboxId: true } })
            : Promise.resolve(null),
    ]);

    const byId = new Map<string, SendableMailbox>();
    const add = (m: (typeof owned)[number]) => {
        if (byId.has(m.id)) return;
        byId.set(m.id, {
            ...m,
            provider: String(m.provider),
            isOwn: m.ownerId === userId,
            isMissionDefault: false,
        });
    };

    let missionDefault: SendableMailbox | null = null;
    if (mission?.defaultMailboxId) {
        const access = await getMailboxSendAccess({
            mailboxId: mission.defaultMailboxId,
            userId,
            userRole: role,
            missionId,
        });
        if (access.allowed) {
            const mb = await prisma.mailbox.findUnique({ where: { id: mission.defaultMailboxId }, select });
            if (mb) {
                missionDefault = {
                    ...mb,
                    provider: String(mb.provider),
                    isOwn: mb.ownerId === userId,
                    isMissionDefault: true,
                };
            }
        }
    }

    owned.forEach(add);
    permitted.forEach((p) => add(p.mailbox));

    const rest = Array.from(byId.values()).filter((m) => m.id !== missionDefault?.id);
    return missionDefault ? [missionDefault, ...rest] : rest;
}
