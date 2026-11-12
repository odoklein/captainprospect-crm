/** Late SDK events must never mutate a newer call or revive a cancelled attempt. */
export function isCurrentAttempt(key: number, currentKey: number, cancelled: ReadonlySet<number>): boolean {
    return key === currentKey && !cancelled.has(key);
}

/** A company can have several contacts: company identity alone is insufficient. */
export function matchesCallTarget(
    target: { companyId?: string | null; contactId?: string | null },
    prospect: { companyId: string; contactId?: string | null },
): boolean {
    return target.companyId === prospect.companyId && (target.contactId ?? null) === (prospect.contactId ?? null);
}
