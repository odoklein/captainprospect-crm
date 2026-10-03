"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ChevronsLeft,
    Menu,
    X,
    Search,
    Command,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarProvider";
import { SidebarUserMenu } from "./SidebarUserMenu";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import { NavSection, NavItem } from "@/lib/navigation/config";
import { findActiveNav, readLastTab, type ActiveNav } from "@/lib/navigation/active";
import { UserRole } from "@prisma/client";
import { formatCallbackDate } from "@/lib/utils/parseDateFromNote";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ManagerSupportSidebarEntry } from "@/components/support/ManagerSupportSidebarEntry";

interface GlobalSidebarProps {
    navigation: NavSection[];
}

function SidebarNavItem({
    item,
    isExpanded,
    onMobileClose,
    active,
    depth = 0,
}: {
    item: NavItem;
    isExpanded: boolean;
    onMobileClose?: () => void;
    active: ActiveNav | null;
    depth?: number;
}) {
    const { hasPermission } = usePermissions();

    if (item.children?.length) {
        return <SidebarHub item={item} isExpanded={isExpanded} onMobileClose={onMobileClose} active={active} />;
    }

    if (item.permission && !hasPermission(item.permission)) {
        return null;
    }

    const isActive = active?.item === item;

    const content = (
        <>
            <div
                className={cn(
                    "cp-nav-icon-wrap",
                    isActive && "cp-nav-icon-active"
                )}
            >
                <item.icon className="w-[16px] h-[16px]" strokeWidth={isActive ? 2 : 1.75} />
            </div>

            <div
                className={cn(
                    "cp-nav-label",
                    isExpanded ? "cp-nav-label-visible" : "cp-nav-label-hidden"
                )}
            >
                <span className="truncate">{item.label}</span>
            </div>

            {item.badge != null && item.badge !== "" && (
                <div
                    className={cn(
                        "cp-nav-badge",
                        isExpanded ? "" : "cp-nav-badge-collapsed"
                    )}
                >
                    {Number(item.badge) > 99 ? "99+" : item.badge}
                </div>
            )}

            {isExpanded && item.badgeDetail && (
                <span className="cp-nav-detail">{item.badgeDetail}</span>
            )}

            {!isExpanded && (
                <div className="cp-tooltip">
                    <div className="cp-tooltip-inner">
                        {item.label}
                        {item.badge != null && item.badge !== "" && (
                            <span className="cp-tooltip-badge">{item.badge}</span>
                        )}
                    </div>
                </div>
            )}
        </>
    );

    const cls = cn(
        "cp-nav-item",
        isActive && "cp-nav-item-active",
        depth > 0 && "ml-3"
    );

    if (item.openInNewTab) {
        return (
            <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onMobileClose}
                className={cls}
            >
                {content}
            </a>
        );
    }

    return (
        <Link href={item.href} onClick={onMobileClose} className={cls}>
            {content}
        </Link>
    );
}

/**
 * A group of pages. Its row opens the tab used last; the chevron folds the
 * pages in and out without navigating. The hub holding the current page
 * opens by itself, the others stay folded to keep the sidebar short.
 */
