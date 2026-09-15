"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Command, Target, User, Calendar, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import type { NavSection } from "@/lib/navigation/config";

interface GlobalSearchModalProps {
    open: boolean;
    onClose: () => void;
    navigation: NavSection[];
}

type SearchResultItem =
    | { type: "page"; id: string; href: string; label: string; subtitle?: string; openInNewTab?: boolean }
    | { type: "mission"; id: string; href: string; label: string; subtitle: string }
    | { type: "contact"; id: string; href: string; label: string; subtitle: string }
    | { type: "meeting"; id: string; href: string; label: string; subtitle: string };

function flattenNav(
    navigation: NavSection[],
    hasPermission: (code: string) => boolean
): SearchResultItem[] {
    const out: SearchResultItem[] = [];
    for (const section of navigation) {
        for (const item of section.items) {
            if (item.permission && !hasPermission(item.permission)) continue;
            if (item.children?.length) {
                for (const child of item.children) {
                    if (child.permission && !hasPermission(child.permission)) continue;
                    out.push({
                        type: "page",
                        id: child.href,
                        href: child.href,
                        label: child.label,
                        openInNewTab: child.openInNewTab,
                    });
                }
            } else {
                out.push({
                    type: "page",
                    id: item.href,
                    href: item.href,
                    label: item.label,
                    openInNewTab: item.openInNewTab,
                });
            }
        }
    }
    return out;
}

const SEARCH_LIMIT = 5;
const DEBOUNCE_MS = 280;

