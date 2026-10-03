'use client';

// TEMPORARY fixture-only preview of the sidebar + top bar (no auth, no DB). Delete before committing.

import { useMemo } from 'react';
import { SidebarProvider } from '@/components/layout/SidebarProvider';
import { GlobalSidebar } from '@/components/layout/GlobalSidebar';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { PermissionContext } from '@/lib/permissions/PermissionProvider';
import { MANAGER_NAV, type NavItem, type NavSection } from '@/lib/navigation/config';
import { useSidebar } from '@/components/layout/SidebarProvider';
import { cn } from '@/lib/utils';

const prefix = (item: NavItem): NavItem => ({
    ...item,
    href: item.href.replace('/manager', '/preview-nav/manager'),
    children: item.children?.map(prefix),
    badge: item.href === '/manager/emails' ? '4' : item.badge,
});
const NAV: NavSection[] = MANAGER_NAV.map((s) => ({ ...s, items: s.items.map(prefix) }));
function Shell() {
    const { isCollapsed } = useSidebar();
    return (
        <div className="cp-layout">
            <GlobalSidebar navigation={NAV} />
            <main className={cn('cp-main', isCollapsed ? 'cp-main-collapsed' : 'cp-main-expanded')}>
                <header className="cp-topbar">
                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                        <SectionTabs navigation={NAV} fallback={{ root: 'Manager', current: 'Page' }} />
                    </div>
                    <div className="h-8 w-8 rounded-lg border border-line" />
                </header>
                <div className="cp-content"><div className="h-96 rounded-2xl border border-dashed border-slate-200" /></div>
            </main>
        </div>
    );
}

export default function PreviewNav() {
    const value = useMemo(() => ({
        permissions: new Set<string>(),
        isLoading: false,
        error: null,
        hasPermission: () => true,
        hasAnyPermission: () => true,
        hasAllPermissions: () => true,
        refreshPermissions: async () => {},
    }), []);
    return (
        <SidebarProvider>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PermissionContext.Provider value={value as any}>
                <Shell />
            </PermissionContext.Provider>
        </SidebarProvider>
    );
}
