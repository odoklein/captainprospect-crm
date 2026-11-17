"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";

interface SidebarContextValue {
    isCollapsed: boolean;
    isMobileOpen: boolean;
    isHovering: boolean;
    isExpanded: boolean;
    searchOpen: boolean;
    openSearch: () => void;
    closeSearch: () => void;
    toggleCollapsed: () => void;
    setCollapsed: (collapsed: boolean) => void;
    openMobile: () => void;
    closeMobile: () => void;
    toggleMobile: () => void;
    setHovering: (hovering: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const SIDEBAR_COLLAPSED_KEY = "cp_sidebar_collapsed";

interface SidebarProviderProps {
    children: React.ReactNode;
    defaultCollapsed?: boolean;
}

export function SidebarProvider({
    children,
    defaultCollapsed = false,
}: SidebarProviderProps) {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isExpanded = !isCollapsed || isHovering;

    useEffect(() => {
        const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        if (stored !== null) {
            setIsCollapsed(stored === "true");
        }
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (isHydrated) {
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
        }
    }, [isCollapsed, isHydrated]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024 && isMobileOpen) {
                setIsMobileOpen(false);
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isMobileOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (searchOpen) {
                    setSearchOpen(false);
                    e.preventDefault();
                } else if (isMobileOpen) {
                    setIsMobileOpen(false);
                }
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setSearchOpen((prev) => !prev);
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "b") {
                e.preventDefault();
                setIsCollapsed((prev) => !prev);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isMobileOpen, searchOpen]);

    const toggleCollapsed = useCallback(() => {
        setIsCollapsed((prev) => !prev);
        setIsHovering(false);
    }, []);

    const setCollapsed = useCallback((collapsed: boolean) => {
        setIsCollapsed(collapsed);
    }, []);

    const openMobile = useCallback(() => {
        setIsMobileOpen(true);
    }, []);

    const closeMobile = useCallback(() => {
        setIsMobileOpen(false);
    }, []);

    const toggleMobile = useCallback(() => {
        setIsMobileOpen((prev) => !prev);
    }, []);

    const openSearch = useCallback(() => setSearchOpen(true), []);
    const closeSearch = useCallback(() => setSearchOpen(false), []);

    const handleSetHovering = useCallback((hovering: boolean) => {
        if (!isCollapsed) return;
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        if (hovering) {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsHovering(true);
            }, 200);
        } else {
            hoverTimeoutRef.current = setTimeout(() => {
                setIsHovering(false);
            }, 150);
        }
    }, [isCollapsed]);

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    const contextValue = useMemo<SidebarContextValue>(
        () => ({
            isCollapsed,
            isMobileOpen,
            isHovering,
            isExpanded,
            searchOpen,
            openSearch,
            closeSearch,
            toggleCollapsed,
            setCollapsed,
            openMobile,
            closeMobile,
            toggleMobile,
            setHovering: handleSetHovering,
        }),
        [isCollapsed, isMobileOpen, isHovering, isExpanded, searchOpen, openSearch, closeSearch, toggleCollapsed, setCollapsed, openMobile, closeMobile, toggleMobile, handleSetHovering]
    );

    return (
        <SidebarContext.Provider value={contextValue}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar(): SidebarContextValue {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
}

export default SidebarProvider;
