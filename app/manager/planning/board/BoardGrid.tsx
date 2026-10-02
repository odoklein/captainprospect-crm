'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Ban, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ABSENCE_LABELS, isWeekendKey, isoWeekday, type BoardAbsence, type BoardSdr } from '@/lib/planning/board-shared';
import {
    applyOps,
    avatarColor,
    buildIndex,
    cellEntries,
    cellKey,
    formatDayHeader,
    formatDays,
    initials,
    missionColor,
    resolveIntent,
    sdrLoad,
    type BoardIndex,
    type BoardState,
    type Cell,
    type CellEntry,
    type Intent,
    type MissionColor,
    type ViewMode,
} from './engine';
import { fitLabel } from './measure';

/** What a pointer gesture does: paint a mission, paint an absence, erase — or nothing (null). */
export type Brush = { kind: 'mission'; missionId: string } | { kind: 'absence' } | { kind: 'eraser' } | null;

export type CellFocus =
    | { kind: 'empty'; slot?: 'am' | 'pm' }
    | { kind: 'block'; blockId: string }
    | { kind: 'absence'; absence: BoardAbsence };

export const HATCH = 'repeating-linear-gradient(135deg, #F1F5F9 0 6px, #E2E8F0 6px 12px)';

export function shortName(name: string): string {
    const words = name.trim().split(/\s+/);
    return words[0].length >= 4 || words.length === 1 ? words[0] : words.slice(0, 2).join(' ');
}

// ── Sizing ─────────────────────────────────────────────────────────────

/** Row heights each zoom may use: rows shrink toward `min` so the whole team fits on screen. */
const ROW_LIMITS: Record<ViewMode, [number, number]> = {
    week: [44, 80],
    twoWeeks: [42, 68],
    month: [32, 52],
};
const MIN_COL: Record<ViewMode, number> = { week: 120, twoWeeks: 76, month: 38 };
/** Room kept free under the last row for the floating dock and its hint. */
export const DOCK_RESERVE = 84;

interface Metrics {
    header: number;
    row: number;
    head: number;
    col: number;
    pill: number;
    font: number;
    avatar: number;
    cellPad: number;
    pillPad: number;
}

function computeMetrics(view: ViewMode, width: number, height: number, rows: number, cols: number, footer: boolean): Metrics {
    const month = view === 'month';
    const header = month ? 50 : 44;
    const [minRow, maxRow] = ROW_LIMITS[view];
    const available = height - header - DOCK_RESERVE - (footer ? 32 : 0);
    const row = height > 0 ? Math.max(minRow, Math.min(maxRow, Math.floor(available / Math.max(1, rows)))) : maxRow;
    const head = Math.round(Math.max(month ? 132 : 156, Math.min(month ? 176 : 228, width * (month ? 0.1 : 0.13))));
    const col = Math.max(MIN_COL[view], (width - head) / Math.max(1, cols));
    return {
        header,
        row,
        head,
        col,
        pill: Math.max(month ? 24 : 28, Math.min(36, Math.round(row * (month ? 0.56 : 0.46)))),
        font: month ? 11 : row >= 64 && col >= 110 ? 13 : 12,
        avatar: Math.max(26, Math.min(40, Math.round(row * 0.5))),
        cellPad: month ? 3 : col >= 150 ? 10 : 6,
        pillPad: month ? 5 : col >= 150 ? 14 : 9,
    };
}

// ── Component ──────────────────────────────────────────────────────────

interface BoardGridProps {
    state: BoardState;
    index: BoardIndex;
    colors: Map<string, MissionColor>;
    view: ViewMode;
    days: string[];
    sdrs: BoardSdr[];
    brush: Brush;
    /** Mission hovered in the dock: its days stand out, the rest fades. */
    highlightMissionId: string | null;
    activeCellKey: string | null;
    onStroke: (cells: Cell[], half: boolean) => void;
    onOpenCell: (cell: Cell, anchor: DOMRect, focus: CellFocus) => void;
    onMove: (blockId: string, to: Cell, copy: boolean) => void;
    footer?: ReactNode;
}

