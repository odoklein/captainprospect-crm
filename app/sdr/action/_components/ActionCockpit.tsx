"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmModal, useToast } from "@/components/ui";
import { useSidebar } from "@/components/layout/SidebarProvider";
import { AlreadyContactedModal, type AlreadyContactedInfo } from "@/components/sdr/AlreadyContactedModal";
import { ScriptCompanionDrawer } from "@/components/sdr/ScriptCompanionDrawer";
import { QuickEmailModal } from "@/components/email/QuickEmailModal";
import { usePersistentState } from "@/hooks/usePersistentState";
import { prefetchDrawerData } from "../_lib/drawer-prefetch";
import {
    applyQueueView,
    computeSegmentCounts,
    DEFAULT_FILTERS,
    displayName,
    effectiveLastAction,
    isRecentlyContacted,
    rowKey,
    rowPhone,
    scopeItems,
    statusCounts,
    type QueueContext,
    type QueueFilters,
} from "../_lib/queue-selectors";
import { labelForStatus } from "../_lib/status-ui";
import type { DoneEntry, QueueItem } from "../_lib/types";
import { useActionQueue } from "../_hooks/useActionQueue";
import { useDefaultMailbox } from "../_hooks/useDefaultMailbox";
import { actionInputForRow, postAction, runLimited } from "../_hooks/useLogAction";
import { QUICK_OUTCOME_SLOTS, useQueueKeyboard } from "../_hooks/useQueueKeyboard";
import { useStatusConfig } from "../_hooks/useStatusConfig";
import { useWorkspaceScope } from "../_hooks/useWorkspaceScope";
import { BulkBar } from "./BulkBar";
import { CockpitHeader } from "./CockpitHeader";
import { CommandBar } from "./CommandBar";
import type { OutcomeSubmission } from "./InlineOutcomeComposer";
import { Kbd } from "./primitives";
import { QueueEmpty, QueueError, QueueSkeleton, type EmptyReason } from "./QueueStates";
import { queueRowDomId, QueueTable, type ComposerState } from "./QueueTable";
import type { RowHandlers, RowModel } from "./QueueRow";
import { SegmentRail } from "./SegmentRail";
import { ShortcutsDialog } from "./ShortcutsDialog";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false },
);

const PREFS_STORAGE_KEY = "sdr_action_prefs_v1";
const SEARCH_DEBOUNCE_MS = 350;
const MAX_CALL_SECONDS = 7200;

type QueuePrefs = Pick<QueueFilters, "type" | "sort" | "hideDone">;
type QueueView = Pick<QueueFilters, "segment" | "status" | "channel">;
const DEFAULT_PREFS: QueuePrefs = { type: DEFAULT_FILTERS.type, sort: DEFAULT_FILTERS.sort, hideDone: DEFAULT_FILTERS.hideDone };
const DEFAULT_VIEW: QueueView = { segment: DEFAULT_FILTERS.segment, status: DEFAULT_FILTERS.status, channel: DEFAULT_FILTERS.channel };

const isPrefs = (v: unknown): boolean =>
    !!v && typeof v === "object" && "type" in v && "sort" in v && "hideDone" in v;

