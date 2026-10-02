"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { PermissionContextValue } from "./types";

// ============================================
// PERMISSION CONTEXT
// ============================================

export const PermissionContext = createContext<PermissionContextValue | null>(null); // TEMP export for preview-nav — revert

// ============================================
// PERMISSION PROVIDER
// ============================================

interface PermissionProviderProps {
    children: React.ReactNode;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
    const { data: session, status } = useSession();
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch user permissions from API
    const fetchPermissions = useCallback(async () => {
        if (!session?.user?.id) {
            setPermissions(new Set());
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(`/api/users/${session.user.id}/permissions`);

            if (response.status === 404) {
                // User from session no longer exists (db reset?)
                console.warn("User not found via permissions check - session invalid");
                signOut({ callbackUrl: "/login" });
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch permissions");
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.data)) {
                setPermissions(new Set(data.data));
            } else {
                setPermissions(new Set());
            }
        } catch (err) {
            console.error("Error fetching permissions:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
            setPermissions(new Set());
        } finally {
            setIsLoading(false);
        }
    }, [session?.user?.id]);

    // Fetch permissions when session changes
    useEffect(() => {
        if (status === "authenticated") {
            fetchPermissions();
        } else if (status === "unauthenticated") {
            setPermissions(new Set());
            setIsLoading(false);
        }
    }, [status, fetchPermissions]);

    // Check if user has a specific permission
    const hasPermission = useCallback(
        (code: string): boolean => {
            return permissions.has(code);
        },
        [permissions]
    );

    // Check if user has any of the specified permissions
    const hasAnyPermission = useCallback(
        (codes: string[]): boolean => {
            return codes.some((code) => permissions.has(code));
        },
        [permissions]
    );

    // Check if user has all of the specified permissions
    const hasAllPermissions = useCallback(
        (codes: string[]): boolean => {
            return codes.every((code) => permissions.has(code));
        },
        [permissions]
    );

    // Memoized context value
    const contextValue = useMemo<PermissionContextValue>(
        () => ({
            permissions,
            isLoading,
            error,
            hasPermission,
            hasAnyPermission,
            hasAllPermissions,
            refreshPermissions: fetchPermissions,
        }),
        [permissions, isLoading, error, hasPermission, hasAnyPermission, hasAllPermissions, fetchPermissions]
    );

    return (
        <PermissionContext.Provider value={contextValue}>
            {children}
        </PermissionContext.Provider>
    );
}

// ============================================
// HOOKS
// ============================================

/**
 * Hook to access the permission context
 */
export function usePermissions(): PermissionContextValue {
    const context = useContext(PermissionContext);
    if (!context) {
        throw new Error("usePermissions must be used within a PermissionProvider");
    }
    return context;
}

/**
 * Hook to check a single permission
 */
export function useHasPermission(code: string): boolean {
    const { hasPermission, isLoading } = usePermissions();
    // Return false while loading to prevent flash of unauthorized content
    if (isLoading) return false;
    return hasPermission(code);
}

/**
 * Hook to check multiple permissions (any)
 */
export function useHasAnyPermission(codes: string[]): boolean {
    const { hasAnyPermission, isLoading } = usePermissions();
    if (isLoading) return false;
    return hasAnyPermission(codes);
}

/**
 * Hook to check multiple permissions (all)
 */
export function useHasAllPermissions(codes: string[]): boolean {
    const { hasAllPermissions, isLoading } = usePermissions();
    if (isLoading) return false;
    return hasAllPermissions(codes);
}

export default PermissionProvider;