function SidebarHub({
    item,
    isExpanded,
    onMobileClose,
    active,
}: {
    item: NavItem;
    isExpanded: boolean;
    onMobileClose?: () => void;
    active: ActiveNav | null;
}) {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const isCurrent = active?.item === item;
    // A manual fold only holds while the hub stays (or stays not) current.
    const [manual, setManual] = useState<{ whenCurrent: boolean; open: boolean } | null>(null);
    const open = manual && manual.whenCurrent === isCurrent ? manual.open : isCurrent;

    const children = (item.children ?? []).filter((c) => !c.permission || hasPermission(c.permission));
    if (children.length === 0) return null;

    const first = children[0];
    const badgeTotal = children.reduce((sum, c) => sum + (Number(c.badge) || 0), 0);
    const showOpen = isExpanded && open;

    return (
        <div className="cp-nav-hub">
            <div className="cp-nav-hub-row">
                <Link
                    href={first.href}
                    onClick={(event) => {
                        onMobileClose?.();
                        const last = readLastTab(item);
                        if (last && last !== first.href && children.some((c) => c.href === last)) {
                            event.preventDefault();
                            router.push(last);
                        }
                    }}
                    className={cn(
                        "cp-nav-item",
                        isCurrent && (showOpen ? "cp-nav-hub-current" : "cp-nav-item-active"),
                    )}
                    aria-current={isCurrent && !showOpen ? "page" : undefined}
                >
                    <div className={cn("cp-nav-icon-wrap", isCurrent && "cp-nav-icon-active")}>
                        <item.icon className="w-[16px] h-[16px]" strokeWidth={isCurrent ? 2 : 1.75} />
                    </div>
                    <div className={cn("cp-nav-label", isExpanded ? "cp-nav-label-visible" : "cp-nav-label-hidden")}>
                        <span className="truncate">{item.label}</span>
                    </div>
                    {badgeTotal > 0 && !showOpen && (
                        <div className={cn("cp-nav-badge", isExpanded ? "cp-nav-badge-hub" : "cp-nav-badge-collapsed")}>
                            {badgeTotal > 99 ? "99+" : badgeTotal}
                        </div>
                    )}
                </Link>
                {isExpanded && (
                    <button
                        type="button"
                        onClick={() => setManual({ whenCurrent: isCurrent, open: !open })}
                        className={cn("cp-nav-chevron", showOpen && "cp-nav-chevron-open")}
                        aria-label={showOpen ? `Replier ${item.label}` : `Déplier ${item.label}`}
                        aria-expanded={showOpen}
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {isExpanded && (
                <div className={cn("cp-nav-children-wrap", showOpen && "cp-nav-children-wrap-open")}>
                    <div className="cp-nav-children" aria-hidden={!showOpen}>
                        {children.map((child) => {
                            const isActive = active?.child === child;
                            return (
                                <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={onMobileClose}
                                    tabIndex={showOpen ? 0 : -1}
                                    title={child.description}
                                    aria-current={isActive ? "page" : undefined}
                                    className={cn("cp-nav-child", isActive && "cp-nav-child-active")}
                                >
                                    <span className="truncate">{child.label}</span>
                                    {child.badge != null && child.badge !== "" && (
                                        <span className="cp-nav-child-badge">
                                            {Number(child.badge) > 99 ? "99+" : child.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function SidebarSection({
    section,
    isExpanded,
    onMobileClose,
    isFirst,
    active,
}: {
    section: NavSection;
    isExpanded: boolean;
    onMobileClose?: () => void;
    isFirst?: boolean;
    active: ActiveNav | null;
}) {
    const { hasPermission } = usePermissions();
    const canSee = (item: NavItem) => !item.permission || hasPermission(item.permission);

    const visibleItems = section.items.filter((item) =>
        item.children?.length ? item.children.some(canSee) : canSee(item)
    );

    if (visibleItems.length === 0) return null;

    const isAdminSection = Boolean(section.dividerBefore && !section.title);

    return (
        <div className={cn("cp-nav-section", isAdminSection && "cp-nav-section-admin")}>
            {((section.dividerBefore && !isFirst) || (section.title && !isFirst)) && (
                <div className="cp-section-divider" />
            )}
            {section.title && (
                <div
                    className={cn(
                        "cp-section-title",
                        !isExpanded && "cp-section-title-collapsed"
                    )}
                >
                    {isExpanded ? (
                        <span>{section.title}</span>
                    ) : (
                        <div className="cp-section-dot" />
                    )}
                </div>
            )}

            <div className="cp-nav-items">
                {visibleItems.map((item) => (
                    <SidebarNavItem
                        key={item.href}
                        item={item}
                        isExpanded={isExpanded}
                        onMobileClose={onMobileClose}
                        active={active}
                    />
                ))}
            </div>
        </div>
    );
}

const RAPPELS_HREF = "/sdr/callbacks";
const COMMS_HREFS = [
    "/manager/comms",
    "/sdr/comms",
    "/bd/comms",
    "/developer/comms",
    "/client/comms",
];

export function GlobalSidebar({ navigation }: GlobalSidebarProps) {
    const { data: session } = useSession();
    const {
        isCollapsed,
        isMobileOpen,
        isExpanded,
        toggleCollapsed,
        closeMobile,
        setHovering,
        openSearch,
    } = useSidebar();
    const [callbacksCount, setCallbacksCount] = useState<number | null>(null);
    const [nextCallbackDate, setNextCallbackDate] = useState<string | null>(
        null
    );
    const [commsUnreadCount, setCommsUnreadCount] = useState<number>(0);

    // Session polls every 60s (see Providers.tsx) and lib/auth.ts's jwt() callback
    // re-validates isActive/revocation on each poll. If a manager deactivates this
    // account or force-logs-it-out while the tab stays in the foreground (so it
    // never hits the window-focus refetch), this catches it within that window
    // instead of waiting for the user's next navigation to hit middleware.
    useEffect(() => {
        if (session?.user?.isActive === false) {
            signOut({ callbackUrl: "/blocked" });
        }
    }, [session?.user?.isActive]);

    const userRole = session?.user?.role as UserRole | undefined;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/comms/inbox/stats");
                const json = await res.json();
                if (cancelled) return;
                setCommsUnreadCount((json?.totalUnread ?? 0) as number);
            } catch {
                if (!cancelled) setCommsUnreadCount(0);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (userRole !== "SDR" && userRole !== "BUSINESS_DEVELOPER") return;
        let cancelled = false;
        (async () => {
            try {
                // For SDRs: show only callbacks from their assigned mission in the badge
                // For BDs: show all callbacks from their assigned missions
                const endpoint = userRole === "SDR" 
                    ? "/api/sdr/callbacks/count?assignedOnly=true"
                    : "/api/sdr/callbacks/count";
                const res = await fetch(endpoint);
                const json = await res.json();
                if (cancelled || !json.success) return;
                setCallbacksCount(json.count ?? 0);
                if (json.nextCallbackDate) {
                    const next = new Date(json.nextCallbackDate);
                    setNextCallbackDate(`Proch. ${formatCallbackDate(next)}`);
                } else {
                    setNextCallbackDate(null);
                }
            } catch {
                if (!cancelled) {
                    setCallbacksCount(0);
                    setNextCallbackDate(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userRole]);

    const effectiveNavigation = useMemo(() => {
        const hasRappels = callbacksCount !== null || nextCallbackDate;
        const hasComms = commsUnreadCount > 0;
        if (!hasRappels && !hasComms) return navigation;
        const withBadge = (item: NavItem): NavItem => {
                if (item.children?.length) {
                    return { ...item, children: item.children.map(withBadge) };
                }
                if (item.href === RAPPELS_HREF && hasRappels) {
                    return {
                        ...item,
                        badge:
                            callbacksCount != null
                                ? String(callbacksCount)
                                : undefined,
                        badgeDetail: nextCallbackDate ?? undefined,
                    };
                }
                if (COMMS_HREFS.includes(item.href) && hasComms) {
                    return {
                        ...item,
                        badge: String(commsUnreadCount),
                    };
                }
                return item;
        };
        return navigation.map((section) => ({ ...section, items: section.items.map(withBadge) }));
    }, [navigation, callbacksCount, nextCallbackDate, commsUnreadCount]);

    // Resolved once, from the same objects the sections render, so `===` holds.
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const active = useMemo(
        () => findActiveNav(effectiveNavigation, pathname, (leaf) => !leaf.permission || hasPermission(leaf.permission)),
        [effectiveNavigation, pathname, hasPermission],
    );


    return (
        <>
            {isMobileOpen && (
                <div
                    className="cp-overlay"
                    onClick={closeMobile}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    "cp-sidebar",
                    isCollapsed && !isHoveringState(isExpanded, isCollapsed)
                        ? "cp-sidebar-collapsed"
                        : "cp-sidebar-expanded",
                    isCollapsed &&
                        isHoveringState(isExpanded, isCollapsed) &&
                        "cp-sidebar-hover-expanded",
                    isMobileOpen
                        ? "cp-sidebar-mobile-open"
                        : "cp-sidebar-mobile-closed"
                )}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
            >
                {/* Header */}
                <div className="cp-sidebar-header">
                    <Link
                        href="/"
                        className={cn(
                            "cp-brand",
                            !isExpanded && "cp-brand-collapsed"
                        )}
                    >
                        <div className="flex items-center">
                            {isExpanded ? (
                                <BrandLogo tone="inverse" height={28} priority />
                            ) : (
                                <BrandLogo variant="mark" tone="inverse" height={30} priority />
                            )}
                        </div>
                    </Link>

                    {isExpanded && (
                        <button
                            onClick={toggleCollapsed}
                            className="cp-collapse-btn"
                            aria-label="Réduire la barre latérale"
                        >
                            <ChevronsLeft className="w-4 h-4" />
                        </button>
                    )}

                    <button
                        onClick={closeMobile}
                        className="cp-mobile-close"
                        aria-label="Fermer le menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Quick Search Trigger */}
                {isExpanded ? (
                    <button
                        type="button"
                        className="cp-search-trigger"
                        onClick={openSearch}
                    >
                        <Search className="w-3.5 h-3.5 text-inverse-ink-3" />
                        <span className="cp-search-text">Rechercher…</span>
                        <kbd className="cp-kbd">
                            <Command className="w-2.5 h-2.5" />K
                        </kbd>
                    </button>
                ) : (
                    <button
                        type="button"
                        className="cp-search-trigger-mini"
                        onClick={openSearch}
                        aria-label="Rechercher"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                )}

                {/* Navigation */}
                <nav className="cp-nav">
                    {effectiveNavigation.map((section, idx) => (
                        <SidebarSection
                            key={idx}
                            section={section}
                            isExpanded={isExpanded}
                            onMobileClose={closeMobile}
                            isFirst={idx === 0}
                            active={active}
                        />
                    ))}
                </nav>

                {/* Footer */}
                <div className="cp-sidebar-footer">
                    {/* Manager-only support entry (sits above the profile) */}
                    {userRole === "MANAGER" && (
                        <ManagerSupportSidebarEntry isExpanded={isExpanded} />
                    )}

                    {/* Collapse toggle (when expanded, shows at bottom) */}
                    {!isExpanded && (
                        <button
                            onClick={toggleCollapsed}
                            className="cp-expand-btn"
                            aria-label="Agrandir la barre laterale"
                        >
                            <ChevronsLeft className="w-4 h-4 rotate-180" />
                        </button>
                    )}

                    {/* Profile button + account menu (photo, settings, sign-out) */}
                    <SidebarUserMenu isExpanded={isExpanded} />
                </div>
            </aside>
        </>
    );
}

function isHoveringState(
    isExpanded: boolean,
    isCollapsed: boolean
): boolean {
    return isExpanded && isCollapsed;
}

export function MobileMenuButton() {
    const { toggleMobile } = useSidebar();

    return (
        <button
            onClick={toggleMobile}
            className="lg:hidden p-2 text-ink-3 hover:text-ink hover:bg-surface-3 rounded-lg transition-colors"
            aria-label="Menu"
        >
            <Menu className="w-5 h-5" />
        </button>
    );
}

export default GlobalSidebar;
