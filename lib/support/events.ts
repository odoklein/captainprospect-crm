/**
 * Window event that opens the client's floating support panel
 * (components/support/ClientSupportRoot) from anywhere in the portal,
 * e.g. the "Écrire à l'équipe" button of the home's team card.
 */
export const OPEN_CLIENT_SUPPORT_EVENT = "cp:open-support";

export function openClientSupport(): void {
    window.dispatchEvent(new Event(OPEN_CLIENT_SUPPORT_EVENT));
}