function todayKey() {
    const d = new Date();
    return `sdr_done_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface DrawerState {
    row: QueueItem;
    contactId: string | null;
    initialResult?: string;
    /** Something was logged in this drawer session → refresh the queue on close. */
    dirty: boolean;
}

export function ActionCockpit() {
    const { data: session } = useSession();
    const currentUserId = session?.user?.id;
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const { setCollapsed: setSidebarCollapsed } = useSidebar();

    // ── Scope, config, data ─────────────────────────────────────────────────
    const scope = useWorkspaceScope();
    const status = useStatusConfig(scope.missionId);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), searchInput.trim() ? SEARCH_DEBOUNCE_MS : 0);
        return () => clearTimeout(t);
    }, [searchInput]);

    const queue = useActionQueue(scope.missionId, scope.listId, search);

    // Durable preferences (type, sort, hide-done) are remembered; the current
    // view (segment, status, channel) is not — tomorrow starts on the full queue.
    const [prefs, setPrefs] = usePersistentState<QueuePrefs>(PREFS_STORAGE_KEY, DEFAULT_PREFS, isPrefs);
    const [view, setView] = useState<QueueView>(DEFAULT_VIEW);
    const filters: QueueFilters = useMemo(() => ({ ...DEFAULT_FILTERS, ...prefs, ...view }), [prefs, view]);
    const patchFilters = useCallback((patch: Partial<QueueFilters>) => {
        const { type, sort, hideDone, segment, status: statusCode, channel } = patch;
        if (type !== undefined || sort !== undefined || hideDone !== undefined) {
            setPrefs((p) => ({ type: type ?? p.type, sort: sort ?? p.sort, hideDone: hideDone ?? p.hideDone }));
        }
        if (segment !== undefined || statusCode !== undefined || channel !== undefined) {
            setView((v) => ({ segment: segment ?? v.segment, status: statusCode ?? v.status, channel: channel ?? v.channel }));
        }
    }, [setPrefs]);

    // Relative labels ("dans 5 min", "En retard") stay honest without reloads.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // ── Session state ───────────────────────────────────────────────────────
    const [done, setDone] = useState<Map<string, DoneEntry>>(() => new Map());
    const [doneToday, setDoneToday] = usePersistentState<number>(todayKey(), 0, (v) => typeof v === "number");
    const markDone = useCallback((keys: string[], result: string | null) => {
        setDone((prev) => {
            const next = new Map(prev);
            const at = Date.now();
            for (const k of keys) next.set(k, { result, at });
            return next;
        });
        setDoneToday((n) => n + keys.length);
    }, [setDoneToday]);

    const ctx: QueueContext = useMemo(
        () => ({ callbackCodes: status.callbackCodes, toneOf: status.toneOf, now }),
        [status.callbackCodes, status.toneOf, now],
    );
    const scoped = useMemo(() => scopeItems(queue.items, filters), [queue.items, filters]);
    const segmentCounts = useMemo(() => computeSegmentCounts(scoped, ctx), [scoped, ctx]);
    const rows = useMemo(() => applyQueueView(queue.items, filters, ctx, done), [queue.items, filters, ctx, done]);

    const statusOptions = useMemo(() => {
        const counts = statusCounts(scoped);
        const known = new Set(status.statuses.map((s) => s.code));
        const options = [
            { value: "NONE", label: "Jamais contacté", count: counts.NONE ?? 0 },
            ...status.statuses.map((s) => ({ value: s.code, label: s.label, count: counts[s.code] ?? 0 })),
            ...Object.keys(counts)
                .filter((c) => c !== "NONE" && !known.has(c))
                .map((c) => ({ value: c, label: labelForStatus(c, status.labels), count: counts[c] })),
        ];
        return options.filter((o) => o.count > 0 || o.value === filters.status);
    }, [scoped, status.statuses, status.labels, filters.status]);

    const channels = useMemo(() => Array.from(new Set(queue.items.map((r) => r.channel))), [queue.items]);
    const quickOutcomes = useMemo(
        () => status.statuses.filter((s) => s.code !== "MAIL_ENVOYE").slice(0, QUICK_OUTCOME_SLOTS),
        [status.statuses],
    );

    // ── Cursor, selection, composer ─────────────────────────────────────────
    // The cursor follows a row key (stable across refetches); when that row
    // leaves the view it falls back to the first row.
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const focusedIndex = useMemo(() => {
        const i = focusedKey ? rows.findIndex((r) => rowKey(r) === focusedKey) : -1;
        return i >= 0 ? i : rows.length > 0 ? 0 : -1;
    }, [rows, focusedKey]);
    const focusedRow = focusedIndex >= 0 ? rows[focusedIndex] : null;
    const focusedKeyRef = useRef<string | null>(null);
    useEffect(() => { focusedKeyRef.current = focusedRow ? rowKey(focusedRow) : null; }, [focusedRow]);

    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [composer, setComposer] = useState<ComposerState | null>(null);
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);

    // New scope → new session view (adjusted during render, no effect round-trip).
    const scopeKey = `${scope.missionId}|${scope.listId}`;
    const [sessionScope, setSessionScope] = useState(scopeKey);
    if (sessionScope !== scopeKey) {
        setSessionScope(scopeKey);
        setDone(new Map());
        setSelected(new Set());
        setComposer(null);
    }

    const scrollToKey = useCallback((key: string) => {
        requestAnimationFrame(() => document.getElementById(queueRowDomId(key))?.scrollIntoView({ block: "nearest" }));
    }, []);

    /** Next row after `key` in the current view that hasn't been worked yet. */
    // Read through refs so callbacks stay stable and memoised rows don't all
    // re-render every time one row is logged.
    const rowsRef = useRef(rows);
    const doneRef = useRef(done);
    useEffect(() => {
        rowsRef.current = rows;
        doneRef.current = done;
    }, [rows, done]);

    const nextUndoneAfter = useCallback((key: string): QueueItem | null => {
        const list = rowsRef.current;
        const i = list.findIndex((r) => rowKey(r) === key);
        for (let j = i + 1; j < list.length; j++) {
            if (!doneRef.current.has(rowKey(list[j]))) return list[j];
        }
        return null;
    }, []);

    // ── Overlays ────────────────────────────────────────────────────────────
    const [drawer, setDrawer] = useState<DrawerState | null>(null);
    const [bookingOpen, setBookingOpen] = useState(false);
    const [alloOpen, setAlloOpen] = useState(false);
    const [scriptManual, setScriptManual] = useState(false);
    const [scriptDismissed, setScriptDismissed] = useState(false);
    const [emailRow, setEmailRow] = useState<QueueItem | null>(null);
    const [alreadyContacted, setAlreadyContacted] = useState<{ info: AlreadyContactedInfo; row: QueueItem } | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const [bulkWorking, setBulkWorking] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ enriched: number; total: number } | null>(null);

    const defaultMailbox = useDefaultMailbox(scope.mission, !!emailRow);

    const openDrawer = useCallback((row: QueueItem, initialResult?: string) => {
        setComposer(null);
        setFocusedKey(rowKey(row));
        setDrawer({ row, contactId: row.contactId, initialResult, dirty: false });
        setScriptDismissed(false);
        setSidebarCollapsed(true);
    }, [setSidebarCollapsed]);

    const refreshQueue = queue.refresh;
    const drawerDirtyRef = useRef(false);
    useEffect(() => { drawerDirtyRef.current = !!drawer?.dirty; }, [drawer]);

    const closeDrawer = useCallback((forceRefresh = false) => {
        // Only reshuffle the table when something was actually logged in the drawer.
        if (forceRefresh || drawerDirtyRef.current) setTimeout(() => refreshQueue(), 80);
        setDrawer(null);
        setBookingOpen(false);
        setAlloOpen(false);
    }, [refreshQueue]);

    const scriptVisible = !!scope.missionId && (scriptManual || (!!drawer && !scriptDismissed));
    const toggleScript = useCallback(() => {
        if (scriptVisible) {
            setScriptManual(false);
            if (drawer) setScriptDismissed(true);
        } else {
            setScriptManual(true);
            setScriptDismissed(false);
        }
    }, [scriptVisible, drawer]);

    // ── Logging ─────────────────────────────────────────────────────────────
    const callStarts = useRef(new Map<string, number>());
    // A double click can land before the spinner renders: one POST per row at a time.
    const inFlight = useRef(new Set<string>());

    const logOutcome = useCallback(async (row: QueueItem, code: string, extra: { note?: string; callbackDate?: string } = {}) => {
        const key = rowKey(row);
        if (inFlight.current.has(key)) return;
        inFlight.current.add(key);
        setSubmittingKey(key);
        const startedAt = callStarts.current.get(key);
        const duration = startedAt ? Math.min(MAX_CALL_SECONDS, Math.round((Date.now() - startedAt) / 1000)) : undefined;
        try {
            await postAction(actionInputForRow(row, code, {
                note: extra.note || undefined,
                callbackDate: extra.callbackDate,
                duration: duration && duration > 0 ? duration : undefined,
            }));
            callStarts.current.delete(key);
            markDone([key], code);
            setComposer((c) => (c?.key === key ? null : c));
            // Keep the flow going: move the cursor to the next row to work.
            if (focusedKeyRef.current === key) {
                const next = nextUndoneAfter(key);
                if (next) {
                    setFocusedKey(rowKey(next));
                    scrollToKey(rowKey(next));
                }
            }
        } catch (err) {
            showError("Non enregistré", err instanceof Error ? err.message : "Erreur de connexion");
        } finally {
            inFlight.current.delete(key);
            setSubmittingKey((k) => (k === key ? null : k));
        }
    }, [markDone, nextUndoneAfter, scrollToKey, showError]);

    const { requiresNote, isCallback } = status;
    const quickOutcome = useCallback((row: QueueItem, code: string) => {
        if (code === "MEETING_BOOKED") {
            openDrawer(row, "MEETING_BOOKED");
            return;
        }
        // Anything that needs more than a click opens the inline composer —
        // quick buttons never invent a note or a callback date.
        if (code === "ENVOIE_MAIL" || requiresNote(code) || isCallback(code)) {
            setComposer({ key: rowKey(row), code });
            return;
        }
        void logOutcome(row, code);
    }, [openDrawer, requiresNote, isCallback, logOutcome]);

    const onComposerSubmit = useCallback((row: QueueItem, s: OutcomeSubmission) => {
        void logOutcome(row, s.code, { note: s.note, callbackDate: s.callbackDate });
    }, [logOutcome]);

    const handleEmailSent = useCallback(async () => {
        const row = emailRow;
        if (!row) return;
        try {
            await postAction(actionInputForRow(row, "MAIL_ENVOYE", { channel: "EMAIL", note: "Email envoyé via template" }));
            markDone([rowKey(row)], "MAIL_ENVOYE");
        } catch (err) {
            showError("Email envoyé, statut non enregistré", err instanceof Error ? err.message : "Erreur de connexion");
        }
    }, [emailRow, markDone, showError]);

    // ── Calling ─────────────────────────────────────────────────────────────
    const proceedWithPhone = useCallback(async (row: QueueItem, intent: "CALL" | "COPY") => {
        const phone = rowPhone(row);
        if (!phone) return;
        if (intent === "CALL") {
            callStarts.current.set(rowKey(row), Date.now());
            window.location.href = `tel:${phone}`;
            return;
        }
        try {
            await navigator.clipboard.writeText(phone);
            success("Numéro copié", phone);
        } catch {
            showError("Impossible de copier");
        }
    }, [success, showError]);

    const attemptPhone = useCallback((row: QueueItem, intent: "CALL" | "COPY") => {
        const phone = rowPhone(row);
        if (!phone) {
            showError("Numéro manquant", "Ouvrez la fiche pour en ajouter un.");
            return;
        }
        const { lastAction, lastActionBy } = effectiveLastAction(row);
        if (lastAction && isRecentlyContacted(lastAction, lastActionBy, currentUserId, Date.now())) {
            setAlreadyContacted({
                row,
                info: {
                    phone,
                    targetName: displayName(row),
                    companyName: row.company.name,
                    actionIntent: intent,
                    lastAction: { ...lastAction, createdAt: lastAction.createdAt ?? new Date().toISOString() },
                    lastActionBy,
                    currentUserId,
                    statusLabel: labelForStatus(lastAction.result, status.labels),
                },
            });
            return;
        }
        void proceedWithPhone(row, intent);
    }, [currentUserId, status.labels, proceedWithPhone, showError]);

    // ── Hover prefetch (warms the drawer) ───────────────────────────────────
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onHover = useCallback((row: QueueItem) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => prefetchDrawerData(queryClient, row), 150);
    }, [queryClient]);
    useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
    useEffect(() => {
        if (focusedRow) prefetchDrawerData(queryClient, focusedRow);
    }, [focusedRow, queryClient]);

    // ── Row handlers (stable, so memoised rows don't re-render) ─────────────
    const handlers: RowHandlers = useMemo(() => ({
        onFocusRow: (index) => {
            const row = rowsRef.current[index];
            if (row) setFocusedKey(rowKey(row));
        },
        onOpen: (row) => openDrawer(row),
        onToggleSelect: (key) => setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        }),
        onCall: (row) => attemptPhone(row, "CALL"),
        onCopyPhone: (row) => attemptPhone(row, "COPY"),
        onQuickOutcome: quickOutcome,
        onMoreOutcomes: (row) => setComposer((c) => (c?.key === rowKey(row) ? null : { key: rowKey(row), code: null })),
        onHover,
    }), [openDrawer, attemptPhone, quickOutcome, onHover]);

    const model: RowModel = useMemo(
        () => ({ labels: status.labels, toneOf: status.toneOf, callbackCodes: status.callbackCodes, currentUserId, now }),
        [status.labels, status.toneOf, status.callbackCodes, currentUserId, now],
    );

    // ── Keyboard ────────────────────────────────────────────────────────────
    const searchRef = useRef<HTMLInputElement>(null);
    const overlayOpen = !!drawer || !!emailRow || !!alreadyContacted || shortcutsOpen || bulkConfirmOpen;

    useQueueKeyboard(!overlayOpen, {
        move: (delta) => {
            if (rows.length === 0) return;
            const current = Math.max(0, focusedIndex);
            const target = delta === "first" ? 0 : delta === "last" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, current + delta));
            const key = rowKey(rows[target]);
            setFocusedKey(key);
            scrollToKey(key);
        },
        open: () => { if (focusedRow) openDrawer(focusedRow); },
        toggleSelect: () => { if (focusedRow) handlers.onToggleSelect(rowKey(focusedRow)); },
        call: () => { if (focusedRow) attemptPhone(focusedRow, "CALL"); },
        quickOutcome: (slot) => {
            const s = quickOutcomes[slot];
            if (focusedRow && s && submittingKey !== rowKey(focusedRow)) quickOutcome(focusedRow, s.code);
        },
        focusSearch: () => searchRef.current?.focus(),
        toggleScript,
        refresh: () => queue.refresh(),
        help: () => setShortcutsOpen(true),
        escape: () => {
            if (composer) setComposer(null);
            else if (selected.size > 0) setSelected(new Set());
        },
    });

    // ── Bulk ────────────────────────────────────────────────────────────────
    const selectedRows = useMemo(() => queue.items.filter((r) => selected.has(rowKey(r))), [queue.items, selected]);

    const runBulkDisqualify = useCallback(async () => {
        setBulkWorking(true);
        const succeeded: string[] = [];
        const failures = await runLimited(selectedRows, 4, async (row) => {
            await postAction(actionInputForRow(row, "DISQUALIFIED", { note: "Disqualifié" }));
            succeeded.push(rowKey(row));
        });
        if (succeeded.length > 0) markDone(succeeded, "DISQUALIFIED");
        setBulkWorking(false);
        setBulkConfirmOpen(false);
        setSelected(new Set(selectedRows.map(rowKey).filter((k) => !succeeded.includes(k))));
        if (failures > 0) showError("Disqualification partielle", `${failures} ligne(s) n'ont pas pu être traitées.`);
        else success(`${succeeded.length} ligne(s) disqualifiée(s)`);
    }, [selectedRows, markDone, showError, success]);

    // ── Sync Allo ───────────────────────────────────────────────────────────
    const handleSync = useCallback(async () => {
        if (syncing) return;
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/sdr/calls/sync", { method: "POST" });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur de synchronisation", json.error ?? "Impossible de contacter Allo.");
                return;
            }
            const { enriched, total } = json.data as { enriched: number; total: number };
            setSyncResult({ enriched, total });
            if (enriched > 0) success("Appels synchronisés", `${enriched} appel${enriched > 1 ? "s" : ""} enrichi${enriched > 1 ? "s" : ""}.`);
            else if (total === 0) success("Déjà à jour", "Aucun appel récent à synchroniser.");
            else success("Synchronisation terminée", `${total} appel${total > 1 ? "s" : ""} analysé${total > 1 ? "s" : ""}, aucune correspondance Allo.`);
            refreshQueue();
        } catch {
            showError("Erreur réseau", "La synchronisation a échoué.");
        } finally {
            setSyncing(false);
        }
    }, [syncing, refreshQueue, success, showError]);

    // ── Sticky offsets: thead sits right under the (wrapping) command bar ───
    const cardRef = useRef<HTMLDivElement>(null);
    const commandBarRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const bar = commandBarRef.current;
        const card = cardRef.current;
        if (!bar || !card) return;
        const apply = () => card.style.setProperty("--cmdbar-h", `${bar.offsetHeight}px`);
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(bar);
        return () => ro.disconnect();
    }, []);

    // ── Placeholder (loading / error / empty) ───────────────────────────────
    const resetView = useCallback(() => {
        setPrefs(DEFAULT_PREFS);
        setView(DEFAULT_VIEW);
        setSearchInput("");
    }, [setPrefs]);

    const emptyReason: EmptyReason | null = useMemo(() => {
        if (scope.allMissions.length === 0) return { kind: "no-missions" };
        if (scope.selectableMissions.length === 0) return { kind: "not-planned" };
        if (queue.items.length === 0) {
            if (search) return { kind: "no-search-results", search };
            if (scope.lists.length === 0) return { kind: "no-lists" };
            return { kind: "queue-empty" };
        }
        if (rows.length === 0) return { kind: "filtered-out" };
        return null;
    }, [scope.allMissions.length, scope.selectableMissions.length, scope.lists.length, queue.items.length, rows.length, search]);

    let placeholder: React.ReactNode = null;
    if (scope.isLoading || (scope.missionId && queue.isLoading)) placeholder = <QueueSkeleton />;
    else if (scope.error) placeholder = <QueueError message={scope.error} onRetry={() => scope.refetch()} />;
    else if (queue.error) placeholder = <QueueError message={queue.error} onRetry={() => queue.refresh()} />;
    else if (emptyReason) {
        placeholder = (
            <QueueEmpty
                reason={emptyReason}
                onClearSearch={() => setSearchInput("")}
                onResetFilters={resetView}
                onRefresh={() => queue.refresh()}
            />
        );
    }

    const resetKey = `${scope.missionId}|${scope.listId}|${search}|${filters.segment}|${filters.type}|${filters.status}|${filters.channel}|${filters.sort}`;
    const drawerRow = drawer?.row ?? null;
    const scriptRow = drawerRow ?? focusedRow;

    return (
        <div className="space-y-4 pb-24 font-cp">
            <CockpitHeader
                missions={scope.selectableMissions}
                mission={scope.mission}
                onMissionChange={scope.setMission}
                lists={scope.lists}
                listId={scope.listId}
                onListChange={scope.setList}
                doneToday={doneToday}
                isSyncing={syncing}
                syncResult={syncResult}
                onSync={handleSync}
                scriptOpen={scriptVisible}
                onToggleScript={toggleScript}
                onHelp={() => setShortcutsOpen(true)}
            />

            <SegmentRail
                counts={queue.isLoading || scope.isLoading ? null : segmentCounts}
                active={filters.segment}
                onChange={(segment) => patchFilters({ segment })}
            />

            <div ref={cardRef} className="rounded-2xl border border-cp-border bg-cp-raised shadow-sm">
                <div ref={commandBarRef} className="sticky top-14 z-20 rounded-t-2xl bg-cp-raised">
                    <CommandBar
                        ref={searchRef}
                        search={searchInput}
                        onSearchChange={setSearchInput}
                        isSearching={searchInput.trim() !== search || (!!search && queue.isFetching)}
                        filters={filters}
                        onFiltersChange={patchFilters}
                        onReset={resetView}
                        statusOptions={statusOptions}
                        channels={channels}
                        shown={rows.length}
                        total={queue.items.length}
                        doneCount={done.size}
                        isFetching={queue.isFetching}
                        onRefresh={() => queue.refresh()}
                    />
                </div>

                <QueueTable
                    rows={rows}
                    resetKey={resetKey}
                    focusedIndex={focusedIndex}
                    selected={selected}
                    onSelectAll={(keys) => setSelected(new Set(keys ?? []))}
                    done={done}
                    submittingKey={submittingKey}
                    composer={composer}
                    statuses={status.statuses.filter((s) => s.code !== "MAIL_ENVOYE")}
                    quickOutcomes={quickOutcomes}
                    model={model}
                    handlers={handlers}
                    requiresNote={status.requiresNote}
                    isCallback={status.isCallback}
                    onComposerSubmit={onComposerSubmit}
                    onComposerCancel={() => setComposer(null)}
                    onBookMeeting={(row) => openDrawer(row, "MEETING_BOOKED")}
                    onComposeEmail={(row) => {
                        setComposer(null);
                        setEmailRow(row);
                    }}
                    placeholder={placeholder}
                />

                {!placeholder && (
                    <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-b-2xl border-t border-cp-border bg-cp-canvas px-4 py-2 text-xs text-cp-ink-3 md:flex">
                        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
                        <span className="flex items-center gap-1"><Kbd>a</Kbd> appeler</span>
                        <span className="flex items-center gap-1"><Kbd>1</Kbd>–<Kbd>{QUICK_OUTCOME_SLOTS}</Kbd> résultat rapide</span>
                        <span className="flex items-center gap-1"><Kbd>⏎</Kbd> fiche</span>
                        <span className="flex items-center gap-1"><Kbd>x</Kbd> sélectionner</span>
                        <span className="flex items-center gap-1"><Kbd>s</Kbd> script</span>
                        <button type="button" onClick={() => setShortcutsOpen(true)} className="ml-auto flex items-center gap-1 hover:text-cp-ink">
                            <Kbd>?</Kbd> tous les raccourcis
                        </button>
                    </div>
                )}
            </div>

            <BulkBar
                count={selected.size}
                isWorking={bulkWorking}
                onDisqualify={() => setBulkConfirmOpen(true)}
                onClear={() => setSelected(new Set())}
            />

            {/* ── Overlays ───────────────────────────────────────────────── */}
            {drawer && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => closeDrawer()}
                    contactId={drawer.contactId}
                    companyId={drawer.row.companyId}
                    missionId={scope.missionId ?? undefined}
                    missionName={scope.mission?.name ?? drawer.row.missionName}
                    enableGooglePhoneLookup
                    preferredInterlocuteurId={drawer.row.preferredInterlocuteurId ?? null}
                    preferredInterlocuteurIds={drawer.row.preferredInterlocuteurIds ?? null}
                    initialResult={drawer.initialResult}
                    onBookingDialogOpenChange={setBookingOpen}
                    onAlloDialogOpenChange={setAlloOpen}
                    onContactSelect={(contactId) => setDrawer((d) => (d ? { ...d, contactId } : d))}
                    onActionRecorded={() => {
                        setDrawer((d) => (d ? { ...d, dirty: true } : d));
                        markDone([rowKey(drawer.row)], null);
                    }}
                    onValidateAndNext={() => {
                        const next = nextUndoneAfter(rowKey(drawer.row));
                        if (next) {
                            setFocusedKey(rowKey(next));
                            scrollToKey(rowKey(next));
                            setDrawer({ row: next, contactId: next.contactId, dirty: true });
                        } else {
                            closeDrawer(true);
                        }
                    }}
                />
            )}

            {scriptVisible && scope.missionId && (
                <ScriptCompanionDrawer
                    isOpen
                    hidden={bookingOpen || alloOpen}
                    onClose={toggleScript}
                    missionId={scope.missionId}
                    missionName={scope.mission?.name}
                    campaignId={scriptRow?.campaignId ?? null}
                    prospect={scriptRow ? {
                        firstName: scriptRow.contact?.firstName,
                        lastName: scriptRow.contact?.lastName,
                        title: scriptRow.contact?.title,
                        companyName: scriptRow.company.name,
                    } : null}
                />
            )}

            <QuickEmailModal
                isOpen={!!emailRow}
                onClose={() => setEmailRow(null)}
                onSent={handleEmailSent}
                contact={emailRow?.contact ? {
                    id: emailRow.contact.id,
                    firstName: emailRow.contact.firstName,
                    lastName: emailRow.contact.lastName,
                    email: emailRow.contact.email,
                    title: emailRow.contact.title,
                    company: { id: emailRow.company.id, name: emailRow.company.name },
                } : null}
                company={emailRow && !emailRow.contact ? { id: emailRow.company.id, name: emailRow.company.name, phone: emailRow.company.phone } : null}
                missionId={scope.missionId}
                missionName={scope.mission?.name ?? null}
                preferredMailboxId={defaultMailbox}
            />

            <AlreadyContactedModal
                isOpen={!!alreadyContacted}
                onClose={() => setAlreadyContacted(null)}
                onConfirm={() => {
                    const target = alreadyContacted;
                    setAlreadyContacted(null);
                    if (target) void proceedWithPhone(target.row, target.info.actionIntent);
                }}
                onOpenDetails={() => {
                    const target = alreadyContacted;
                    setAlreadyContacted(null);
                    if (target) openDrawer(target.row);
                }}
                info={alreadyContacted?.info ?? null}
            />

            <ConfirmModal
                isOpen={bulkConfirmOpen}
                onClose={() => { if (!bulkWorking) setBulkConfirmOpen(false); }}
                onConfirm={runBulkDisqualify}
                title="Disqualifier la sélection ?"
                message={`${selected.size} ligne(s) seront marquées « Disqualifié » et sortiront de la file.`}
                confirmText="Disqualifier"
                cancelText="Annuler"
                variant="danger"
                isLoading={bulkWorking}
            />

            <ShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div>
    );
}
