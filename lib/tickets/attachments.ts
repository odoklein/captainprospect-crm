/**
 * Screenshots attached to a ticket. Shared by the upload route and the
 * drag-and-drop field so the limits the user is told about are the ones enforced.
 */

export const TICKET_ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const TICKET_ATTACHMENT_MAX_SIZE = 8 * 1024 * 1024;
export const TICKET_ATTACHMENT_MAX_COUNT = 8;

export function isTicketAttachmentType(type: string): boolean {
    return (TICKET_ATTACHMENT_MIME_TYPES as readonly string[]).includes(type);
}

export function ticketAttachmentUrl(ticketId: string, fileId: string): string {
    return `/api/tickets/${ticketId}/attachments/${fileId}`;
}

export function formatAttachmentSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
