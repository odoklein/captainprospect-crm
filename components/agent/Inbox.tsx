"use client";

/**
 * « À traiter », the agent's inbox: pending proposals first, then findings
 * grouped by client / folder and severity-sorted. Every action is
 * optimistic with an undo toast. Keyboard: j / k to move, e = traité,
 * s = reporter 1 j, r = résoudre, a = approuver, o / Entrée = exécution.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, Check, CheckCheck, CheckCircle2, Eye, Inbox as InboxIcon, Loader2, RotateCcw, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS, SegmentedControl, SelectField, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import { Kbd } from "@/components/ui/Kbd";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import type { AgentFindingItem, AgentFindingState, AgentSeverity, PatchFindingBody } from "@/lib/assistant/api-contract";
import {
    FINDING_STATE_LABEL,
    filterFindings,
    futureLabel,
    groupFindings,
    groupOptions,
    SEVERITY_LABEL,
    snoozeUntil,
} from "@/lib/agent/client/format";
import { humanizeKey } from "@/lib/agent/client/config-form";
import { patchFinding, useAgentFindings, useAgentJobs, usePendingProposals } from "@/lib/agent/client/hooks";
import { ProposalBatch, useProposalController, useVisibleProposals } from "./ProposalBatch";
import {
    ErrorBlock,
    isTypingTarget,
    MINI_BUTTON,
    MINI_GHOST,
    SeverityBar,
    SeverityPill,
    SEVERITY_TONE,
    stagger,
} from "./shared";
import { TONE_FILL } from "@/components/ui/recipes";

type SeverityFilter = AgentSeverity | "ALL";

type NavItem = { type: "proposal"; id: string } | { type: "finding"; id: string };

export function Inbox({ folderId, onOpenRun, compact }: { folderId?: string | null; onOpenRun: (id: string) => void; compact?: boolean }) {
    const toast = useToast();
    const [severity, setSeverity] = useState<SeverityFilter>("ALL");
    const [group, setGroup] = useState<string>("ALL");
    const [state, setState] = useState<AgentFindingState>("OPEN");
    const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
    const [selected, setSelected] = useState<string | null>(null);
    const [confirmApprove, setConfirmApprove] = useState<string | null>(null);

    const pending = usePendingProposals(folderId);
    const controller = useProposalController();
    const visibleProposals = useVisibleProposals(pending.proposals, controller);
    const findings = useAgentFindings({ state, severity: severity === "ALL" ? null : severity, folderId: folderId ?? null });

    const shown = useMemo(() => findings.items.filter((f) => !hidden.has(f.id)), [findings.items, hidden]);
    const options = useMemo(() => groupOptions(shown), [shown]);
    const effectiveGroup = group === "ALL" || options.some((o) => o.key === group) ? group : "ALL";
    const groups = useMemo(() => groupFindings(filterFindings(shown, { severity: "ALL", group: effectiveGroup })), [shown, effectiveGroup]);

    const proposalsActive = state === "OPEN";
    const nav = useMemo<NavItem[]>(
        () => [
            ...(proposalsActive ? visibleProposals.map((p) => ({ type: "proposal" as const, id: p.id })) : []),
            ...groups.flatMap((g) => g.items.map((f) => ({ type: "finding" as const, id: f.id }))),
        ],
        [proposalsActive, visibleProposals, groups],
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
    const resolve = useCallback((f: AgentFindingItem) => act(f, { state: "RESOLVED" }, "Marqué comme résolu"), [act]);
    const reopen = useCallback((f: AgentFindingItem) => act(f, { state: "OPEN" }, "Rouvert"), [act]);

    const approveById = useCallback(
        (id: string) => {
            const p = visibleProposals.find((x) => x.id === id);
            if (!p || p.state !== "PENDING" || controller.results[id]?.ok || controller.busy[id]) return;
            if (p.card.danger) setConfirmApprove(id);
            else void controller.decide(p, "approve");
        },
        [controller, visibleProposals],
    );

    // Keyboard navigation.
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (compact) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
            if (document.querySelector('[aria-modal="true"]')) return;
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

    const filtered = severity !== "ALL" || effectiveGroup !== "ALL" || state !== "OPEN";
    const loading = (findings.isLoading && findings.items.length === 0) || (pending.isLoading && pending.proposals.length === 0 && proposalsActive);
    const nothing = !loading && groups.length === 0 && (!proposalsActive || visibleProposals.length === 0);
    const findingCount = groups.reduce((n, g) => n + g.items.length, 0);

    return (
        <div className="space-y-5" ref={listRef}>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<SeverityFilter>
                    ariaLabel="Sévérité"
                    value={severity}
                    onChange={setSeverity}
                    options={[
                        { value: "ALL", label: "Toutes" },
                        { value: "CRITICAL", label: SEVERITY_LABEL.CRITICAL },
                        { value: "WARN", label: SEVERITY_LABEL.WARN },
                        { value: "INFO", label: SEVERITY_LABEL.INFO },
                    ]}
                />
                {!folderId && (
                    <SelectField value={effectiveGroup} onChange={setGroup} ariaLabel="Client" className="w-44">
                        <option value="ALL">Tous les clients</option>
                        {options.map((o) => (
                            <option key={o.key} value={o.key}>
                                {o.label}
                            </option>
                        ))}
                    </SelectField>
                )}
                <SelectField value={state} onChange={(v) => setState(v as AgentFindingState)} ariaLabel="État" className="w-36">
                    {(["OPEN", "SNOOZED", "ACKED", "RESOLVED"] as const).map((s) => (
                        <option key={s} value={s}>
                            {s === "OPEN" ? "Ouverts" : s === "SNOOZED" ? "Reportés" : s === "ACKED" ? "Traités" : "Résolus"}
                        </option>
                    ))}
                </SelectField>
                {!compact && (
                    <p className="ml-auto hidden items-center gap-1.5 text-[11px] text-ink-4 lg:flex" aria-hidden>
                        <Kbd>j</Kbd>
                        <Kbd>k</Kbd> naviguer
                        <Kbd className="ml-2">e</Kbd> traité
                        <Kbd className="ml-2">s</Kbd> reporter
                        <Kbd className="ml-2">a</Kbd> approuver
                    </p>
                )}
            </div>

            {findings.degraded && (
                <p className="rounded-panel border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-ink">
                    Les tables de l’agent ne sont pas encore installées sur cette instance : rien ne peut s’afficher ici.
                </p>
            )}

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
                        <Shimmer key={i} className="h-20 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            ) : findings.error && findings.items.length === 0 && visibleProposals.length === 0 ? (
                <ErrorBlock message={findings.error.message} onRetry={findings.reload} />
            ) : nothing ? (
                filtered ? (
                    <EmptyBlock compact icon={SearchX} tone="slate" title="Rien pour ces filtres" hint="Change de sévérité, de client ou d’état." />
                ) : (
                    <NothingToDo folderId={folderId ?? null} compact={compact} />
                )
            ) : (
                <>
                    {proposalsActive && visibleProposals.length > 0 && (
                        <section aria-label="Propositions à valider" className="space-y-2.5">
                            <h3 className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                                <CheckCheck className="size-3.5" aria-hidden />
                                Propositions à valider
                            </h3>
                            <ProposalBatch proposals={pending.proposals} controller={controller} selectedId={selectedId} onSelect={setSelected} />
                        </section>
                    )}

                    {groups.length > 0 && (
                        <div className="space-y-5">
                            {proposalsActive && visibleProposals.length > 0 && (
                                <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                                    Constats · {findingCount}
                                </h3>
                            )}
                            {groups.map((g, gi) => (
                                <section key={g.key} aria-label={g.label} className="motion-safe:animate-ds-enter" style={stagger(gi)}>
                                    {!folderId && (
                                        <div className="mb-2 flex items-center gap-2 px-1">
                                            <span className={cn("size-2 rounded-full", TONE_FILL[SEVERITY_TONE[g.topSeverity]])} aria-hidden />
                                            <h4 className="truncate text-sm font-bold text-ink">{g.label}</h4>
                                            <span className="text-[11px] font-semibold text-ink-4 tabular-nums">
                                                {g.items.length}
                                                {g.counts.CRITICAL > 0 && <span className="text-danger"> · {g.counts.CRITICAL} critique{g.counts.CRITICAL > 1 ? "s" : ""}</span>}
                                            </span>
                                        </div>
                                    )}
                                    <ul className="overflow-hidden rounded-panel border border-line bg-surface divide-y divide-line-subtle shadow-2xs">
                                        {g.items.map((f) => (
                                            <FindingRow
                                                key={f.id}
                                                finding={f}
                                                selected={selectedId === f.id}
                                                onSelect={() => setSelected(f.id)}
                                                onAck={() => void ack(f)}
                                                onSnooze={(d) => void snooze(f, d)}
                                                onResolve={() => void resolve(f)}
                                                onReopen={() => void reopen(f)}
                                                onOpenRun={f.runId ? () => onOpenRun(f.runId as string) : undefined}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))}
                            {findings.hasMore && (
                                <div className="flex justify-center">
                                    <button type="button" className={MINI_BUTTON} onClick={findings.loadMore} disabled={findings.isLoadingMore}>
                                        {findings.isLoadingMore && <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />}
                                        Charger plus de constats
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <ConfirmModal
                isOpen={confirmApprove !== null}
                onClose={() => setConfirmApprove(null)}
                onConfirm={() => {
                    const p = visibleProposals.find((x) => x.id === confirmApprove);
                    setConfirmApprove(null);
                    if (p) void controller.decide(p, "approve");
                }}
                variant="danger"
                title="Approuver cette action sensible ?"
                message={visibleProposals.find((x) => x.id === confirmApprove)?.card.title ?? ""}
                confirmText="Approuver"
            />
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
    onSelect,
    onAck,
    onSnooze,
    onResolve,
    onReopen,
    onOpenRun,
}: {
    finding: AgentFindingItem;
    selected: boolean;
    onSelect: () => void;
    onAck: () => void;
    onSnooze: (days: number) => void;
    onResolve: () => void;
    onReopen: () => void;
    onOpenRun?: () => void;
}) {
    const chips = metricChips(f.metrics);
    const open = f.state === "OPEN";
    return (
        <li
            data-nav-id={f.id}
            aria-current={selected ? "true" : undefined}
            onClick={onSelect}
            className={cn(
                "group relative pl-5 pr-3.5 py-3 transition-colors duration-150 ease-snappy motion-safe:animate-ds-enter",
                selected ? "bg-surface-2" : "hover:bg-surface-2/60",
            )}
        >
            <SeverityBar severity={f.severity} />
            {selected && <span aria-hidden className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-focus" />}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SeverityPill severity={f.severity} />
                        <button
                            type="button"
                            onClick={onSelect}
                            className={cn("min-w-0 text-left text-sm font-semibold leading-snug text-ink rounded-sm", FOCUS)}
                        >
                            {f.title}
                        </button>
                    </div>
                    {f.body && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-3">{f.body}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-4">
                        {f.subjectName && <span className="font-semibold text-ink-3">{f.subjectName}</span>}
                        <span>vu {relativeTime(f.lastSeenAt)}</span>
                        {f.seenCount > 1 && <span>{f.seenCount} fois</span>}
                        {f.state === "SNOOZED" && f.snoozedUntil && <span className="text-warning-ink">revient {futureLabel(f.snoozedUntil)}</span>}
                        {!open && f.state !== "SNOOZED" && <span>{FINDING_STATE_LABEL[f.state]}</span>}
                        {chips.map((c) => (
                            <span key={c.key} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-semibold text-ink-3 tabular-nums">
                                {c.label} : {c.value}
                            </span>
                        ))}
                    </div>
                </div>
                <div
                    className={cn(
                        "flex shrink-0 flex-wrap items-center gap-1 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                        selected && "sm:opacity-100",
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    {open ? (
                        <>
                            <button type="button" className={MINI_BUTTON} onClick={onAck} title="Marquer comme traité (e)">
                                <Check className="size-3.5" aria-hidden />
                                Traité
                            </button>
                            <div role="group" aria-label="Reporter" className="inline-flex items-center rounded-control border border-line bg-surface shadow-2xs">
                                <span className="pl-2 text-ink-4" aria-hidden>
                                    <AlarmClock className="size-3.5" />
                                </span>
                                <button type="button" className={cn(MINI_GHOST, "h-[30px] px-2")} onClick={() => onSnooze(1)} title="Reporter d’un jour (s)" aria-label="Reporter d’un jour">
                                    1 j
                                </button>
                                <button type="button" className={cn(MINI_GHOST, "h-[30px] px-2")} onClick={() => onSnooze(7)} title="Reporter d’une semaine" aria-label="Reporter d’une semaine">
                                    7 j
                                </button>
                            </div>
                            <button type="button" className={MINI_GHOST} onClick={onResolve} title="Résoudre (r)">
                                <CheckCircle2 className="size-3.5" aria-hidden />
                                <span className="sm:hidden xl:inline">Résoudre</span>
                            </button>
                        </>
                    ) : (
                        <button type="button" className={MINI_BUTTON} onClick={onReopen} title="Rouvrir (e)">
                            <RotateCcw className="size-3.5" aria-hidden />
                            Rouvrir
                        </button>
                    )}
                    {onOpenRun && (
                        <button type="button" className={MINI_GHOST} onClick={onOpenRun} title="Voir l’exécution et la conversation de l’agent (o)" aria-label="Voir l’exécution de l’agent">
                            <Eye className="size-3.5" aria-hidden />
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

function NothingToDo({ folderId, compact }: { folderId: string | null; compact?: boolean }) {
    const { jobs } = useAgentJobs(folderId ? { folderId } : undefined);
    const next = jobs
        .filter((j) => j.enabled && j.nextRunAt)
        .sort((a, b) => new Date(a.nextRunAt as string).getTime() - new Date(b.nextRunAt as string).getTime())
        .slice(0, 3);
    return (
        <div className={cn("rounded-2xl border border-dashed border-line bg-surface-2/60 px-6 text-center motion-safe:animate-ds-pop", compact ? "py-7" : "py-10")}>
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-success-soft text-success shadow-2xs">
                <InboxIcon className="size-6" aria-hidden />
            </div>
            <p className="mt-2 text-sm font-bold text-ink">Rien à traiter</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-3">L’agent n’a rien relevé qui demande ton attention.</p>
            {next.length > 0 && (
                <div className="mx-auto mt-4 max-w-sm text-left">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-4">Prochaines vérifications</p>
                    <ul className="divide-y divide-line-subtle rounded-panel border border-line bg-surface">
                        {next.map((j) => (
                            <li key={j.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                <span className="truncate font-semibold text-ink-2">{j.name}</span>
                                <span className="shrink-0 tabular-nums text-ink-3">{futureLabel(j.nextRunAt)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
