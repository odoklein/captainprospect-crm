"use client";

import { memo } from "react";
import { AlertCircle, AlertTriangle, Building2, Check, ChevronRight, Copy, Loader2, MoreHorizontal, Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    callbackState,
    displayName,
    formatRelative,
    initials,
    rowPhone,
    type CallbackKind,
} from "../_lib/queue-selectors";
import { labelForStatus, STATUS_HINTS, TONE_STYLES, type OutcomeTone } from "../_lib/status-ui";
import type { DoneEntry, QueueItem, StatusDefinition } from "../_lib/types";
import { focusRing, Kbd, ResultIcon, ToneBadge } from "./primitives";

export interface RowModel {
    labels: Record<string, string>;
    toneOf: (code: string) => OutcomeTone;
    callbackCodes: Set<string>;
    currentUserId?: string;
    now: number;
}

export interface RowHandlers {
    onFocusRow: (index: number) => void;
    onOpen: (row: QueueItem) => void;
    onToggleSelect: (key: string) => void;
    onCall: (row: QueueItem) => void;
    onCopyPhone: (row: QueueItem) => void;
    onQuickOutcome: (row: QueueItem, code: string) => void;
    onMoreOutcomes: (row: QueueItem) => void;
    onHover: (row: QueueItem) => void;
}

interface QueueRowProps {
    row: QueueItem;
    rowId: string;
    index: number;
    focused: boolean;
    selected: boolean;
    done: DoneEntry | undefined;
    submitting: boolean;
    composerOpen: boolean;
    quickOutcomes: StatusDefinition[];
    model: RowModel;
    handlers: RowHandlers;
}

const CALLBACK_STYLES: Record<CallbackKind, { text: string; accent: string; label: string }> = {
    overdue: { text: "text-cp-danger", accent: "bg-cp-danger", label: "En retard" },
    today: { text: "text-cp-warn", accent: "bg-cp-warn", label: "Aujourd'hui" },
    soon: { text: "text-cp-info", accent: "bg-transparent", label: "Bientôt" },
    later: { text: "text-cp-ink-2", accent: "bg-transparent", label: "Planifié" },
};

