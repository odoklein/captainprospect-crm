"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
    LogOut,
    ChevronsLeft,
    Menu,
    X,
    Search,
    Command,
    ChevronRight,
    Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarProvider";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import { NavSection, NavItem, ROLE_CONFIG } from "@/lib/navigation/config";
import { UserRole } from "@prisma/client";
import { formatCallbackDate } from "@/lib/utils/parseDateFromNote";
import logoCaptain from "../../logocaptainroseblanc.png";
import { ManagerSupportSidebarEntry } from "@/components/support/ManagerSupportSidebarEntry";

interface GlobalSidebarProps {
    navigation: NavSection[];
}

function SidebarNavItem({
    item,
    isExpanded,
    onMobileClose,
    depth = 0,
}: {
    item: NavItem;
    isExpanded: boolean;
    onMobileClose?: () => void;
    depth?: number;
}) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();

    if (item.permission && !hasPermission(item.permission)) {
        return null;
    }

    const isActive =
        pathname === item.href ||
        (item.href !== "/" && pathname.startsWith(item.href + "/"));

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

function SidebarSection({
    section,
    isExpanded,
    onMobileClose,
    isFirst,
}: {
    section: NavSection;
    isExpanded: boolean;
    onMobileClose?: () => void;
    isFirst?: boolean;
}) {
    const { hasPermission } = usePermissions();

    const visibleItems = section.items.filter(
        (item) => !item.permission || hasPermission(item.permission)
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
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    const userRole = session?.user?.role as UserRole | undefined;
    const roleConfig = userRole ? ROLE_CONFIG[userRole] : null;

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

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                userMenuRef.current &&
                !userMenuRef.current.contains(e.target as Node)
            ) {
                setShowUserMenu(false);
            }
        }
        if (showUserMenu) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [showUserMenu]);

    const effectiveNavigation = useMemo(() => {
        const hasRappels = callbacksCount !== null || nextCallbackDate;
        const hasComms = commsUnreadCount > 0;
        if (!hasRappels && !hasComms) return navigation;
        return navigation.map((section) => ({
            ...section,
            items: section.items.map((item) => {
                if (item.href === RAPPELS_HREF && hasRappels) {
                    return {
                        ...item,
                        badge:
                            callbacksCount != null
                                ? String(callbacksCount)
                                : undefined,
                        badgeDetail: nextCallbackDate ?? undefined,
                        badgeVariant: "rappels" as const,
                    };
                }
                if (COMMS_HREFS.includes(item.href) && hasComms) {
                    return {
                        ...item,
                        badge: String(commsUnreadCount),
                        badgeVariant: "comms" as const,
                    };
                }
                return item;
            }),
        }));
    }, [navigation, callbacksCount, nextCallbackDate, commsUnreadCount]);

    const userName = session?.user?.name ?? "";
    const userEmail = session?.user?.email ?? "";
    const userInitial = userName.charAt(0).toUpperCase() || "U";

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
                            <Image
                                src={logoCaptain}
                                alt="Captain Prospect"
                                priority
                                className={cn(
                                    "h-7 w-auto",
                                    !isExpanded && "h-8"
                                )}
                            />
                        </div>
                    </Link>

                    {isExpanded && (
                        <button
                            onClick={toggleCollapsed}
                            className="cp-collapse-btn"
                            aria-label="Reduire la barre laterale"
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
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <span className="cp-search-text">Rechercher...</span>
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
                        />
                    ))}
                </nav>

                {/* Footer */}
                <div className="cp-sidebar-footer" ref={userMenuRef}>
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

                    {/* User popover menu */}
                    {showUserMenu && (
                        <div className="cp-user-menu">
                            <div className="cp-user-menu-header">
                                <p className="text-[13px] font-semibold text-white truncate">
                                    {userName}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                    {userEmail}
                                </p>
                            </div>
                            <div className="cp-user-menu-divider" />
                            <div className="cp-user-menu-items">
                                {roleConfig && (
                                    <div className="cp-user-menu-role">
                                        <div
                                            className={cn(
                                                "w-2 h-2 rounded-full",
                                                roleConfig.color === "indigo" &&
                                                    "bg-indigo-500",
                                                roleConfig.color ===
                                                    "emerald" &&
                                                    "bg-emerald-500",
                                                roleConfig.color === "blue" &&
                                                    "bg-blue-500"
                                            )}
                                        />
                                        <span>{roleConfig.label}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() =>
                                        signOut({ callbackUrl: "/login" })
                                    }
                                    className="cp-user-menu-item cp-user-menu-item-danger"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    <span>Deconnexion</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* User button */}
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className={cn(
                            "cp-user-btn",
                            !isExpanded && "cp-user-btn-collapsed"
                        )}
                    >
                        <div className="cp-avatar">
                            <span>{userInitial}</span>
                            <div className="cp-avatar-status" />
                        </div>
                        {isExpanded && (
                            <div className="cp-user-info">
                                <p className="cp-user-name">{userName}</p>
                                <p className="cp-user-role">
                                    {roleConfig?.label ?? "User"}
                                </p>
                            </div>
                        )}
                        {isExpanded && (
                            <ChevronRight
                                className={cn(
                                    "w-3.5 h-3.5 text-slate-400 transition-transform duration-150",
                                    showUserMenu && "rotate-90"
                                )}
                            />
                        )}
                    </button>
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
            className="lg:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Menu"
        >
            <Menu className="w-5 h-5" />
        </button>
    );
}

export default GlobalSidebar;