export function GlobalSearchModal({ open, onClose, navigation }: GlobalSearchModalProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const { hasPermission } = usePermissions();
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [missions, setMissions] = useState<SearchResultItem[]>([]);
    const [contacts, setContacts] = useState<SearchResultItem[]>([]);
    const [meetings, setMeetings] = useState<SearchResultItem[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const userRole = session?.user?.role as string | undefined;
    const clientId = (session?.user as { clientId?: string })?.clientId;

    const pageItems = useMemo(
        () => flattenNav(navigation, hasPermission),
        [navigation, hasPermission]
    );

    const filteredPages = useMemo(() => {
        if (!query.trim()) return pageItems;
        const q = query.trim().toLowerCase();
        return pageItems.filter(
            (i) =>
                i.label.toLowerCase().includes(q) ||
                (i.href && i.href.toLowerCase().includes(q))
        );
    }, [pageItems, query]);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [query, open]);

    const fetchMissions = useCallback(async (q: string) => {
        const res = await fetch(
            `/api/missions?search=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}&page=1`
        );
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) return [];
        return json.data.map((m: { id: string; name: string; client?: { id?: string; name: string } }) => ({
            type: "mission" as const,
            id: m.id,
            // Missions live inside the client drawer now.
            href: m.client?.id
                ? `/manager/clients?client=${m.client.id}&mission=${m.id}`
                : `/manager/missions/${m.id}`,
            label: m.name,
            subtitle: m.client?.name ?? "",
        }));
    }, []);

    const fetchContacts = useCallback(async (q: string) => {
        const res = await fetch(
            `/api/contacts?search=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}&page=1`
        );
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) return [];
        const isManager = userRole === "MANAGER";
        const listBase = isManager ? "/manager/lists" : "/sdr/lists";
        const noListHref = isManager ? "/manager/lists" : `/sdr/contacts`;
        return json.data.map(
            (c: {
                id: string;
                firstName?: string | null;
                lastName?: string | null;
                company?: { id: string; name: string; listId?: string | null };
            }) => {
                const companyId = c.company?.id ?? "";
                const listId = c.company?.listId ?? null;
                const href = listId
                    ? `${listBase}/${listId}?contactId=${c.id}&companyId=${companyId}`
                    : isManager ? "/manager/lists" : `${noListHref}/${c.id}`;
                return {
                    type: "contact" as const,
                    id: c.id,
                    href,
                    label: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Sans nom",
                    subtitle: c.company?.name ?? "",
                };
            }
        );
    }, [userRole]);

    const fetchMeetingsSdr = useCallback(async (q: string) => {
        const res = await fetch(`/api/sdr/meetings?search=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) return [];
        return json.data.slice(0, SEARCH_LIMIT).map(
            (m: {
                id: string;
                contact: { firstName?: string | null; lastName?: string | null; company?: { name: string } };
                mission?: { name: string } | null;
            }) => ({
                type: "meeting" as const,
                id: m.id,
                href: "/sdr/meetings",
                label:
                    [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ") ||
                    "Contact",
                subtitle: [m.contact?.company?.name, m.mission?.name].filter(Boolean).join(" · ") || "RDV",
            })
        );
    }, []);

    const fetchMeetingsClient = useCallback(
        async (q: string) => {
            if (!clientId) return [];
            const res = await fetch(
                `/api/clients/${clientId}/meetings?search=${encodeURIComponent(q)}`
            );
            const json = await res.json();
            const data = json.data;
            const list = data?.allMeetings ?? [];
            return list.slice(0, SEARCH_LIMIT).map(
                (m: {
                    id: string;
                    contact: { firstName?: string | null; lastName?: string | null; company?: { name: string } };
                    campaign?: { mission?: { name: string } };
                }) => ({
                    type: "meeting" as const,
                    id: m.id,
                    href: "/client/portal/meetings",
                    label:
                        [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ") ||
                        "Contact",
                    subtitle:
                        [m.contact?.company?.name, m.campaign?.mission?.name].filter(Boolean).join(" · ") ||
                        "RDV",
                })
            );
        },
        [clientId]
    );

    useEffect(() => {
        if (!open || debouncedQuery.length < 2) {
            setMissions([]);
            setContacts([]);
            setMeetings([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            const canMissions =
                userRole === "MANAGER" || userRole === "SDR" || userRole === "BUSINESS_DEVELOPER";
            const canContacts = userRole === "MANAGER" || userRole === "SDR";
            const canMeetingsSdr = userRole === "SDR";
            const canMeetingsClient = userRole === "CLIENT" && !!clientId;

            const [missionList, contactList, meetingList] = await Promise.all([
                canMissions ? fetchMissions(debouncedQuery) : Promise.resolve([]),
                canContacts ? fetchContacts(debouncedQuery) : Promise.resolve([]),
                canMeetingsSdr
                    ? fetchMeetingsSdr(debouncedQuery)
                    : canMeetingsClient
                      ? fetchMeetingsClient(debouncedQuery)
                      : Promise.resolve([]),
            ]);
            if (cancelled) return;
            setMissions(missionList);
            setContacts(contactList);
            setMeetings(meetingList);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [
        open,
        debouncedQuery,
        userRole,
        clientId,
        fetchMissions,
        fetchContacts,
        fetchMeetingsSdr,
        fetchMeetingsClient,
    ]);

    const sections = useMemo(() => {
        const list: { title: string; icon: React.ReactNode; items: SearchResultItem[] }[] = [];
        if (filteredPages.length > 0) {
            list.push({ title: "Pages", icon: <FileText className="w-3.5 h-3.5" />, items: filteredPages });
        }
        if (missions.length > 0) {
            list.push({ title: "Missions", icon: <Target className="w-3.5 h-3.5" />, items: missions });
        }
        if (contacts.length > 0) {
            list.push({ title: "Contacts", icon: <User className="w-3.5 h-3.5" />, items: contacts });
        }
        if (meetings.length > 0) {
            list.push({ title: "RDV", icon: <Calendar className="w-3.5 h-3.5" />, items: meetings });
        }
        return list;
    }, [filteredPages, missions, contacts, meetings]);

    const flatItems = useMemo(
        () => sections.flatMap((s) => s.items),
        [sections]
    );

    const totalItems = flatItems.length;

    useEffect(() => {
        setSelectedIndex((prev) => (totalItems ? Math.min(prev, totalItems - 1) : 0));
    }, [totalItems]);

    const navigateToItem = useCallback(
        (item: SearchResultItem) => {
            if (item.type === "page" && item.openInNewTab) {
                window.open(item.href, "_blank");
            } else {
                router.push(item.href);
            }
            onClose();
        },
        [router, onClose]
    );

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
                return;
            }
            if (e.key === "Enter" && flatItems[selectedIndex]) {
                e.preventDefault();
                navigateToItem(flatItems[selectedIndex]);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose, totalItems, flatItems, selectedIndex, navigateToItem]);

    useEffect(() => {
        if (open) {
            setQuery("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    if (!open) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm"
                aria-hidden
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Recherche rapide"
                className="fixed left-1/2 top-[20%] -translate-x-1/2 z-[101] w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                    <Search className="w-5 h-5 text-slate-400 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher pages, missions, contacts, RDV..."
                        className="flex-1 min-w-0 bg-transparent border-0 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-xs font-medium">
                        <Command className="w-3 h-3" />K
                    </kbd>
                </div>
                <div
                    ref={listRef}
                    className="max-h-[min(60vh,400px)] overflow-y-auto py-2"
                >
                    {loading && debouncedQuery.length >= 2 ? (
                        <div className="px-4 py-6 text-center text-slate-500 text-sm">
                            Recherche en cours...
                        </div>
                    ) : totalItems === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-sm">
                            {query.trim()
                                ? `Aucun résultat pour "${query.trim()}"`
                                : "Tapez pour rechercher dans les pages, missions, contacts et RDV"}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sections.map((section) => (
                                <div key={section.title}>
                                    <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        {section.icon}
                                        {section.title}
                                    </div>
                                    <ul className="space-y-0.5">
                                        {section.items.map((item) => {
                                            const idx = flatItems.indexOf(item);
                                            const isSelected = idx === selectedIndex;
                                            return (
                                                <li key={`${item.type}-${item.id}`}>
                                                    <a
                                                        href={item.href}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            navigateToItem(item);
                                                        }}
                                                        onMouseEnter={() => setSelectedIndex(idx)}
                                                        className={cn(
                                                            "flex flex-col gap-0.5 px-4 py-2.5 text-sm transition-colors",
                                                            isSelected
                                                                ? "bg-indigo-50 text-indigo-800"
                                                                : "text-slate-700 hover:bg-slate-50"
                                                        )}
                                                    >
                                                        <span className="truncate font-medium">
                                                            {item.label}
                                                        </span>
                                                        {item.subtitle && (
                                                            <span
                                                                className={cn(
                                                                    "text-xs truncate",
                                                                    isSelected
                                                                        ? "text-indigo-600/80"
                                                                        : "text-slate-500"
                                                                )}
                                                            >
                                                                {item.subtitle}
                                                            </span>
                                                        )}
                                                        {item.type === "page" && item.openInNewTab && (
                                                            <span className="text-[10px] text-slate-400">
                                                                Nouvel onglet
                                                            </span>
                                                        )}
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