function QueueRowImpl({
    row,
    rowId,
    index,
    focused,
    selected,
    done,
    submitting,
    composerOpen,
    quickOutcomes,
    model,
    handlers,
}: QueueRowProps) {
    const name = displayName(row);
    const isContact = !!row.contactId;
    const phone = rowPhone(row);
    const cb = callbackState(row, model.callbackCodes, model.now);
    const isAbsent = row.priority === "ABSENT_RDV";
    const contactedByOther = !!row.lastActionBy?.id && row.lastActionBy.id !== model.currentUserId && !!row.lastActionBy.name;
    const la = row.lastAction;
    const laTone = la ? model.toneOf(la.result) : "neutral";
    const accent = isAbsent || cb?.kind === "overdue" ? "bg-cp-danger" : cb?.kind === "today" ? "bg-cp-warn" : "bg-transparent";

    return (
        <tr
            id={rowId}
            aria-current={focused ? "true" : undefined}
            onClick={() => {
                handlers.onFocusRow(index);
                handlers.onOpen(row);
            }}
            onMouseEnter={() => handlers.onHover(row)}
            className={cn(
                // border-separate table: borders live on cells, not rows
                "group cursor-pointer scroll-mt-40 transition-colors [&>td]:border-b [&>td]:border-cp-border/70",
                composerOpen && "[&>td]:border-b-transparent",
                focused ? "bg-cp-green-soft/50" : selected ? "bg-cp-sunken/70" : "hover:bg-cp-sunken/40",
                done && !focused && "opacity-60",
            )}
        >
            {/* Select + urgency accent */}
            <td className="relative w-10 py-2.5 pl-3 pr-1 align-middle" onClick={(e) => e.stopPropagation()}>
                <span className={cn("absolute inset-y-0 left-0 w-1", focused ? "bg-cp-green" : accent)} aria-hidden />
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handlers.onToggleSelect(row.contactId ?? row.companyId)}
                    aria-label={`Sélectionner ${name}`}
                    className="size-4 cursor-pointer rounded accent-cp-green"
                />
            </td>

            {/* Prospect */}
            <td className="py-2.5 pr-3 align-middle">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div
                        className={cn(
                            "flex size-9 shrink-0 items-center justify-center text-xs font-semibold",
                            isContact ? "rounded-full bg-cp-green-soft text-cp-green" : "rounded-lg bg-cp-neutral-soft text-cp-ink-2",
                        )}
                        aria-hidden
                    >
                        {isContact ? initials(name) : <Building2 className="size-4" />}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-cp-ink" title={name}>{name}</p>
                        <p className="flex min-w-0 items-center gap-1 truncate text-xs text-cp-ink-3">
                            {isContact && row.contact?.title && <span className="truncate">{row.contact.title}</span>}
                            {isContact && row.contact?.title && <span aria-hidden>·</span>}
                            {isContact ? <span className="truncate">{row.company.name}</span> : <span>Société</span>}
                        </p>
                        {(isAbsent || row.hasContactInfo === false || contactedByOther) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                                {isAbsent && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-cp-danger px-1.5 py-0.5 text-xs font-semibold text-white">
                                        <AlertTriangle className="size-3" aria-hidden /> RDV absent
                                    </span>
                                )}
                                {row.hasContactInfo === false && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-cp-warn/20 bg-cp-warn-soft px-1.5 py-0.5 text-xs text-cp-warn">
                                        <AlertCircle className="size-3" aria-hidden /> À enrichir
                                    </span>
                                )}
                                {contactedByOther && (
                                    <span className="inline-flex items-center rounded-md border border-cp-border bg-cp-neutral-soft px-1.5 py-0.5 text-xs text-cp-ink-2">
                                        Contacté par {row.lastActionBy!.name}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </td>

            {/* Phone */}
            <td className="py-2.5 pr-3 align-middle" onClick={(e) => e.stopPropagation()}>
                {phone ? (
                    <div className="inline-flex items-center gap-1">
                        <a
                            href={`tel:${phone}`}
                            onClick={(e) => {
                                e.preventDefault();
                                handlers.onFocusRow(index);
                                handlers.onCall(row);
                            }}
                            className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-cp-green/20 bg-cp-green-soft px-2.5 text-xs font-medium text-cp-green transition-colors hover:bg-cp-green hover:text-white",
                                focusRing,
                            )}
                            title="Appeler (a)"
                        >
                            <Phone className="size-3.5" aria-hidden />
                            <span className="font-cp-mono tracking-tight">{phone}</span>
                        </a>
                        <button
                            type="button"
                            onClick={() => handlers.onCopyPhone(row)}
                            aria-label="Copier le numéro"
                            title="Copier le numéro"
                            className={cn("inline-flex size-8 items-center justify-center rounded-lg text-cp-ink-3 opacity-0 transition hover:bg-cp-sunken hover:text-cp-ink group-hover:opacity-100 focus-visible:opacity-100", focused && "opacity-100", focusRing)}
                        >
                            <Copy className="size-3.5" />
                        </button>
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-cp-ink-3">
                        <PhoneOff className="size-3.5" aria-hidden /> Aucun numéro
                    </span>
                )}
            </td>

            {/* Last interaction / outcome logged here */}
            <td className="hidden max-w-72 py-2.5 pr-3 align-middle lg:table-cell">
                {done ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cp-green">
                        <Check className="size-3.5" aria-hidden />
                        Traité{done.result ? ` · ${labelForStatus(done.result, model.labels)}` : ""}
                        <span className="font-normal text-cp-ink-3">· {formatRelative(done.at, model.now)}</span>
                    </span>
                ) : la ? (
                    <div className="min-w-0 space-y-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <ToneBadge tone={laTone} code={la.result} label={labelForStatus(la.result, model.labels)} />
                            {la.createdAt && (
                                <span className="shrink-0 text-xs text-cp-ink-3">{formatRelative(new Date(la.createdAt).getTime(), model.now)}</span>
                            )}
                        </div>
                        {la.note && (
                            <p className="truncate text-xs text-cp-ink-2" title={la.note}>« {la.note} »</p>
                        )}
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-cp-ink-3">
                        <span className="size-1.5 rounded-full bg-cp-info" aria-hidden /> Jamais contacté
                    </span>
                )}
            </td>

            {/* Callback due */}
            <td className="hidden py-2.5 pr-3 align-middle xl:table-cell">
                {cb ? (
                    <div className={cn("text-xs", CALLBACK_STYLES[cb.kind].text)}>
                        <p className="font-semibold">{CALLBACK_STYLES[cb.kind].label}</p>
                        <p className="text-cp-ink-3">{formatRelative(cb.at, model.now)}</p>
                    </div>
                ) : (
                    <span className="text-xs text-cp-ink-3">—</span>
                )}
            </td>

            {/* Quick outcomes */}
            <td className="py-2.5 pr-3 align-middle" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                    {submitting ? (
                        <span className="inline-flex h-8 items-center gap-1.5 px-2 text-xs text-cp-ink-3">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Enregistrement…
                        </span>
                    ) : (
                        <>
                            {quickOutcomes.map((s, slot) => {
                                const tone = model.toneOf(s.code);
                                return (
                                    <button
                                        key={s.code}
                                        type="button"
                                        onClick={() => {
                                            handlers.onFocusRow(index);
                                            handlers.onQuickOutcome(row, s.code);
                                        }}
                                        title={`${s.label}${STATUS_HINTS[s.code] ? ` — ${STATUS_HINTS[s.code]}` : ""} (${slot + 1})`}
                                        aria-label={s.label}
                                        className={cn(
                                            "relative inline-flex size-8 items-center justify-center rounded-lg border border-cp-border bg-cp-raised text-cp-ink-3 transition-colors",
                                            TONE_STYLES[tone].button,
                                            focusRing,
                                        )}
                                    >
                                        <ResultIcon code={s.code} className="size-4" />
                                        {focused && (
                                            <span className="absolute -right-1 -top-1.5 rounded bg-cp-ink px-1 font-cp-mono text-xs leading-4 text-white" aria-hidden>
                                                {slot + 1}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => {
                                    handlers.onFocusRow(index);
                                    handlers.onMoreOutcomes(row);
                                }}
                                aria-label="Autres résultats"
                                title="Autres résultats"
                                aria-expanded={composerOpen}
                                className={cn(
                                    "inline-flex size-8 items-center justify-center rounded-lg border border-dashed border-cp-border-strong text-cp-ink-3 transition-colors hover:border-cp-ink-3 hover:text-cp-ink",
                                    composerOpen && "border-solid border-cp-green bg-cp-green-soft text-cp-green",
                                    focusRing,
                                )}
                            >
                                <MoreHorizontal className="size-4" aria-hidden />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handlers.onFocusRow(index);
                                    handlers.onOpen(row);
                                }}
                                className={cn(
                                    "ml-1 inline-flex h-8 items-center gap-0.5 rounded-lg bg-cp-ink pl-2.5 pr-1.5 text-xs font-medium text-white transition-colors hover:bg-cp-green",
                                    focusRing,
                                )}
                                title="Ouvrir la fiche (Entrée)"
                            >
                                Fiche
                                {focused ? <Kbd className="ml-1 border-white/20 bg-white/10 text-white">⏎</Kbd> : <ChevronRight className="size-4" aria-hidden />}
                            </button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}

export const QueueRow = memo(QueueRowImpl);
