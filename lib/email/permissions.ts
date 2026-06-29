import { prisma } from '@/lib/prisma';

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
