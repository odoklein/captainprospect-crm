"use client";

// ============================================
// /manager/prospection — « Appels »: the missions on a channel and what their
// SDRs did, mission by mission, in the shared workspace frame
// (components/workspace).
//
//   rail (320px)     every mission as a card that says whether it needs the
//                    manager, most urgent first (MissionRail, lib/missions/board)
//   control center   the open mission: its numbers, how its contacts ended,
//                    one row per contact (or every action), each one opening
//                    the same action drawer the SDR uses
//
// The open mission is in the URL (?channel=&mission=); [ and ] switch
// missions and the filters stay. On a wide screen the most urgent mission
// opens by itself; on a phone the rail is the page. The data refreshes every
// 30 s: new actions wait in a « +N » pill so the rows never move under the
// keyboard cursor.
// ============================================

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, Download, Layers, Mic, RefreshCw, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { ManagerCallEnrichmentSyncModal } from "@/components/prospection/ManagerCallEnrichmentSyncModal";
import { ProspectionExportModal } from "@/components/prospection/ProspectionExportModal";
import type { ExportPreview } from "@/lib/prospection-export/workbook";
import { boardEntry, sortBoard, type MissionPulseRow } from "@/lib/missions/board";
import { isReached, statusFamily } from "@/lib/workspace/status-family";
import { StatusDistribution } from "@/components/calls/StatusDistribution";
import { StatusPill } from "@/components/workspace/StatusPill";
import { useWorkspaceKeys } from "@/components/workspace/useWorkspaceKeys";
import {
    CONTROL, DateRangeButton, EmptyBlock, FacetSelect, FIRST_CELL, ICON_CONTROL, KeyHints, LAST_CELL, LoadingBar, Metric,
    MetricStrip, PagerButton, PRIMARY_CONTROL, ResetButton, SearchField, ShortcutsDialog, TableSkeleton, TD, TH, ToggleChip,
    ViewTabs, WorkspaceFooter, WorkspaceFrame, WorkspaceHeader, WorkspaceMain, WorkspaceToolbar, useWide, type ShortcutGroup,
} from "@/components/workspace/Workspace";
import { CHANNELS, MissionRail, VerdictChip, type ChannelValue } from "./MissionRail";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false },
);

// ─────────────────────────────────────────────────────────────────────────────

type SortKey = "createdAt" | "result" | "sdr" | "name" | "duration";
type SortDir = "asc" | "desc";
type ViewMode = "latest_per_contact" | "all_actions";

interface ActionRecord {
    id: string;
    contactId: string | null;
    companyId: string | null;
    contact: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        company: { id: string; name: string; listId?: string };
    } | null;
    company: { id: string; name: string; listId?: string } | null;
    sdr: { id: string; name: string } | null;
    channel: string;
    result: string;
    note?: string;
    callSummary?: string | null;
    callTranscription?: string | null;
    callRecordingUrl?: string | null;
    duration?: number;
    createdAt: string;
    callbackDate?: string | null;
    _searchKey?: string;
}

interface ActionStats {
    total: number;
    resultBreakdown: Record<string, number>;
    avgDuration: number;
    conversionRate: string;
    replied: number;
    repliedRate: string;
}

interface StatusDef {
    code: string;
    label: string;
    color: string | null;
    resultCategoryCode: string | null;
}

interface Interlocuteur {
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
    emails: Array<{ value: string; label: string; isPrimary: boolean }>;
    phones: Array<{ value: string; label: string; isPrimary: boolean }>;
    bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
    isActive: boolean;
}

/** The export dialog wants a list of channels: the one on screen. */
const ONLY_CHANNEL: Record<ChannelValue, ChannelValue[]> = { CALL: ["CALL"], EMAIL: ["EMAIL"], LINKEDIN: ["LINKEDIN"] };

const PAGE_SIZE = 100;
const LIVE_MS = 30_000;
const DAY_MS = 86_400_000;

const contactName = (a: ActionRecord) => `${a.contact?.firstName || ""} ${a.contact?.lastName || ""}`.trim();
const companyName = (a: ActionRecord) => a.company?.name || a.contact?.company?.name || "";
const listIdOf = (a: ActionRecord) => a.company?.listId || a.contact?.company?.listId || "";
const companyIdOf = (a: ActionRecord) => a.companyId || a.contact?.company?.id || a.company?.id || "";