interface Pos {
    row: number;
    col: number;
}

export function BoardGrid({
    state,
    index,
    colors,
    view,
    days,
    sdrs,
    brush,
    highlightMissionId,
    activeCellKey,
    onStroke,
    onOpenCell,
    onMove,
    footer,
}: BoardGridProps) {
    const compact = view === 'month';
    const painting = brush !== null;

    // Size everything from the space actually available: it changes when the
    // sidebar opens or closes, and with the window.
    const scrollRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            setBox({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const m = computeMetrics(view, box.width, box.height, sdrs.length, days.length, !!footer);

    // ── Pointer state ─────────────────────────────────────────────────
    const [hover, setHover] = useState<Pos | null>(null);
    const [stroke, setStroke] = useState<{ anchor: Pos; current: Pos; half: boolean } | null>(null);
    const [shiftHeld, setShiftHeld] = useState(false);

    useEffect(() => {
        if (!painting) return;
        const onKey = (event: KeyboardEvent) => setShiftHeld(event.shiftKey);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKey);
        };
    }, [painting]);

    const rectCells = (s: { anchor: Pos; current: Pos }): Cell[] => {
        const cells: Cell[] = [];
        const [r0, r1] = [Math.min(s.anchor.row, s.current.row), Math.max(s.anchor.row, s.current.row)];
        const [c0, c1] = [Math.min(s.anchor.col, s.current.col), Math.max(s.anchor.col, s.current.col)];
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                if (sdrs[r] && days[c]) cells.push({ sdrId: sdrs[r].id, date: days[c] });
            }
        }
        return cells;
    };

    // Listeners are re-bound whenever the stroke changes, so `stroke` here is current.
    useEffect(() => {
        if (!stroke) return;
        const finish = (event: PointerEvent) => {
            setStroke(null);
            onStroke(rectCells(stroke), stroke.half || event.shiftKey);
        };
        const cancel = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setStroke(null);
        };
        window.addEventListener('pointerup', finish);
        window.addEventListener('keydown', cancel);
        return () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('keydown', cancel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stroke, onStroke]);

    // ── Live preview: the board as it will be once the stroke is released ──
    const half = (stroke?.half ?? false) || shiftHeld;
    const preview = useMemo(() => {
        if (!brush) return null;
        // Hovering a name previews the whole row, which is what a click there paints.
        const rowCells = (row: number) => days.filter((d) => !isWeekendKey(d)).map((date) => ({ sdrId: sdrs[row].id, date }));
        const cells = stroke
            ? rectCells(stroke)
            : hover
                ? hover.col === -1 ? rowCells(hover.row) : rectCells({ anchor: hover, current: hover })
                : [];
        if (cells.length === 0) return null;
        let intent: Intent;
        if (brush.kind === 'mission') intent = { kind: 'paint', cells, missionId: brush.missionId, mode: half ? 'half' : 'full' };
        else if (brush.kind === 'eraser') intent = { kind: 'erase', cells };
        else intent = { kind: 'absence', cells, absenceType: 'VACATION' };
        const resolution = resolveIntent(state, index, intent, { canEditAbsences: state.canEditAbsences });
        const after = buildIndex(applyOps(state, resolution.ops, undefined, (i) => `preview-${i}`));

        const blocked = new Map<string, string>();
        if (brush.kind === 'mission') {
            const mission = index.missionsById.get(brush.missionId);
            for (const c of cells) {
                const key = cellKey(c.sdrId, c.date);
                if (index.absenceByCell.has(key)) blocked.set(key, 'Absent');
                else if (!mission || c.date < mission.startDate || c.date > mission.endDate) blocked.set(key, 'Hors mission');
            }
        }
        return { keys: new Set(cells.map((c) => cellKey(c.sdrId, c.date))), after, blocked, touched: resolution.touched };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brush, stroke, hover, half, state, index, sdrs, days]);

    // ── Drag to move / copy (no brush) ────────────────────────────────
    const [dragBlockId, setDragBlockId] = useState<string | null>(null);
    const [drop, setDrop] = useState<{ key: string; copy: boolean } | null>(null);

    const brushColor = brush?.kind === 'mission' ? missionColor(colors, brush.missionId) : null;
    const hoveredRowId = hover ? sdrs[hover.row]?.id ?? null : null;

    function paintRow(sdrId: string) {
        onStroke(days.filter((d) => !isWeekendKey(d)).map((date) => ({ sdrId, date })), shiftHeld);
    }

    // ── Rendering helpers ─────────────────────────────────────────────
    const pillStyle = (color: MissionColor, extra?: CSSProperties): CSSProperties => ({
        height: m.pill,
        fontSize: m.font,
        paddingInline: m.pillPad,
        backgroundColor: color.bg,
        color: color.text,
        ...extra,
    });

    function renderPill(entry: CellEntry, cell: Cell, isHalf: boolean, past: boolean, isPreview: boolean) {
        const mission = index.missionsById.get(entry.missionId);
        const color = missionColor(colors, entry.missionId);
        const name = mission?.name ?? 'Mission';
        const dupes = entry.duplicates.length;
        const full = m.col - 2 * m.cellPad;
        const label = isHalf
            ? fitLabel(compact ? [initials(name)] : [`½ ${shortName(name)}`, `½ ${initials(name)}`, initials(name)], (full - 6) / 2 - 2 * Math.min(m.pillPad, 8), m.font)
            : fitLabel(compact ? [shortName(name), initials(name)] : [name, shortName(name), initials(name)], full - 2 * m.pillPad - (dupes && !compact ? 28 : 0), m.font);
        const dimmed = highlightMissionId !== null && highlightMissionId !== entry.missionId;
        const lit = highlightMissionId === entry.missionId;
        const draggable = !painting && !isPreview && !entry.block.id.startsWith('tmp-');
        return (
            <button
                key={entry.block.id}
                type="button"
                draggable={draggable}
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copyMove';
                    setDragBlockId(entry.block.id);
                }}
                onDragEnd={() => {
                    setDragBlockId(null);
                    setDrop(null);
                }}
                onClick={(event) => {
                    if (painting) return;
                    event.stopPropagation();
                    onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'block', blockId: entry.block.id });
                }}
                title={`${name}${mission ? ` · ${mission.clientName}` : ''}\n${entry.block.startTime}–${entry.block.endTime}${dupes ? `\nCompté ${dupes + 1} fois ce jour` : ''}\nGlisser pour déplacer · Alt+glisser pour copier`}
                className={cn(
                    'relative flex min-w-0 flex-1 items-center truncate font-medium transition-[opacity,transform,box-shadow] duration-150',
                    compact ? 'justify-center rounded-md' : 'rounded-full',
                    !compact && (isHalf && m.col < 150 ? 'justify-center' : 'justify-start'),
                    !painting && 'cursor-grab hover:-translate-y-px hover:shadow-sm active:cursor-grabbing',
                    painting && 'pointer-events-none',
                    past && !lit && 'opacity-70',
                    dimmed && 'opacity-20',
                    dragBlockId === entry.block.id && 'opacity-40',
                    entry.block.id.startsWith('tmp-') && 'opacity-80',
                )}
                style={pillStyle(color, lit ? { boxShadow: `0 0 0 2px #FFFFFF, 0 0 0 4px ${color.solid}` } : undefined)}
            >
                <span className="truncate">{label}</span>
                {dupes > 0 && !compact && !isHalf && (
                    <span className="ml-1.5 shrink-0 rounded-full bg-white/80 px-1.5 text-[10px] font-semibold text-slate-500">×{dupes + 1}</span>
                )}
            </button>
        );
    }

    function renderEmpty(cell: Cell, slot: 'am' | 'pm' | undefined, showPlus: boolean, past: boolean) {
        if (painting) return <span className="flex-1" />;
        if (!showPlus) {
            return (
                <span className="flex flex-1 items-center justify-center">
                    {!past && !slot && !compact && <span className="h-1 w-1 rounded-full bg-slate-300" />}
                </span>
            );
        }
        return (
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'empty', slot });
                }}
                aria-label="Ajouter une mission"
                className={cn(
                    'flex flex-1 items-center justify-center border border-dashed border-indigo-200 bg-white/70 text-indigo-400 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-600',
                    compact ? 'rounded-md' : 'rounded-full',
                )}
                style={{ height: m.pill }}
            >
                <Plus className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            </button>
        );
    }

    function renderContent(sdr: BoardSdr, day: string, source: BoardIndex, isPreview: boolean, showPlus: boolean) {
        const cell = { sdrId: sdr.id, date: day };
        const key = cellKey(sdr.id, day);
        const absence = source.absenceByCell.get(key);
        const entries = cellEntries(source.blocksByCell.get(key) ?? []);
        const past = day < state.today;

        if (absence) {
            const label = ABSENCE_LABELS[absence.type] ?? 'Absence';
            return (
                <button
                    type="button"
                    onClick={(event) => {
                        if (painting) return;
                        event.stopPropagation();
                        onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'absence', absence });
                    }}
                    className={cn('flex flex-1 items-center justify-center truncate font-medium text-slate-500', compact ? 'rounded-md' : 'rounded-full', painting && 'pointer-events-none', highlightMissionId && 'opacity-30')}
                    style={{ background: HATCH, height: m.pill, fontSize: m.font }}
                    title={label}
                >
                    {!compact && <span className="truncate">{label}</span>}
                </button>
            );
        }
        if (entries.length === 0) return renderEmpty(cell, undefined, showPlus, past);
        if (entries.length === 1 && entries[0].slot === 'full') return renderPill(entries[0], cell, false, past, isPreview);
        if (entries.length === 1) {
            const pill = renderPill(entries[0], cell, true, past, isPreview);
            const free = renderEmpty(cell, entries[0].slot === 'am' ? 'pm' : 'am', showPlus, past);
            return entries[0].slot === 'am' ? <>{pill}{free}</> : <>{free}{pill}</>;
        }
        return (
            <>
                {renderPill(entries[0], cell, true, past, isPreview)}
                {renderPill(entries[1], cell, true, past, isPreview)}
                {entries.length > 2 && <span className="shrink-0 self-center text-[10px] font-semibold text-slate-400">+{entries.length - 2}</span>}
            </>
        );
    }

    function renderCell(sdr: BoardSdr, rowIndex: number, day: string, colIndex: number) {
        const cell = { sdrId: sdr.id, date: day };
        const key = cellKey(sdr.id, day);
        const inPreview = preview?.keys.has(key) ?? false;
        const blockedReason = inPreview ? preview?.blocked.get(key) : undefined;
        const hadContent = (index.blocksByCell.get(key)?.length ?? 0) > 0 || index.absenceByCell.has(key);
        const isCurrent = !!stroke && stroke.current.row === rowIndex && stroke.current.col === colIndex;
        const showPlus = !painting && (hoveredRowId === sdr.id || activeCellKey === key);
        const isToday = day === state.today;
        const weekStart = view !== 'week' && isoWeekday(day) === 1;

        let content: ReactNode;
        if (inPreview && brush?.kind === 'eraser') {
            content = hadContent
                ? <span className={cn('flex flex-1 items-center justify-center border-2 border-dashed border-rose-300 bg-rose-50 font-medium text-rose-500', compact ? 'rounded-md' : 'rounded-full')} style={{ height: m.pill, fontSize: m.font }}>{compact ? '×' : 'Effacer'}</span>
                : <span className="flex-1" />;
        } else if (inPreview && blockedReason) {
            content = (
                <span className="relative flex flex-1 items-center gap-1.5 opacity-40">
                    {renderContent(sdr, day, index, false, false)}
                    {!compact && <span className="absolute inset-0 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600"><Ban className="h-3.5 w-3.5" />{blockedReason}</span>}
                </span>
            );
        } else {
            content = renderContent(sdr, day, inPreview && preview ? preview.after : index, inPreview, showPlus);
        }

        const previewTint = inPreview && !blockedReason && brush?.kind !== 'eraser';
        return (
            <div
                key={key}
                role="gridcell"
                onPointerDown={(event) => {
                    if (!painting || event.button !== 0) return;
                    event.preventDefault();
                    const pos = { row: rowIndex, col: colIndex };
                    setStroke({ anchor: pos, current: pos, half: event.shiftKey });
                }}
                onPointerEnter={() => {
                    setHover({ row: rowIndex, col: colIndex });
                    setStroke((s) => (s && (s.current.row !== rowIndex || s.current.col !== colIndex) ? { ...s, current: { row: rowIndex, col: colIndex } } : s));
                }}
                onDragOver={(event) => {
                    if (!dragBlockId) return;
                    event.preventDefault();
                    const copy = event.altKey || event.ctrlKey;
                    event.dataTransfer.dropEffect = copy ? 'copy' : 'move';
                    setDrop((d) => (d?.key === key && d.copy === copy ? d : { key, copy }));
                }}
                onDragLeave={() => setDrop((d) => (d?.key === key ? null : d))}
                onDrop={(event) => {
                    event.preventDefault();
                    if (dragBlockId) onMove(dragBlockId, cell, event.altKey || event.ctrlKey);
                    setDragBlockId(null);
                    setDrop(null);
                }}
                className={cn(
                    'relative flex items-center gap-1.5 border-l border-dashed border-slate-200/80 transition-colors duration-100',
                    weekStart && 'border-solid border-slate-300/70',
                    isToday && 'bg-indigo-50/40',
                    painting && 'cursor-crosshair',
                    drop?.key === key && 'bg-indigo-50 ring-2 ring-inset ring-indigo-300',
                    activeCellKey === key && 'bg-indigo-50/70',
                    inPreview && brush?.kind === 'eraser' && hadContent && 'bg-rose-50/40',
                )}
                style={{
                    height: m.row,
                    paddingInline: m.cellPad,
                    ...(previewTint && brushColor ? { backgroundColor: `${brushColor.bg}99`, boxShadow: `inset 0 0 0 1.5px ${brushColor.solid}55` } : {}),
                    ...(previewTint && brush?.kind === 'absence' ? { boxShadow: 'inset 0 0 0 1.5px #94A3B8' } : {}),
                }}
            >
                {content}
                {drop?.key === key && (
                    <span className="pointer-events-none absolute right-1 top-1 rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
                        {drop.copy ? 'Copier' : 'Déplacer'}
                    </span>
                )}
                {isCurrent && preview && preview.touched > 0 && (
                    <span className="pointer-events-none absolute -top-2 right-1 z-10 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                        {brush?.kind === 'eraser' ? `${preview.touched} case${preview.touched > 1 ? 's' : ''}` : `${preview.touched} j${half && brush?.kind === 'mission' ? ' · ½' : ''}`}
                    </span>
                )}
            </div>
        );
    }

    const gridTemplateColumns = `${m.head}px repeat(${days.length}, minmax(${MIN_COL[view]}px, 1fr))`;

    return (
        <div
            ref={scrollRef}
            className={cn('h-full overflow-auto', painting && 'select-none')}
            data-guide="grid"
            onPointerLeave={() => setHover(null)}
        >
            <div className="grid min-w-fit" style={{ gridTemplateColumns, paddingBottom: DOCK_RESERVE }} role="grid">
                {/* Header */}
                <div className="sticky left-0 top-0 z-20 bg-[#FAFAFB]" style={{ height: m.header }} />
                {days.map((day) => {
                    const { weekday, day: num } = formatDayHeader(day);
                    const isToday = day === state.today;
                    const past = day < state.today;
                    const weekStart = view !== 'week' && isoWeekday(day) === 1;
                    return (
                        <div
                            key={day}
                            className={cn(
                                'sticky top-0 z-10 flex items-center border-l border-dashed border-slate-200/80 bg-[#FAFAFB]',
                                compact ? 'justify-center' : '',
                                weekStart && 'border-solid border-slate-300/70',
                            )}
                            style={{ height: m.header, paddingInline: compact ? 2 : m.cellPad + 4 }}
                        >
                            {compact ? (
                                <div className={cn('flex flex-col items-center leading-tight', past ? 'text-slate-400' : 'text-slate-700')}>
                                    <span className="text-[10px] font-medium uppercase">{weekday.slice(0, 1)}</span>
                                    <span className={cn('mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold', isToday && 'bg-indigo-600 text-white')}>{num}</span>
                                </div>
                            ) : (
                                <div className={cn('flex items-center gap-2 font-semibold', m.col >= 110 ? 'text-[15px]' : 'text-[13px]', past ? 'text-slate-400' : 'text-slate-800', isToday && 'text-indigo-600')}>
                                    <span>{weekday} {num}</span>
                                    {isToday && view === 'week' && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Aujourd&apos;hui</span>}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Rows */}
                {sdrs.map((sdr, rowIndex) => {
                    const load = sdrLoad(index, sdr.id, days);
                    const ratio = load.capacity > 0 ? Math.min(1, load.planned / load.capacity) : 0;
                    return (
                        <div key={sdr.id} className="contents">
                            <button
                                type="button"
                                onClick={() => painting && paintRow(sdr.id)}
                                onPointerEnter={() => setHover({ row: rowIndex, col: -1 })}
                                className={cn(
                                    'sticky left-0 z-[5] flex items-center gap-3 bg-[#FAFAFB] pr-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-300',
                                    compact ? 'pl-1' : 'pl-2',
                                    painting ? 'cursor-pointer hover:bg-indigo-50/60' : 'cursor-default',
                                )}
                                style={{ height: m.row }}
                                title={painting ? `Remplir toute la ligne de ${sdr.name}` : undefined}
                            >
                                <span
                                    className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
                                    style={{ width: m.avatar, height: m.avatar, backgroundColor: avatarColor(sdr.name), fontSize: m.avatar * 0.36 }}
                                >
                                    {initials(sdr.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate font-semibold text-slate-800', compact ? 'text-[12px]' : m.row >= 64 ? 'text-[15px]' : 'text-[14px]')}>
                                        {sdr.name}
                                        {!sdr.isActive && <span className="ml-1 text-[11px] font-normal text-slate-400">inactif</span>}
                                    </span>
                                    {!compact && (
                                        <span className="mt-1 flex items-center gap-2">
                                            <span className="h-1 w-full max-w-[64px] overflow-hidden rounded-full bg-slate-200/80">
                                                <span
                                                    className={cn('block h-full rounded-full transition-[width] duration-300', ratio >= 1 ? 'bg-emerald-500' : ratio > 0 ? 'bg-indigo-400' : 'bg-transparent')}
                                                    style={{ width: `${ratio * 100}%` }}
                                                />
                                            </span>
                                            <span className={cn('shrink-0 text-[11px] tabular-nums', ratio >= 1 ? 'text-emerald-600' : 'text-slate-400')}>
                                                {formatDays(load.planned)} / {formatDays(load.capacity)}
                                            </span>
                                        </span>
                                    )}
                                </span>
                            </button>
                            {days.map((day, colIndex) => renderCell(sdr, rowIndex, day, colIndex))}
                        </div>
                    );
                })}

                {footer && <div className="col-span-full flex h-8 items-center">{footer}</div>}
            </div>
        </div>
    );
}
