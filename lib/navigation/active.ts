import type { NavItem, NavSection } from "./config";

/**
 * Where the current URL sits in a navigation: the top-level entry (a hub or a
 * plain link) and, for a hub, the child tab. Shared by the sidebar and the top
 * bar so they always agree.
 */
export interface ActiveNav {
    item: NavItem;
    child: NavItem | null;
}

function matches(pathname: string, href: string): boolean {
    return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * The longest matching route wins: /manager/billing/clients belongs to
 * Facturation › Clients, not to /manager/clients nor to /manager/billing.
 */
export function findActiveNav(
    navigation: NavSection[],
    pathname: string,
    canSee: (item: NavItem) => boolean = () => true,
): ActiveNav | null {
    let best: (ActiveNav & { length: number }) | null = null;
    for (const section of navigation) {
        for (const item of section.items) {
            const leaves = item.children?.length ? item.children : [item];
            for (const leaf of leaves) {
                if (!canSee(leaf) || !matches(pathname, leaf.href)) continue;
                if (!best || leaf.href.length > best.length) {
                    best = { item, child: item.children?.length ? leaf : null, length: leaf.href.length };
                }
            }
        }
    }
    return best ? { item: best.item, child: best.child } : null;
}

/** Stable key of a hub, used to remember its last tab. */
export function hubKey(item: NavItem): string {
    return item.label;
}

const LAST_TAB_PREFIX = "nav.lastTab.";

export function readLastTab(item: NavItem): string | null {
    try {
        return window.localStorage.getItem(LAST_TAB_PREFIX + hubKey(item));
    } catch {
        return null;
    }
}

export function writeLastTab(item: NavItem, href: string) {
    try {
        window.localStorage.setItem(LAST_TAB_PREFIX + hubKey(item), href);
    } catch {
        /* a convenience only */
    }
}
