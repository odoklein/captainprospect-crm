"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { rowKey } from "../_lib/queue-selectors";
import type { DoneEntry, QueueItem, StatusDefinition } from "../_lib/types";
import { InlineOutcomeComposer, type OutcomeSubmission } from "./InlineOutcomeComposer";
import { QueueRow, type RowHandlers, type RowModel } from "./QueueRow";

const PAGE = 60;
const COLUMN_COUNT = 6;

export const queueRowDomId = (key: string) => `queue-row-${key}`;

export interface ComposerState {
    key: string;
    code: string | null;
}

interface QueueTableProps {
    rows: QueueItem[];
    /** Changes whenever the view changes (filters, search, scope) to reset paging. */
    resetKey: string;
    focusedIndex: number;
    selected: Set<string>;
    onSelectAll: (keys: string[] | null) => void;
    done: Map<string, DoneEntry>;
    submittingKey: string | null;
    composer: ComposerState | null;
    statuses: StatusDefinition[];
    quickOutcomes: StatusDefinition[];
    model: RowModel;
    handlers: RowHandlers;
    requiresNote: (code: string) => boolean;
    isCallback: (code: string) => boolean;
    onComposerSubmit: (row: QueueItem, submission: OutcomeSubmission) => void;
    onComposerCancel: () => void;
    onBookMeeting: (row: QueueItem) => void;
    onComposeEmail: (row: QueueItem) => void;
    /** Rendered instead of rows (loading skeleton, error, empty). */
    placeholder?: ReactNode;
}

export function QueueTable({
    rows,
    resetKey,
    focusedIndex,
    selected,
    onSelectAll,
    done,
    submittingKey,
    composer,
    statuses,
    quickOutcomes,
    model,
    handlers,
    requiresNote,
    isCallback,
    onComposerSubmit,
    onComposerCancel,
    onBookMeeting,
    onComposeEmail,
    placeholder,
}: QueueTableProps) {
    // Progressive rendering: queues can hold thousands of rows; paint 60 at a
    // time and extend when the sentinel scrolls into view (or the cursor nears it).
    const [paging, setPaging] = useState({ key: resetKey, count: PAGE });
    if (paging.key !== resetKey) setPaging({ key: resetKey, count: PAGE }); // new view → back to page 1
    // Keyboard navigation past the painted rows extends the window too.
    const visibleCount = Math.max(paging.count, focusedIndex + PAGE);
    const sentinelRef = useRef<HTMLTableRowElement>(null);

    const hasMore = visibleCount < rows.length;
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) setPaging((p) => ({ ...p, count: visibleCount + PAGE }));
            },
            { rootMargin: "600px 0px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, visibleCount]);

    const visibleRows = rows.slice(0, visibleCount);
    const allKeys = rows.map(rowKey);
    const selectedInView = allKeys.filter((k) => selected.has(k)).length;
    const allSelected = rows.length > 0 && selectedInView === rows.length;
    const someSelected = selectedInView > 0 && !allSelected;

    const headerCheckbox = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
    }, [someSelected]);

    const th = "sticky top-[calc(3.5rem+var(--cmdbar-h,0px))] z-10 border-b border-cp-border bg-cp-canvas/95 py-2 pr-3 text-left text-xs font-medium text-cp-ink-3 backdrop-blur";

    return (
        <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
                <tr>
                    <th scope="col" className={cn(th, "w-10 pl-3 pr-1")}>
                        <input
                            ref={headerCheckbox}
                            type="checkbox"
                            checked={allSelected}
                            disabled={rows.length === 0}
                            onChange={() => onSelectAll(allSelected ? null : allKeys)}
                            aria-label={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                            className="size-4 cursor-pointer rounded accent-cp-green"
                        />
                    </th>
                    <th scope="col" className={th}>Prospect</th>
                    <th scope="col" className={th}>Téléphone</th>
                    <th scope="col" className={cn(th, "hidden lg:table-cell")}>Dernier échange</th>
                    <th scope="col" className={cn(th, "hidden xl:table-cell")}>Rappel</th>
                    <th scope="col" className={cn(th, "text-right")}>
                        <span className="sr-only">Actions</span>
                        <span aria-hidden>Résultat rapide</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {placeholder ? (
                    <tr>
                        <td colSpan={COLUMN_COUNT} className="p-0">{placeholder}</td>
                    </tr>
                ) : (
                    <>
                        {visibleRows.map((row, index) => {
                            const key = rowKey(row);
                            const composerOpen = composer?.key === key;
                            return (
                                <Fragment key={key}>
                                    <QueueRow
                                        row={row}
                                        rowId={queueRowDomId(key)}
                                        index={index}
                                        focused={index === focusedIndex}
                                        selected={selected.has(key)}
                                        done={done.get(key)}
                                        submitting={submittingKey === key}
                                        composerOpen={composerOpen}
                                        quickOutcomes={quickOutcomes}
                                        model={model}
                                        handlers={handlers}
                                    />
                                    {composerOpen && (
                                        <InlineOutcomeComposer
                                            key={`${key}:${composer.code ?? ""}`}
                                            row={row}
                                            colSpan={COLUMN_COUNT}
                                            statuses={statuses}
                                            initialCode={composer.code}
                                            toneOf={model.toneOf}
                                            requiresNote={requiresNote}
                                            isCallback={isCallback}
                                            submitting={submittingKey === key}
                                            onSubmit={(s) => onComposerSubmit(row, s)}
                                            onCancel={onComposerCancel}
                                            onBookMeeting={onBookMeeting}
                                            onComposeEmail={onComposeEmail}
                                        />
                                    )}
                                </Fragment>
                            );
                        })}
                        {hasMore && (
                            <tr ref={sentinelRef}>
                                <td colSpan={COLUMN_COUNT} className="py-4 text-center text-xs text-cp-ink-3">
                                    Chargement de {Math.min(PAGE, rows.length - visibleCount)} lignes supplémentaires…
                                </td>
                            </tr>
                        )}
                    </>
                )}
            </tbody>
        </table>
    );
}
