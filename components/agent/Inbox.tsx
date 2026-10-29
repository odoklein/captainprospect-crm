"use client";

/**
 * « À traiter », the agent's inbox: pending proposals first, then findings
 * grouped by client / folder (collapsible) and severity-sorted. Every action
 * is optimistic with an undo toast. Keyboard: j / k (or ↓ / ↑) to move,
 * e = traité, s = reporter 1 j, r = résoudre, a = approuver,
 * o / Entrée = exécution.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlarmClock,
    CalendarDays,
    Check,
    CheckCheck,
    CheckCircle2,
    ChevronRight,
    Eye,
    Inbox as InboxIcon,
    Loader2,
    MessageSquare,
    MoreHorizontal,
    RotateCcw,
    SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Calendar } from "@/components/ui/Calendar";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import type { AgentFindingItem, AgentFindingState, AgentSeverity, PatchFindingBody } from "@/lib/assistant/api-contract";
import {
    conversationHref,
    FINDING_STATE_LABEL,
    filterFindings,
    futureLabel,
    groupFindings,
    groupOptions,
    relativeTime,
    SEVERITY_LABEL,
    snoozeToDay,
    snoozeUntil,
} from "@/lib/agent/client/format";
import { humanizeKey } from "@/lib/agent/client/config-form";
import { fetchRun, patchFinding, useAgentFindings, useAgentJobs, usePendingProposals } from "@/lib/agent/client/hooks";
import { ProposalBatch, useProposalController, useVisibleProposals } from "./ProposalBatch";
import { EmptyState, ErrorBlock, isTypingTarget, LiveDot, overlayOpen, SectionTitle, SEVERITY_TONE, SeverityBadge, stagger, useNow } from "./shared";

type SeverityFilter = AgentSeverity | "ALL";

type NavItem = { type: "proposal"; id: string } | { type: "finding"; id: string };

const STATES: Array<{ value: AgentFindingState; label: string }> = [
    { value: "OPEN", label: "Ouverts" },
    { value: "SNOOZED", label: "Reportés" },
    { value: "ACKED", label: "Traités" },
    { value: "RESOLVED", label: "Résolus" },
];

export function Inbox({ folderId, onOpenRun, compact }: { folderId?: string | null; onOpenRun: (id: string) => void; compact?: boolean }) {
    const toast = useToast();
    const router = useRouter();
    const [severity, setSeverity] = useState<SeverityFilter>("ALL");
    const [group, setGroup] = useState<string>("ALL");
    const [state, setState] = useState<AgentFindingState>("OPEN");
    const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
    const [selected, setSelected] = useState<string | null>(null);

    const pending = usePendingProposals(folderId);
    const controller = useProposalController();
    const visibleProposals = useVisibleProposals(pending.proposals, controller);
    const findings = useAgentFindings({ state, severity: severity === "ALL" ? null : severity, folderId: folderId ?? null });

    const shown = useMemo(() => findings.items.filter((f) => !hidden.has(f.id)), [findings.items, hidden]);
    const options = useMemo(() => groupOptions(shown), [shown]);
    const effectiveGroup = group === "ALL" || options.some((o) => o.key === group) ? group : "ALL";
    const groups = useMemo(() => groupFindings(filterFindings(shown, { severity: "ALL", group: effectiveGroup })), [shown, effectiveGroup]);
    const grouped = !folderId;

    const proposalsActive = state === "OPEN";
    const nav = useMemo<NavItem[]>(
        () => [
            ...(proposalsActive ? visibleProposals.map((p) => ({ type: "proposal" as const, id: p.id })) : []),
            ...groups.filter((g) => !grouped || !collapsed.has(g.key)).flatMap((g) => g.items.map((f) => ({ type: "finding" as const, id: f.id }))),
        ],
        [proposalsActive, visibleProposals, groups, grouped, collapsed],
    );
    const findingById = useMemo(() => new Map(shown.map((f) => [f.id, f])), [shown]);
    const selectedId = selected && nav.some((n) => n.id === selected) ? selected : null;

    const hide = useCallback((id: string, on: boolean) => {
        setHidden((prev) => {
            const next = new Set(prev);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const act = useCallback(
        async (f: AgentFindingItem, body: PatchFindingBody, done: string) => {
            const idx = nav.findIndex((n) => n.id === f.id);
            const neighbour = nav[idx + 1] ?? nav[idx - 1] ?? null;
            if (selectedId === f.id) setSelected(neighbour?.id ?? null);
            hide(f.id, true);
            try {
                await patchFinding(f.id, body);
                toast.addToast({
                    type: "success",
                    title: done,
                    message: f.title,
                    duration: 7000,
                    action: {
                        label: "Annuler",
                        onClick: () => {
                            hide(f.id, false);
                            const back: PatchFindingBody =
                                f.state === "SNOOZED" && f.snoozedUntil ? { state: "SNOOZED", snoozedUntil: f.snoozedUntil } : { state: f.state === "SNOOZED" ? "OPEN" : f.state };
                            patchFinding(f.id, back).catch((e: unknown) => toast.error("Annulation impossible", e instanceof Error ? e.message : undefined));
                        },
                    },
                });
            } catch (e) {
                hide(f.id, false);
                toast.error("Action non enregistrée", e instanceof Error ? e.message : undefined);
            }
        },
        [hide, nav, selectedId, toast],
    );

    const ack = useCallback((f: AgentFindingItem) => act(f, { state: "ACKED" }, "Marqué comme traité"), [act]);
    const snooze = useCallback(
        (f: AgentFindingItem, days: number) => act(f, { state: "SNOOZED", snoozedUntil: snoozeUntil(days) }, days === 1 ? "Reporté à demain" : `Reporté de ${days} jours`),
        [act],
    );
    const snoozeTo = useCallback(
        (f: AgentFindingItem, day: Date) => {
            const until = snoozeToDay(day);
            if (!until) return;
            void act(f, { state: "SNOOZED", snoozedUntil: until }, `Reporté au ${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`);
        },
        [act],
    );
    const resolve = useCallback((f: AgentFindingItem) => act(f, { state: "RESOLVED" }, "Marqué comme résolu"), [act]);
    const reopen = useCallback((f: AgentFindingItem) => act(f, { state: "OPEN" }, "Rouvert"), [act]);

    const openConversation = useCallback(
        async (runId: string) => {
            try {
                const run = await fetchRun(runId);
                if (run.conversationId) router.push(conversationHref(run.conversationId));
                else {
                    toast.info("Pas de conversation liée", "L’exécution s’ouvre à la place.");
                    onOpenRun(runId);
                }
            } catch (e) {
                toast.error("Conversation introuvable", e instanceof Error ? e.message : undefined);
            }
        },
        [onOpenRun, router, toast],
    );

    const approveById = useCallback(
        (id: string) => {
            const p = visibleProposals.find((x) => x.id === id);
            if (!p || p.state !== "PENDING" || controller.results[id]?.ok || controller.busy[id]) return;
            controller.requestApprove(p);
        },
        [controller, visibleProposals],
    );

    // Keyboard navigation.
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (compact) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || overlayOpen()) return;
            const key = e.key.toLowerCase();
            if (!["j", "k", "e", "s", "r", "a", "o", "enter", "arrowdown", "arrowup"].includes(key)) return;
            // Enter and arrows keep their native meaning on focused controls.
            if ((key === "enter" || key === "arrowdown" || key === "arrowup") && e.target !== document.body) return;
            const idx = nav.findIndex((n) => n.id === selectedId);
            if (key === "j" || key === "arrowdown" || key === "k" || key === "arrowup") {
                e.preventDefault();
                if (nav.length === 0) return;
                const down = key === "j" || key === "arrowdown";
                const next = idx === -1 ? (down ? 0 : nav.length - 1) : Math.min(nav.length - 1, Math.max(0, idx + (down ? 1 : -1)));
                setSelected(nav[next].id);
                return;
            }
            const current = idx === -1 ? null : nav[idx];
            if (!current) return;
            if (current.type === "proposal") {
                if (key === "a") {
                    e.preventDefault();
                    approveById(current.id);
                }
                return;
            }
            const f = findingById.get(current.id);
            if (!f) return;
            e.preventDefault();
            if (key === "e") void (f.state === "OPEN" ? ack(f) : reopen(f));
            else if (key === "s") void snooze(f, 1);
            else if (key === "r") void resolve(f);
            else if ((key === "o" || key === "enter") && f.runId) onOpenRun(f.runId);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [compact, nav, selectedId, findingById, ack, snooze, resolve, reopen, approveById, onOpenRun]);

    // Keep the selected row in view.
    useEffect(() => {
        if (!selectedId || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(`[data-nav-id="${selectedId}"], [data-proposal-id="${selectedId}"]`);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedId]);

    const toggleGroup = (key: string, open: boolean) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (open) next.delete(key);
            else next.add(key);
            return next;
        });

    const filtered = severity !== "ALL" || effectiveGroup !== "ALL" || state !== "OPEN";
    const loading = (findings.isLoading && findings.items.length === 0) || (pending.isLoading && pending.proposals.length === 0 && proposalsActive);
    const nothing = !loading && groups.length === 0 && (!proposalsActive || visibleProposals.length === 0);
    const findingCount = groups.reduce((n, g) => n + g.items.length, 0);

    const rowProps = (f: AgentFindingItem) => ({
        finding: f,
        selected: selectedId === f.id,
        compact,
        onSelect: () => setSelected(f.id),
        onAck: () => void ack(f),
        onSnooze: (d: number) => void snooze(f, d),
        onSnoozeTo: (day: Date) => snoozeTo(f, day),
        onResolve: () => void resolve(f),
        onReopen: () => void reopen(f),
        onOpenRun: f.runId ? () => onOpenRun(f.runId as string) : undefined,
        onOpenConversation: f.runId ? () => void openConversation(f.runId as string) : undefined,
    });

    return (
        <div className="space-y-5" ref={listRef}>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={severity}
                    onValueChange={(v) => v && setSeverity(v as SeverityFilter)}
                    aria-label="Sévérité"
                    className="bg-surface"
                >
                    <ToggleGroupItem value="ALL" className="px-3 text-xs">
                        Toutes
                    </ToggleGroupItem>
                    {(["CRITICAL", "WARN", "INFO"] as const).map((s) => (
                        <ToggleGroupItem key={s} value={s} className="gap-1.5 px-3 text-xs">
                            <LiveDot tone={SEVERITY_TONE[s]} />
                            {SEVERITY_LABEL[s]}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                {grouped && (
                    <Select value={effectiveGroup} onValueChange={setGroup}>
                        <SelectTrigger size="sm" className="w-44" aria-label="Client">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tous les clients</SelectItem>
                            {options.length > 0 && <SelectSeparator />}
                            {options.map((o) => (
                                <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <Select value={state} onValueChange={(v) => setState(v as AgentFindingState)}>
                    <SelectTrigger size="sm" className="w-32" aria-label="État">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                                {s.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {filtered && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            setSeverity("ALL");
                            setGroup("ALL");
                            setState("OPEN");
                        }}
                    >
                        Réinitialiser
                    </Button>
                )}
                {!compact && (
                    <p className="ml-auto hidden items-center gap-1.5 text-2xs text-ink-4 xl:flex" aria-hidden>
                        <Kbd>j</Kbd>
                        <Kbd>k</Kbd>
                        <span className="mr-1.5">naviguer</span>
                        <Kbd>e</Kbd>
                        <span className="mr-1.5">traité</span>
                        <Kbd>s</Kbd>
                        <span className="mr-1.5">reporter</span>
                        <Kbd>a</Kbd>
                        <span>approuver</span>
                    </p>
                )}
            </div>

            {findings.degraded && (
                <p className="rounded-panel border border-warning-line bg-warning-soft px-3.5 py-2.5 text-xs text-warning-ink">
                    Les tables de l’agent ne sont pas encore installées sur cette instance : rien ne peut s’afficher ici.
                </p>
            )}

            {loading ? (
                <div className="space-y-2" aria-busy="true" aria-label="Chargement">
                    {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-[72px] rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            ) : findings.error && findings.items.length === 0 && visibleProposals.length === 0 ? (
                <ErrorBlock message={findings.error.message} onRetry={findings.reload} />
            ) : nothing ? (
                filtered ? (
                    <EmptyState compact icon={SearchX} title="Rien pour ces filtres" hint="Change de sévérité, de client ou d’état." />
                ) : (
                    <NothingToDo folderId={folderId ?? null} compact={compact} />
                )
            ) : (
                <>
                    {proposalsActive && visibleProposals.length > 0 && (
                        <section aria-label="Propositions à valider" className="space-y-2.5">
                            <SectionTitle icon={CheckCheck}>Propositions à valider</SectionTitle>
                            <ProposalBatch proposals={pending.proposals} controller={controller} selectedId={selectedId} onSelect={setSelected} />
                        </section>
                    )}

                    {groups.length > 0 && (
                        <div className="space-y-4">
                            {proposalsActive && visibleProposals.length > 0 && (
                                <SectionTitle aside={<span className="text-2xs font-semibold tabular-nums text-ink-4">{findingCount}</span>}>Constats</SectionTitle>
                            )}
                            {groups.map((g, gi) =>
                                grouped ? (
                                    <Collapsible
                                        key={g.key}
                                        open={!collapsed.has(g.key)}
                                        onOpenChange={(o) => toggleGroup(g.key, o)}
                                        className="motion-safe:animate-ds-enter"
                                        style={stagger(gi)}
                                    >
                                        <CollapsibleTrigger
                                            className={cn(
                                                "group/trigger -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-[10px] px-1.5 py-1.5 text-left transition-colors duration-150 ease-snappy hover:bg-surface-3/60",
                                                FOCUS_RING,
                                            )}
                                        >
                                            <ChevronRight
                                                className="size-3.5 shrink-0 text-ink-4 transition-transform duration-150 ease-snappy group-data-[state=open]/trigger:rotate-90"
                                                aria-hidden
                                            />
                                            <LiveDot tone={SEVERITY_TONE[g.topSeverity]} className="size-2" />
                                            <span className="truncate text-sm font-semibold text-ink">{g.label}</span>
                                            <span className="text-2xs font-semibold tabular-nums text-ink-4">{g.items.length}</span>
                                            <span className="ml-auto flex items-center gap-1">
                                                {g.counts.CRITICAL > 0 && (
                                                    <Badge variant="danger" className="tabular-nums">
                                                        {g.counts.CRITICAL} critique{g.counts.CRITICAL > 1 ? "s" : ""}
                                                    </Badge>
                                                )}
                                                {g.counts.WARN > 0 && (
                                                    <Badge variant="warning" className="tabular-nums">
                                                        {g.counts.WARN} attention
                                                    </Badge>
                                                )}
                                            </span>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                                            <ul className="mt-1.5 divide-y divide-line-subtle overflow-hidden rounded-panel border border-line bg-surface shadow-2xs">
                                                {g.items.map((f) => (
                                                    <FindingRow key={f.id} {...rowProps(f)} />
                                                ))}
                                            </ul>
                                        </CollapsibleContent>
                                    </Collapsible>
                                ) : (
                                    <ul key={g.key} className="divide-y divide-line-subtle overflow-hidden rounded-panel border border-line bg-surface shadow-2xs">
                                        {g.items.map((f) => (
                                            <FindingRow key={f.id} {...rowProps(f)} />
                                        ))}
                                    </ul>
                                ),
                            )}
                            {findings.hasMore && (
                                <div className="flex justify-center">
                                    <Button type="button" variant="outline" size="sm" onClick={findings.loadMore} disabled={findings.isLoadingMore}>
                                        {findings.isLoadingMore && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                                        Charger plus de constats
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function metricChips(metrics: Record<string, unknown> | null): Array<{ key: string; label: string; value: string }> {
    if (!metrics) return [];
    return Object.entries(metrics)
        .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length <= 24))
        .slice(0, 3)
        .map(([k, v]) => ({
            key: k,
            label: humanizeKey(k),
            value: typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : String(v),
        }));
}

function FindingRow({
    finding: f,
    selected,
    compact,
    onSelect,
    onAck,
    onSnooze,
    onSnoozeTo,
    onResolve,
    onReopen,
    onOpenRun,
    onOpenConversation,
}: {
    finding: AgentFindingItem;
    selected: boolean;
    compact?: boolean;
    onSelect: () => void;
    onAck: () => void;
    onSnooze: (days: number) => void;
    onSnoozeTo: (day: Date) => void;
    onResolve: () => void;
    onReopen: () => void;
    onOpenRun?: () => void;
    onOpenConversation?: () => void;
}) {
    const chips = metricChips(f.metrics);
    const open = f.state === "OPEN";
    const [picking, setPicking] = useState(false);
    const pickingRef = useRef(false);

    return (
        <li
            data-nav-id={f.id}
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
            className={cn(
                "group relative py-3 pr-2.5 pl-4 transition-colors duration-150 ease-snappy motion-safe:animate-ds-enter",
                selected ? "bg-surface-2" : "hover:bg-surface-2/60",
            )}
        >
            <span aria-hidden className={cn("absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full", SEVERITY_BAR[f.severity])} />
            {selected && <span aria-hidden className="pointer-events-none absolute inset-0 z-[1] ring-2 ring-focus ring-inset" />}
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SeverityBadge severity={f.severity} />
                        <button type="button" onClick={onSelect} className={cn("min-w-0 rounded-sm text-left text-sm leading-snug font-semibold text-ink", FOCUS_RING)}>
                            {f.title}
                        </button>
                    </div>
                    {f.body && <p className={cn("mt-1 text-xs leading-relaxed text-ink-3", selected ? "line-clamp-4" : "line-clamp-2")}>{f.body}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-ink-4">
                        {f.subjectName && <span className="font-semibold text-ink-3">{f.subjectName}</span>}
                        <span>vu {relativeTime(f.lastSeenAt)}</span>
                        {f.seenCount > 1 && <span className="tabular-nums">{f.seenCount} fois</span>}
                        {f.state === "SNOOZED" && f.snoozedUntil && (
                            <span className="inline-flex items-center gap-1 text-warning-ink">
                                <AlarmClock className="size-3" aria-hidden />
                                revient {futureLabel(f.snoozedUntil)}
                            </span>
                        )}
                        {!open && f.state !== "SNOOZED" && <span>{FINDING_STATE_LABEL[f.state]}</span>}
                        {chips.map((c) => (
                            <span key={c.key} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-semibold text-ink-3 tabular-nums">
                                {c.label} : {c.value}
                            </span>
                        ))}
                    </div>
                </div>

                <Popover
                    open={picking}
                    onOpenChange={(o) => {
                        pickingRef.current = o;
                        setPicking(o);
                    }}
                >
                    <PopoverAnchor asChild>
                        <div
                            className={cn(
                                "relative z-[2] flex shrink-0 items-center gap-0.5 transition-opacity duration-150 ease-snappy",
                                !compact && "sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:has-[[data-state=open]]:opacity-100",
                                selected && "sm:opacity-100",
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {open ? (
                                <Button type="button" variant="ghost" size="xs" onClick={onAck} title="Marquer comme traité (e)">
                                    <Check aria-hidden />
                                    <span className="hidden sm:inline">Traité</span>
                                </Button>
                            ) : (
                                <Button type="button" variant="ghost" size="xs" onClick={onReopen} title="Rouvrir (e)">
                                    <RotateCcw aria-hidden />
                                    <span className="hidden sm:inline">Rouvrir</span>
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Actions pour « ${f.title} »`}>
                                        <MoreHorizontal aria-hidden />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-56"
                                    onCloseAutoFocus={(e) => {
                                        if (pickingRef.current) e.preventDefault();
                                    }}
                                >
                                    {open ? (
                                        <DropdownMenuItem onSelect={onAck}>
                                            <Check aria-hidden />
                                            Traité
                                            <DropdownMenuShortcut>E</DropdownMenuShortcut>
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem onSelect={onReopen}>
                                            <RotateCcw aria-hidden />
                                            Rouvrir
                                            <DropdownMenuShortcut>E</DropdownMenuShortcut>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <AlarmClock aria-hidden />
                                            Reporter
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="w-48">
                                            <DropdownMenuItem onSelect={() => onSnooze(1)}>
                                                À demain
                                                <DropdownMenuShortcut>S</DropdownMenuShortcut>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => onSnooze(7)}>Dans 7 jours</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onSelect={() => {
                                                    pickingRef.current = true;
                                                    setPicking(true);
                                                }}
                                            >
                                                <CalendarDays aria-hidden />
                                                Choisir une date…
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    {f.state !== "RESOLVED" && (
                                        <DropdownMenuItem onSelect={onResolve}>
                                            <CheckCircle2 aria-hidden />
                                            Résoudre
                                            <DropdownMenuShortcut>R</DropdownMenuShortcut>
                                        </DropdownMenuItem>
                                    )}
                                    {(onOpenRun || onOpenConversation) && <DropdownMenuSeparator />}
                                    {onOpenRun && (
                                        <DropdownMenuItem onSelect={onOpenRun}>
                                            <Eye aria-hidden />
                                            Voir l’exécution
                                            <DropdownMenuShortcut>O</DropdownMenuShortcut>
                                        </DropdownMenuItem>
                                    )}
                                    {onOpenConversation && (
                                        <DropdownMenuItem onSelect={onOpenConversation}>
                                            <MessageSquare aria-hidden />
                                            Ouvrir la conversation
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </PopoverAnchor>
                    <PopoverContent align="end" className="w-auto p-0" onClick={(e) => e.stopPropagation()}>
                        <SnoozeCalendar
                            onPick={(day) => {
                                pickingRef.current = false;
                                setPicking(false);
                                onSnoozeTo(day);
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </li>
    );
}

const SEVERITY_BAR: Record<AgentSeverity, string> = { CRITICAL: "bg-danger", WARN: "bg-warning", INFO: "bg-info" };

function SnoozeCalendar({ onPick }: { onPick: (day: Date) => void }) {
    const now = useNow(60_000);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return (
        <div>
            <p className="border-b border-line-subtle px-4 pt-3 pb-2 text-xs font-semibold text-ink-2">Reporter jusqu’au… (8 h)</p>
            <Calendar mode="single" defaultMonth={tomorrow} disabled={{ before: tomorrow }} onSelect={(d: Date | undefined) => d && onPick(d)} />
        </div>
    );
}

function NothingToDo({ folderId, compact }: { folderId: string | null; compact?: boolean }) {
    const { jobs } = useAgentJobs(folderId ? { folderId } : undefined);
    const next = jobs
        .filter((j) => j.enabled && j.nextRunAt)
        .sort((a, b) => new Date(a.nextRunAt as string).getTime() - new Date(b.nextRunAt as string).getTime())
        .slice(0, 3);
    return (
        <EmptyState compact={compact} icon={InboxIcon} tone="success" title="Rien à traiter" hint="L’agent n’a rien relevé qui demande ton attention.">
            {next.length > 0 && (
                <div className="mx-auto mt-5 max-w-sm text-left">
                    <p className="mb-1.5 px-0.5 text-3xs font-semibold uppercase tracking-[0.08em] text-ink-4">Prochaines vérifications</p>
                    <ul className="divide-y divide-line-subtle overflow-hidden rounded-[12px] border border-line bg-surface">
                        {next.map((j) => (
                            <li key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                <span className="truncate font-medium text-ink-2">{j.name}</span>
                                <span className="shrink-0 tabular-nums text-ink-3">{futureLabel(j.nextRunAt)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </EmptyState>
    );
}