function prettify(code: string) {
    const s = code.toLowerCase().replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function withSearchKey(a: ActionRecord): ActionRecord {
    return { ...a, _searchKey: [contactName(a), companyName(a), a.note, a.callSummary, a.callTranscription].filter(Boolean).join(" ").toLowerCase() };
}

/** A callback's due date, as the manager reads it. */
function callbackContext(date: string | null | undefined, now: number): { text: string; tone: "overdue" | "soon" | "ok" } | null {
    if (!date) return null;
    const cb = new Date(date).getTime();
    if (Number.isNaN(cb)) return null;
    const ms = cb - now;
    const days = Math.round(ms / DAY_MS);
    if (ms < -DAY_MS) return { text: `Rappel en retard de ${Math.abs(days)} j`, tone: "overdue" };
    if (ms < 0) return { text: "Rappel à faire", tone: "overdue" };
    if (days === 0) return { text: "Rappel aujourd'hui", tone: "soon" };
    if (days === 1) return { text: "Rappel demain", tone: "soon" };
    if (days < 7) return { text: `Rappel dans ${days} j`, tone: "ok" };
    return { text: `Rappel le ${new Date(cb).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`, tone: "ok" };
}

function exportCSV(rows: ActionRecord[], mission: string, label: (code: string) => string) {
    const headers = ["Date (création action)", "Contact", "Société", "SDR", "Résultat", "Résumé / Note", "Durée (s)"];
    const lines = rows.map((r) => {
        const note = (r.callSummary?.trim() || r.note || "").replace(/"/g, '""');
        return [new Date(r.createdAt).toLocaleString("fr-FR"), contactName(r), companyName(r), r.sdr?.name ?? "", label(r.result), `"${note}"`, r.duration ?? ""].join(",");
    });
    const blob = new Blob([headers.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prospection_${mission}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

function Sparkline({ data }: { data: number[] }) {
    if (data.length < 2 || data.every((v) => v === 0)) return null;
    const max = Math.max(...data, 1);
    const W = 48;
    const H = 16;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - (v / max) * (H - 2) - 1}`).join(" ");
    return (
        <svg width={W} height={H} className="shrink-0 self-center text-primary" aria-hidden>
            <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

const fetchJson = async <T,>(url: string): Promise<T> => {
    const j = await fetch(url).then((r) => r.json());
    if (!j?.success) throw new Error(j?.error || "Chargement impossible");
    return j.data as T;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ManagerProspectionPage() {
    return (
        <Suspense fallback={null}>
            <Prospection />
        </Suspense>
    );
}

/** The channel on screen (?channel=), CALL by default. */
function useChannelParam(): ChannelValue {
    const raw = (useSearchParams().get("channel") || "CALL").toUpperCase();
    return CHANNELS.some((c) => c.value === raw) ? (raw as ChannelValue) : "CALL";
}

function Prospection() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { error: showError, success: showSuccess } = useToast();
    const wide = useWide();
    const toast = useCallback(
        (kind: "success" | "error", title: string, message?: string) => (kind === "success" ? showSuccess(title, message) : showError(title, message)),
        [showSuccess, showError],
    );

    const channel = useChannelParam();
    const missionParam = searchParams.get("mission");
    const go = useCallback(
        (ch: ChannelValue, mission: string | null) => router.replace(`/manager/prospection?channel=${ch}${mission ? `&mission=${mission}` : ""}`, { scroll: false }),
        [router],
    );

    // ── the rail ─────────────────────────────────────────────────────────────
    const pulse = useQuery({
        queryKey: ["manager", "missions-pulse", channel],
        queryFn: () => fetchJson<MissionPulseRow[]>(`/api/manager/missions/pulse?channel=${channel}`),
        refetchInterval: 60_000,
    });
    const { data: statusDefs = [] } = useQuery({
        queryKey: ["manager", "action-statuses", "global"],
        queryFn: () => fetchJson<StatusDef[]>("/api/manager/action-statuses/global"),
        staleTime: 10 * 60_000,
    });
    const { data: sdrOptions = [] } = useQuery({
        queryKey: ["users", "SDR,BUSINESS_DEVELOPER"],
        queryFn: () => fetchJson<{ id: string; name: string }[]>("/api/users?role=SDR,BUSINESS_DEVELOPER").then((d) => (Array.isArray(d) ? d : [])),
        staleTime: 10 * 60_000,
    });

    // Re-render the « on it now » dots and callback deadlines as time passes.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);

    const [railSearch, setRailSearch] = useState("");
    const [railClient, setRailClient] = useState("");
    const [railSdr, setRailSdr] = useState("");
    const board = useMemo(() => sortBoard((pulse.data ?? []).map((r) => boardEntry(r, now))), [pulse.data, now]);
    const railEntries = useMemo(() => {
        const q = railSearch.trim().toLowerCase();
        return board.filter((e) => {
            if (railClient && e.row.client?.id !== railClient) return false;
            if (railSdr && !e.row.sdrs.some((s) => s.id === railSdr)) return false;
            if (q && !`${e.row.name} ${e.row.client?.name ?? ""}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [board, railSearch, railClient, railSdr]);
    const railClients = useMemo(() => {
        const m = new Map<string, string>();
        board.forEach((e) => e.row.client && m.set(e.row.client.id, e.row.client.name));
        return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }, [board]);
    const railSdrs = useMemo(() => {
        const m = new Map<string, string>();
        board.forEach((e) => e.row.sdrs.forEach((s) => m.set(s.id, s.name)));
        return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }, [board]);

    const selected = board.find((e) => e.row.id === missionParam) ?? null;
    const mission = selected?.row ?? null;

    // Wide screen, no mission asked for (or one no longer on this channel): open the most urgent one.
    useEffect(() => {
        if (!wide || !pulse.data || selected) return;
        const first = railEntries[0] ?? board[0];
        if (first) go(channel, first.row.id);
    }, [wide, pulse.data, selected, railEntries, board, channel, go]);

    const switchChannel = (ch: ChannelValue) => go(ch, mission && mission.channels.includes(ch) ? mission.id : null);
    const stepMission = (delta: number) => {
        if (!railEntries.length) return;
        const i = railEntries.findIndex((e) => e.row.id === mission?.id);
        const next = railEntries[Math.max(0, Math.min(railEntries.length - 1, (i < 0 ? 0 : i) + delta))];
        if (next) {
            go(channel, next.row.id);
            document.querySelector(`[data-mission="${next.row.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
    };

    // ── the open mission's filters (they stay when the mission changes, except the list) ──
    const [search, setSearch] = useState("");
    const [sdrFilter, setSdrFilter] = useState("");
    const [listFilter, setListFilter] = useState("");
    const [resultFilters, setResultFilters] = useState<Set<string>>(new Set());
    const [dueOnly, setDueOnly] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("createdAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [viewMode, setViewMode] = useState<ViewMode>("latest_per_contact");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [cursor, setCursor] = useState(0);
    const [drawerAction, setDrawerAction] = useState<ActionRecord | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [callSyncOpen, setCallSyncOpen] = useState(false);
    const [bulkSyncOpen, setBulkSyncOpen] = useState(false);
    const [help, setHelp] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const railSearchRef = useRef<HTMLInputElement>(null);

    // A different mission: what belonged to the previous one goes.
    const [shownMission, setShownMission] = useState<string | null>(null);
    if ((mission?.id ?? null) !== shownMission) {
        setShownMission(mission?.id ?? null);
        setListFilter("");
        setSelectedIds(new Set());
        setPage(1);
        setCursor(0);
        setDrawerAction(null);
    }

    // ── data of the open mission ────────────────────────────────────────────
    const dataKey = mission ? `${mission.id}|${listFilter}` : null;
    const [loaded, setLoaded] = useState<{ key: string; mission: string; actions: ActionRecord[] } | null>(null);
    const [pending, setPending] = useState<{ key: string; actions: ActionRecord[]; added: number } | null>(null);
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [reload, setReload] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const loadedRef = useRef(loaded);
    useLayoutEffect(() => {
        loadedRef.current = loaded;
    });

    useEffect(() => {
        if (!dataKey) return;
        const [mid, list] = dataKey.split("|");
        const ctrl = new AbortController();
        const load = (silent: boolean) =>
            fetch(`/api/actions?missionId=${mid}&limit=2000${list ? `&listId=${encodeURIComponent(list)}` : ""}`, { signal: ctrl.signal })
                .then((r) => r.json())
                .then((j) => {
                    if (ctrl.signal.aborted || !j?.success) return;
                    const next: ActionRecord[] = (j.data || []).map(withSearchKey);
                    setLastRefresh(new Date());
                    setRefreshing(false);
                    const cur = loadedRef.current;
                    if (silent && cur?.key === dataKey) {
                        const known = new Set(cur.actions.map((a) => a.id));
                        const added = next.filter((a) => !known.has(a.id)).length;
                        // New rows wait in the « +N » pill: the table never moves under the cursor.
                        if (added > 0) {
                            setPending({ key: dataKey, actions: next, added });
                            return;
                        }
                    }
                    setLoaded({ key: dataKey, mission: mid, actions: next });
                })
                .catch(() => {
                    if (!ctrl.signal.aborted) setRefreshing(false);
                });
        void load(false);
        const t = setInterval(() => void load(true), LIVE_MS);
        return () => {
            ctrl.abort();
            clearInterval(t);
        };
    }, [dataKey, reload]);

    const applyPending = () => {
        if (!pending || pending.key !== dataKey) return;
        const known = new Set(loaded?.actions.map((a) => a.id));
        setFresh(new Set(pending.actions.filter((a) => !known.has(a.id)).map((a) => a.id)));
        setLoaded({ key: pending.key, mission: mission!.id, actions: pending.actions });
        setPending(null);
        setPage(1);
        setCursor(0);
        setTimeout(() => setFresh(new Set()), 2500);
    };
    const newCount = pending && pending.key === dataKey ? pending.added : 0;

    // Server numbers: they cover every action of the mission, not only the 2 000 loaded.
    const statsKey = mission ? `${mission.id}|${sdrFilter}|${listFilter}|${channel}|${dateFrom}|${dateTo}|${reload}` : null;
    const [stats, setStats] = useState<{ mission: string; data: ActionStats } | null>(null);
    useEffect(() => {
        if (!statsKey) return;
        const [mid, sdr, list, ch, from, to] = statsKey.split("|");
        const qs = new URLSearchParams({ channel: ch });
        if (sdr) qs.set("sdrId", sdr);
        if (list) qs.set("listId", list);
        if (from) qs.set("from", `${from}T00:00:00`);
        if (to) qs.set("to", `${to}T23:59:59.999`);
        const ctrl = new AbortController();
        const load = () =>
            fetch(`/api/missions/${mid}/action-stats?${qs}`, { signal: ctrl.signal })
                .then((r) => r.json())
                .then((j) => {
                    if (!ctrl.signal.aborted && j?.success) setStats({ mission: mid, data: j.data });
                })
                .catch(() => {});
        void load();
        const t = setInterval(() => void load(), LIVE_MS);
        return () => {
            ctrl.abort();
            clearInterval(t);
        };
    }, [statsKey]);

    // Lists of the mission (names + counts) for the list filter and the export dialog.
    const [listsOf, setListsOf] = useState<{ mission: string; lists: ExportPreview["lists"] } | null>(null);
    useEffect(() => {
        if (!mission) return;
        const ctrl = new AbortController();
        fetch(`/api/missions/${mission.id}/prospection-export/preview`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((j) => {
                if (!ctrl.signal.aborted && j?.success) setListsOf({ mission: mission.id, lists: (j.data as ExportPreview).lists });
            })
            .catch(() => {});
        return () => ctrl.abort();
    }, [mission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // The client's booking link and contacts, for a meeting booked from the drawer.
    const [booking, setBooking] = useState<{ mission: string; url: string; interlocuteurs: Interlocuteur[] } | null>(null);
    const drawerOpen = Boolean(drawerAction);
    useEffect(() => {
        if (!drawerOpen || !mission) return;
        const ctrl = new AbortController();
        fetch(`/api/missions/${mission.id}/client-booking`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((j) => {
                if (ctrl.signal.aborted) return;
                setBooking({
                    mission: mission.id,
                    url: j?.success ? j.data?.bookingUrl || "" : "",
                    interlocuteurs: j?.success && Array.isArray(j.data?.interlocuteurs) ? j.data.interlocuteurs : [],
                });
            })
            .catch(() => {});
        return () => ctrl.abort();
    }, [drawerOpen, mission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshAll = () => {
        setRefreshing(true);
        setReload((n) => n + 1);
        void pulse.refetch();
    };

    // ── derived ──────────────────────────────────────────────────────────────
    const defs = useMemo(() => new Map(statusDefs.map((d) => [d.code, d])), [statusDefs]);
    const statusOf = useCallback(
        (code: string) => {
            const d = defs.get(code);
            return {
                label: d?.label?.trim() || ACTION_RESULT_LABELS[code] || prettify(code),
                color: d?.color && /^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : null,
                category: d?.resultCategoryCode ?? null,
            };
        },
        [defs],
    );

    const openId = mission?.id ?? null;
    const missionLists = useMemo(() => (listsOf && listsOf.mission === openId ? listsOf.lists : []), [listsOf, openId]);
    const actions = useMemo(
        () => (loaded && loaded.mission === openId ? loaded.actions.filter((a) => a.channel === channel) : []),
        [loaded, openId, channel],
    );
    const loadingData = Boolean(mission) && loaded?.key !== dataKey;
    const missionStats = stats && stats.mission === mission?.id ? stats.data : null;

    // Latest action per contact/company — once a prospect is re-qualified it
    // shows and counts under its new status only, not both.
    const latestPerContact = useMemo(() => {
        const map = new Map<string, ActionRecord>();
        for (const a of actions) {
            const key = a.contactId ? `contact:${a.contactId}` : a.companyId ? `company:${a.companyId}` : `action:${a.id}`;
            const existing = map.get(key);
            if (!existing || new Date(a.createdAt).getTime() > new Date(existing.createdAt).getTime()) map.set(key, a);
        }
        return Array.from(map.values());
    }, [actions]);

    const endOfToday = useMemo(() => {
        const d = new Date(now);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }, [now]);
    const isDue = useCallback(
        (a: ActionRecord) => statusFamily(a.result, statusOf(a.result).category) === "pending" && !!a.callbackDate && new Date(a.callbackDate).getTime() <= endOfToday,
        [statusOf, endOfToday],
    );
    const dueCallbacks = useMemo(() => latestPerContact.filter(isDue), [latestPerContact, isDue]);
    const startOfToday = endOfToday - DAY_MS + 1;
    const overdue = dueCallbacks.filter((a) => new Date(a.callbackDate!).getTime() < startOfToday).length;

    const displayActions = viewMode === "latest_per_contact" ? latestPerContact : actions;

    // Everything but the status chips, so the chip counts follow the other filters.
    const scopedActions = useMemo(() => {
        const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
        const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
        const q = search.trim().toLowerCase();
        return displayActions.filter((a) => {
            if (sdrFilter && a.sdr?.id !== sdrFilter) return false;
            if (q && !a._searchKey?.includes(q)) return false;
            if (dueOnly && !isDue(a)) return false;
            if (fromTs || toTs) {
                const ts = new Date(a.callbackDate || a.createdAt).getTime();
                if (fromTs && ts < fromTs) return false;
                if (toTs && ts > toTs) return false;
            }
            return true;
        });
    }, [displayActions, sdrFilter, search, dueOnly, isDue, dateFrom, dateTo]);

    const distribution = useMemo(() => {
        const counts = new Map<string, number>();
        scopedActions.forEach((a) => counts.set(a.result, (counts.get(a.result) ?? 0) + 1));
        // Statuses filtered on stay listed (at 0) so they can be switched off.
        resultFilters.forEach((r) => counts.has(r) || counts.set(r, 0));
        return [...counts]
            .map(([id, count]) => ({ id, count, label: statusOf(id).label, color: statusOf(id).color }))
            .sort((a, b) => b.count - a.count);
    }, [scopedActions, resultFilters, statusOf]);

    const sdrFacet = useMemo(() => {
        const m = new Map<string, { label: string; count: number }>();
        displayActions.forEach((a) => {
            if (!a.sdr) return;
            const cur = m.get(a.sdr.id);
            m.set(a.sdr.id, { label: a.sdr.name, count: (cur?.count ?? 0) + 1 });
        });
        return [...m].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
    }, [displayActions]);

    const processed = useMemo(() => {
        const rows = scopedActions.filter((a) => !resultFilters.size || resultFilters.has(a.result));
        rows.sort((a, b) => {
            let cmp = 0;
            if (sortKey === "createdAt") cmp = new Date(a.callbackDate || a.createdAt).getTime() - new Date(b.callbackDate || b.createdAt).getTime();
            else if (sortKey === "result") cmp = statusOf(a.result).label.localeCompare(statusOf(b.result).label, "fr");
            else if (sortKey === "sdr") cmp = (a.sdr?.name || "").localeCompare(b.sdr?.name || "", "fr");
            else if (sortKey === "duration") cmp = (a.duration || 0) - (b.duration || 0);
            else cmp = (contactName(a) || companyName(a)).localeCompare(contactName(b) || companyName(b), "fr");
            return sortDir === "asc" ? cmp : -cmp;
        });
        return rows;
    }, [scopedActions, resultFilters, sortKey, sortDir, statusOf]);

    const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageRows = processed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const cur = pageRows.length ? (cursor < 0 ? pageRows.length - 1 : Math.min(cursor, pageRows.length - 1)) : 0;
    const listNameById = useMemo(
        () => (missionLists.length > 1 && !listFilter ? new Map(missionLists.map((l) => [l.id, l.name])) : null),
        [missionLists, listFilter],
    );

    const hourly = useMemo(() => {
        const buckets = Array(8).fill(0) as number[];
        actions.forEach((a) => {
            const idx = Math.floor((now - new Date(a.createdAt).getTime()) / 3_600_000);
            if (idx >= 0 && idx < 8) buckets[7 - idx]++;
        });
        return buckets;
    }, [actions, now]);

    const kpi = useMemo(() => {
        const s = missionStats;
        if (!s) return null;
        const reached = Object.entries(s.resultBreakdown).reduce((n, [code, c]) => (isReached(code, statusOf(code).category) ? n + c : n), 0);
        return { total: s.total, reached, meetings: s.resultBreakdown.MEETING_BOOKED ?? 0, rate: Number(s.conversionRate), avg: s.avgDuration, replied: s.replied, repliedRate: Number(s.repliedRate) };
    }, [missionStats, statusOf]);

    const hasFilters = Boolean(search || sdrFilter || listFilter || resultFilters.size || dateFrom || dateTo || dueOnly);
    const resetFilters = () => {
        setSearch("");
        setSdrFilter("");
        setListFilter("");
        setResultFilters(new Set());
        setDateFrom("");
        setDateTo("");
        setDueOnly(false);
        setPage(1);
    };
    const toggleResult = (r: string) => {
        setResultFilters((prev) => {
            const next = new Set(prev);
            if (next.has(r)) next.delete(r);
            else next.add(r);
            return next;
        });
        setPage(1);
    };
    const toggleRow = (id: string) =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
    const togglePage = () =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            pageRows.forEach((r) => (allPageSelected ? next.delete(r.id) : next.add(r.id)));
            return next;
        });
    const sortBy = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortKey(key);
            setSortDir("desc");
        }
        setPage(1);
    };
    const openRow = (row: ActionRecord, index: number) => {
        setCursor(index);
        if (companyIdOf(row)) setDrawerAction(row);
        else toggleRow(row.id);
    };
    const move = (delta: number) => {
        if (!pageRows.length) return;
        const next = cur + delta;
        if (next >= pageRows.length) {
            if (safePage < totalPages) {
                setPage(safePage + 1);
                setCursor(0);
            }
            return;
        }
        if (next < 0) {
            if (safePage > 1) {
                setPage(safePage - 1);
                setCursor(-1);
            }
            return;
        }
        setCursor(next);
        document.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };

    useWorkspaceKeys(
        {
            j: () => move(1),
            ArrowDown: () => move(1),
            k: () => move(-1),
            ArrowUp: () => move(-1),
            Enter: () => pageRows[cur] && openRow(pageRows[cur], cur),
            x: () => pageRows[cur] && toggleRow(pageRows[cur].id),
            "[": () => stepMission(-1),
            "]": () => stepMission(1),
            r: newCount ? applyPending : null,
            "/": () => (mission ? searchRef.current?.focus() : railSearchRef.current?.focus()),
            "1": () => setViewMode("latest_per_contact"),
            "2": () => setViewMode("all_actions"),
            Escape: () => selectedIds.size && setSelectedIds(new Set()),
            "?": () => setHelp(true),
        },
        !drawerOpen,
    );

    const shortcuts: ShortcutGroup[] = [
        { title: "Se déplacer", keys: [[["j"], "Ligne suivante"], [["k"], "Ligne précédente"], [["[", "]"], "Mission précédente, suivante"], [["1", "2"], "Par contact, Historique"], [["/"], "Rechercher"]] },
        { title: "Agir", keys: [[["Entrée"], "Ouvrir le contact"], [["x"], "Sélectionner la ligne"], [["r"], "Afficher les nouvelles actions"], [["Échap"], "Vider la sélection"], [["?"], "Cette aide"]] },
    ];

    const showRail = wide !== false || !mission;
    const missionSupportsCall = Boolean(mission?.channels.includes("CALL"));
    const unit = channel === "CALL" ? "appels" : channel === "EMAIL" ? "emails" : "actions";

    return (
        <WorkspaceFrame>
            {showRail && (
                <MissionRail
                    className={cn(wide === false ? "w-full" : "w-[320px] shrink-0")}
                    channel={channel}
                    onChannel={switchChannel}
                    entries={railEntries}
                    total={board.length}
                    loading={pulse.isLoading}
                    selectedId={mission?.id ?? null}
                    onSelect={(id) => go(channel, id)}
                    search={railSearch}
                    onSearch={setRailSearch}
                    searchRef={railSearchRef}
                    clients={railClients}
                    clientId={railClient}
                    onClient={setRailClient}
                    sdrs={railSdrs}
                    sdrId={railSdr}
                    onSdr={setRailSdr}
                    onSyncAll={channel === "CALL" ? () => setBulkSyncOpen(true) : undefined}
                    now={now}
                />
            )}

            {mission && selected ? (
                <WorkspaceMain>
                    <WorkspaceHeader
                        leading={
                            wide === false ? (
                                <button type="button" onClick={() => go(channel, null)} className={ICON_CONTROL} aria-label="Retour aux missions">
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                            ) : undefined
                        }
                        title={mission.name}
                        badge={<VerdictChip verdict={selected.verdict} />}
                        subtitle={
                            <>
                                {mission.client?.name ?? "Sans client"}
                                {lastRefresh && (
                                    <span className="text-ink-4">
                                        {" "}
                                        · actualisé à {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}, toutes les 30 s
                                    </span>
                                )}
                            </>
                        }
                        actions={
                            <>
                                <button type="button" onClick={refreshAll} disabled={refreshing} aria-label="Actualiser" title="Actualiser" className={ICON_CONTROL}>
                                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin motion-reduce:animate-none")} />
                                </button>
                                {missionSupportsCall && channel === "CALL" && (
                                    <button type="button" onClick={() => setCallSyncOpen(true)} className={CONTROL} title="Rattacher les enregistrements et résumés Allo de cette mission">
                                        <Mic className="h-3.5 w-3.5" /> Sync Allo
                                    </button>
                                )}
                                <Link href={`/manager/missions/${mission.id}`} className={cn(CONTROL, "hidden sm:flex")}>
                                    Fiche mission
                                </Link>
                                <button type="button" onClick={() => setExportOpen(true)} className={PRIMARY_CONTROL}>
                                    <Download className="h-3.5 w-3.5" /> Exporter
                                </button>
                            </>
                        }
                        tabs={
                            <ViewTabs<ViewMode>
                                label="Vue"
                                value={viewMode}
                                onChange={(v) => {
                                    setViewMode(v);
                                    setPage(1);
                                    setCursor(0);
                                }}
                                tabs={[
                                    { id: "latest_per_contact", label: "Dernier statut par contact", count: latestPerContact.length, hotkey: "1" },
                                    { id: "all_actions", label: "Historique complet", count: actions.length, hotkey: "2" },
                                ]}
                            />
                        }
                    />

                    <WorkspaceToolbar>
                        <SearchField value={search} onChange={(v) => { setSearch(v); setPage(1); }} inputRef={searchRef} placeholder="Contact, société, mot de la note ou de l'appel…" />
                        <FacetSelect label="SDR" value={sdrFilter} options={sdrFacet} onChange={(v) => { setSdrFilter(v); setPage(1); }} />
                        {missionLists.length > 1 && (
                            <FacetSelect
                                label="Liste"
                                value={listFilter}
                                allLabel="Toutes"
                                options={missionLists.map((l) => ({
                                    id: l.id,
                                    label: `${l.name}${l.rows !== null && l.rows ? ` · ${Math.round(((l.treatedRows ?? 0) / l.rows) * 100)} % traité` : ""}${l.isArchived ? " (archivée)" : ""}`,
                                }))}
                                onChange={(v) => { setListFilter(v); setPage(1); setSelectedIds(new Set()); }}
                            />
                        )}
                        <DateRangeButton
                            start={dateFrom}
                            end={dateTo}
                            active={Boolean(dateFrom || dateTo)}
                            emptyLabel="Toutes les dates"
                            onChange={(s, e) => { setDateFrom(s); setDateTo(e); setPage(1); }}
                            onClear={() => { setDateFrom(""); setDateTo(""); }}
                            note="Date de l'action, ou du rappel prévu."
                        />
                        {hasFilters && <ResetButton onClick={resetFilters} />}
                        <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-3 tabular-nums">
                            {newCount > 0 && (
                                <button type="button" onClick={applyPending} className="cp-press flex h-7 items-center gap-1 rounded-full bg-primary px-2.5 text-[12px] font-medium text-primary-fg" title="Afficher (r)">
                                    <ArrowUp className="h-3 w-3" /> {newCount} nouvelle{newCount > 1 ? "s" : ""}
                                </button>
                            )}
                            {processed.length} ligne{processed.length > 1 ? "s" : ""}
                            {hasFilters && ` sur ${displayActions.length}`}
                        </span>
                    </WorkspaceToolbar>

                    <div className="@container relative min-h-0 flex-1 overflow-auto pb-12" aria-busy={loadingData}>
                        <LoadingBar loading={loadingData || refreshing} />
                        <MetricStrip
                            loading={!kpi}
                            after={
                                distribution.length > 0 ? (
                                    <div className="mt-4 hidden sm:block">
                                        <StatusDistribution items={distribution} selected={[...resultFilters]} onToggle={toggleResult} />
                                    </div>
                                ) : null
                            }
                        >
                            <Metric
                                label={channel === "CALL" ? "Appels" : "Actions"}
                                value={kpi ? kpi.total.toLocaleString("fr-FR") : "…"}
                                hint={<Sparkline data={hourly} />}
                                title="Sur la période et les filtres choisis ; la courbe montre les 8 dernières heures"
                            />
                            {channel === "CALL" ? (
                                <Metric
                                    label="Joints"
                                    value={kpi ? kpi.reached.toLocaleString("fr-FR") : "…"}
                                    hint={kpi && kpi.total ? `${Math.round((kpi.reached / kpi.total) * 100)} %` : undefined}
                                    title="Appels où le prospect a décroché (tout sauf « pas de réponse » et barrage)"
                                />
                            ) : (
                                <Metric label="Réponses" value={kpi ? kpi.replied.toLocaleString("fr-FR") : "…"} hint={kpi ? `${kpi.repliedRate.toLocaleString("fr-FR")} %` : undefined} />
                            )}
                            <Metric
                                label="RDV"
                                value={kpi ? kpi.meetings.toLocaleString("fr-FR") : "…"}
                                hint={kpi ? `${kpi.rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : undefined}
                            />
                            <Metric
                                label="Rappels dus"
                                value={dueCallbacks.length}
                                tone={overdue > 0 ? "danger" : dueCallbacks.length > 0 ? "warning" : undefined}
                                hint={dueCallbacks.length ? (overdue ? `dont ${overdue} en retard` : "aujourd'hui") : "aucun"}
                                onClick={dueCallbacks.length ? () => { setDueOnly((v) => !v); setViewMode("latest_per_contact"); setPage(1); } : undefined}
                                title="Contacts dont le rappel prévu tombe aujourd'hui ou est passé"
                            />
                            {channel === "CALL" && <Metric label="Durée moyenne" value={kpi && kpi.avg ? `${Math.floor(kpi.avg / 60)}:${String(kpi.avg % 60).padStart(2, "0")}` : "—"} />}
                        </MetricStrip>
                        {dueOnly && (
                            <div className="flex items-center gap-2 border-b border-line-subtle bg-warning-soft px-4 py-2 text-[12.5px] text-warning-ink sm:px-6">
                                Rappels dus seulement
                                <ToggleChip pressed onClick={() => setDueOnly(false)}>
                                    <X className="h-3 w-3" /> Tout afficher
                                </ToggleChip>
                            </div>
                        )}

                        {loadingData && actions.length === 0 ? (
                            <TableSkeleton />
                        ) : processed.length === 0 ? (
                            hasFilters ? (
                                <EmptyBlock
                                    title="Aucune ligne ne correspond"
                                    body="Retirez un filtre ou élargissez les dates."
                                    action={
                                        <button type="button" onClick={resetFilters} className={CONTROL}>
                                            Réinitialiser les filtres
                                        </button>
                                    }
                                />
                            ) : (
                                <EmptyBlock title={`Aucune action ${channel === "CALL" ? "d'appel" : channel === "EMAIL" ? "email" : "LinkedIn"} sur cette mission`} body="Les actions des SDR apparaissent ici dès qu'elles sont enregistrées." />
                            )
                        ) : (
                            <table className={cn("w-full table-fixed border-collapse bg-surface text-[13px] transition-opacity", loadingData && "opacity-60")} aria-label="Actions de la mission">
                                <thead className="sticky top-0 z-[1]">
                                    <tr className="bg-surface-2/95 shadow-[inset_0_-1px_0_var(--ds-line)] backdrop-blur">
                                        <th className={cn(TH, FIRST_CELL, "hidden w-[48px] @min-[480px]:table-cell sm:w-[56px]")}>
                                            <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Sélectionner toute la page" className="h-4 w-4 cursor-pointer accent-primary-600" />
                                        </th>
                                        <SortTh label="Date" k="createdAt" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden w-[104px] @min-[560px]:table-cell" />
                                        <SortTh label="Contact" k="name" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="pl-4 @min-[480px]:pl-3" />
                                        <SortTh label="Statut" k="result" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="w-[150px] @min-[720px]:w-[200px]" />
                                        <th className={cn(TH, "hidden w-[26%] @min-[1100px]:table-cell")}>Résumé ou note</th>
                                        <SortTh label="Durée" k="duration" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden w-[80px] @min-[560px]:table-cell" />
                                        <SortTh label="SDR" k="sdr" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden w-[148px] @min-[820px]:table-cell" />
                                        <th className={cn(TH, LAST_CELL, "hidden w-[40px] @min-[480px]:table-cell")} aria-label="Ouvrir" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map((row, i) => {
                                        const s = statusOf(row.result);
                                        const cb = isDue(row) || row.callbackDate ? callbackContext(row.callbackDate, now) : null;
                                        const name = contactName(row) || companyName(row) || "—";
                                        const company = companyName(row);
                                        const summary = row.callSummary?.trim() || row.note?.trim() || "";
                                        const checked = selectedIds.has(row.id);
                                        const active = i === cur;
                                        const at = new Date(row.createdAt);
                                        return (
                                            <tr
                                                key={row.id}
                                                data-row={i}
                                                onClick={() => openRow(row, i)}
                                                aria-selected={checked}
                                                className={cn(
                                                    "group cursor-pointer scroll-mt-9 border-b border-line-subtle transition-colors duration-150",
                                                    checked ? "bg-primary-soft" : active ? "bg-primary-soft/50" : fresh.has(row.id) ? "bg-warning-soft/60" : "hover:bg-surface-2",
                                                )}
                                            >
                                                <td className={cn(TD, FIRST_CELL, "hidden @min-[480px]:table-cell", active && "shadow-[inset_2px_0_0_var(--ds-primary)]")} onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={checked} onChange={() => toggleRow(row.id)} aria-label={`Sélectionner ${name}`} className="h-4 w-4 cursor-pointer accent-primary-600" />
                                                </td>
                                                <td className={cn(TD, "hidden whitespace-nowrap text-[12px] tabular-nums text-ink-2 @min-[560px]:table-cell")}>
                                                    {at.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                                                    <span className="ml-1.5 text-ink-3">{at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                                                </td>
                                                <td className={cn(TD, "min-w-0 pl-4 @min-[480px]:pl-3", active && "shadow-[inset_2px_0_0_var(--ds-primary)] @min-[480px]:shadow-none")}>
                                                    <p className="truncate font-medium text-ink">{name}</p>
                                                    <p className="truncate text-[12px] text-ink-3">
                                                        <span className="mr-1.5 tabular-nums @min-[560px]:hidden">{at.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                                                        {company && company !== name ? company : row.sdr?.name && <span className="@min-[820px]:hidden">{row.sdr.name}</span>}
                                                        {listNameById?.get(listIdOf(row)) && (
                                                            <span className="ml-1.5 inline-flex items-center gap-1 text-ink-4">
                                                                <Layers className="h-3 w-3" aria-hidden />
                                                                {listNameById.get(listIdOf(row))}
                                                            </span>
                                                        )}
                                                    </p>
                                                </td>
                                                <td className={cn(TD, "min-w-0")}>
                                                    <StatusPill label={s.label} color={s.color} family={statusFamily(row.result, s.category)} summary={Boolean(row.callSummary)} />
                                                    {cb && (
                                                        <p className={cn("mt-0.5 truncate text-[11.5px] font-medium tabular-nums", cb.tone === "overdue" ? "text-danger-ink" : cb.tone === "soon" ? "text-warning-ink" : "text-ink-3")}>
                                                            {cb.text}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className={cn(TD, "hidden @min-[1100px]:table-cell")}>
                                                    {summary ? <p className="line-clamp-2 text-[12px] text-ink-3" title={summary}>{summary}</p> : <span className="text-ink-4">—</span>}
                                                </td>
                                                <td className={cn(TD, "hidden whitespace-nowrap tabular-nums text-ink-2 @min-[560px]:table-cell")}>
                                                    {row.duration ? `${Math.floor(row.duration / 60)}:${String(row.duration % 60).padStart(2, "0")}` : <span className="text-ink-4">—</span>}
                                                </td>
                                                <td className={cn(TD, "hidden @min-[820px]:table-cell")}>
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[9.5px] font-semibold text-ink-2" aria-hidden>
                                                            {(row.sdr?.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                                                        </span>
                                                        <span className="truncate text-ink-2">{row.sdr?.name ?? "—"}</span>
                                                    </span>
                                                </td>
                                                <td className={cn(TD, LAST_CELL, "hidden text-right @min-[480px]:table-cell")}>
                                                    <ChevronRight className={cn("ml-auto h-4 w-4 text-ink-4 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")} aria-hidden />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {(processed.length > 0 || selectedIds.size > 0) && (
                        <WorkspaceFooter>
                            {selectedIds.size > 0 ? (
                                <>
                                    <span className="mr-auto font-medium text-ink">
                                        {selectedIds.size} ligne{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => exportCSV(processed.filter((r) => selectedIds.has(r.id)), `${mission.name}_selection`, (c) => statusOf(c).label)}
                                        className={CONTROL}
                                    >
                                        <Download className="h-3.5 w-3.5" /> Exporter la sélection
                                    </button>
                                    <button type="button" onClick={() => setSelectedIds(new Set())} className={CONTROL}>
                                        <X className="h-3.5 w-3.5" /> Désélectionner
                                    </button>
                                </>
                            ) : (
                                <>
                                    <KeyHints hints={[[["j", "k"], "se déplacer"], [["Entrée"], "ouvrir"], [["[", "]"], "mission"]]} onHelp={() => setHelp(true)} />
                                    <span className="tabular-nums">
                                        {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(processed.length, safePage * PAGE_SIZE)} sur {processed.length.toLocaleString("fr-FR")}
                                    </span>
                                    {totalPages > 1 && (
                                        <div className="flex gap-1">
                                            <PagerButton disabled={safePage <= 1} onClick={() => { setPage(safePage - 1); setCursor(0); }}>
                                                Précédent
                                            </PagerButton>
                                            <PagerButton disabled={safePage >= totalPages} onClick={() => { setPage(safePage + 1); setCursor(0); }}>
                                                Suivant
                                            </PagerButton>
                                        </div>
                                    )}
                                </>
                            )}
                        </WorkspaceFooter>
                    )}
                </WorkspaceMain>
            ) : (
                wide !== false && (
                    <WorkspaceMain className="items-center justify-center">
                        {pulse.isLoading ? (
                            <TableSkeleton rows={6} />
                        ) : (
                            <EmptyBlock
                                title={board.length ? "Choisissez une mission" : "Aucune mission active sur ce canal"}
                                body={board.length ? "Ses actions et ses chiffres s'affichent ici." : `Les missions actives ou en pause qui prospectent en ${CHANNELS.find((c) => c.value === channel)?.label.toLowerCase()} apparaissent à gauche.`}
                            />
                        )}
                    </WorkspaceMain>
                )
            )}

            {channel === "CALL" && (
                <ManagerCallEnrichmentSyncModal
                    isOpen={bulkSyncOpen}
                    onClose={() => setBulkSyncOpen(false)}
                    onSynced={() => void pulse.refetch()}
                    onToast={toast}
                />
            )}
            {mission && missionSupportsCall && (
                <ManagerCallEnrichmentSyncModal
                    isOpen={callSyncOpen}
                    onClose={() => setCallSyncOpen(false)}
                    missionId={mission.id}
                    missionName={mission.name}
                    onSynced={() => setReload((n) => n + 1)}
                    onToast={toast}
                />
            )}
            {mission && (
                <ProspectionExportModal
                    isOpen={exportOpen}
                    onClose={() => setExportOpen(false)}
                    missionId={mission.id}
                    missionName={mission.name}
                    sdrOptions={sdrOptions}
                    initial={{
                        listIds: listFilter ? [listFilter] : null,
                        // Table chips are current statuses only in the one-row-per-contact view.
                        statuses: viewMode === "latest_per_contact" ? [...resultFilters] : [],
                        sdrIds: sdrFilter ? [sdrFilter] : [],
                        channels: ONLY_CHANNEL[channel],
                        from: dateFrom,
                        to: dateTo,
                    }}
                    onToast={toast}
                />
            )}
            {mission && drawerAction && companyIdOf(drawerAction) && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => setDrawerAction(null)}
                    contactId={drawerAction.contactId || null}
                    companyId={companyIdOf(drawerAction)}
                    missionId={mission.id}
                    missionName={mission.name}
                    enableGooglePhoneLookup
                    clientBookingUrl={(booking?.mission === mission.id && booking.url) || undefined}
                    clientInterlocuteurs={booking?.mission === mission.id ? booking.interlocuteurs : []}
                    onActionRecorded={() => setReload((n) => n + 1)}
                    onContactSelect={(newContactId) => setDrawerAction({ ...drawerAction, contactId: newContactId })}
                />
            )}
            <ShortcutsDialog open={help} onClose={() => setHelp(false)} groups={shortcuts} />
            <span className="sr-only" role="status">
                {mission ? `${mission.name} : ${processed.length} ${unit}` : ""}
            </span>
        </WorkspaceFrame>
    );
}

function SortTh({
    label,
    k,
    sortKey,
    dir,
    onSort,
    className,
}: {
    label: string;
    k: SortKey;
    sortKey: SortKey;
    dir: SortDir;
    onSort: (k: SortKey) => void;
    className?: string;
}) {
    const active = sortKey === k;
    const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;
    return (
        <th className={cn(TH, className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
            <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 rounded hover:text-ink", active && "text-ink")}>
                {label}
                <Icon className={cn("h-3 w-3", !active && "opacity-40")} aria-hidden />
            </button>
        </th>
    );
}
