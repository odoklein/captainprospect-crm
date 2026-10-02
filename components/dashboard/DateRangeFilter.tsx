"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateRangePreset =
    | "last7"
    | "last4weeks"
    | "lastMonth"
    | "last6months"
    | "last12months"
    | "monthToDate"
    | "quarterToDate"
    | "yearToDate"
    | "allTime";

export interface DateRangeValue {
    preset?: DateRangePreset;
    startDate?: string; // ISO date
    endDate?: string;
}

const PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: "last7", label: "7 derniers jours" },
    { key: "last4weeks", label: "4 dernières semaines" },
    { key: "lastMonth", label: "30 derniers jours" },
    { key: "last6months", label: "6 derniers mois" },
    { key: "last12months", label: "12 derniers mois" },
    { key: "monthToDate", label: "Mois en cours" },
    { key: "quarterToDate", label: "Trimestre en cours" },
    { key: "yearToDate", label: "Année en cours" },
    { key: "allTime", label: "Tout" },
];

/** Format date as YYYY-MM-DD in local time (avoids UTC shift that causes "day before" bug). */
export function toISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as local date (avoids UTC midnight shifting to previous day). */
function parseISODate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function getPresetRange(preset: DateRangePreset): { start: Date; end: Date } {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (preset) {
        case "last7":
            start.setDate(start.getDate() - 6);
            break;
        case "last4weeks":
            start.setDate(start.getDate() - 4 * 7);
            break;
        case "lastMonth":
            // Rolling 30 days: from today back 30 days (not calendar month 1–30)
            start.setDate(start.getDate() - 30);
            break;
        case "last6months":
            start.setMonth(start.getMonth() - 6);
            break;
        case "last12months":
            start.setFullYear(start.getFullYear() - 1);
            start.setMonth(start.getMonth() + 1);
            break;
        case "monthToDate":
            start.setDate(1);
            break;
        case "quarterToDate":
            const q = Math.floor(start.getMonth() / 3) + 1;
            start.setMonth((q - 1) * 3);
            start.setDate(1);
            break;
        case "yearToDate":
            start.setMonth(0);
            start.setDate(1);
            break;
        case "allTime":
            start.setFullYear(2020, 0, 1);
            break;
        default:
            start.setMonth(start.getMonth() - 1);
    }
    return { start, end };
}

function formatForInput(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function parseInput(s: string): string | null {
    const match = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return toISO(date);
}

interface DateRangeFilterProps {
    value: DateRangeValue;
    onChange: (value: DateRangeValue) => void;
    onClose?: () => void;
    /** When true, renders as a dropdown panel (e.g. next to a trigger button). */
    isOpen?: boolean;
    className?: string;
}

export function DateRangeFilter({
    value,
    onChange,
    onClose,
    isOpen = true,
    className,
}: DateRangeFilterProps) {
    const [preset, setPreset] = useState<DateRangePreset | null>(() => value.preset ?? null);
    const [startInput, setStartInput] = useState(() =>
        value.startDate ? formatForInput(value.startDate) : ""
    );
    const [endInput, setEndInput] = useState(() =>
        value.endDate ? formatForInput(value.endDate) : ""
    );
    const [leftMonth, setLeftMonth] = useState(() => {
        const d = value.startDate ? parseISODate(value.startDate) : new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [selectingEnd, setSelectingEnd] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const endDate = value.endDate ? parseISODate(value.endDate) : new Date();
    const rightMonth = useMemo(() => {
        const next = new Date(leftMonth);
        next.setMonth(next.getMonth() + 1);
        return next;
    }, [leftMonth]);

    const applyPreset = (key: DateRangePreset) => {
        setPreset(key);
        const { start, end } = getPresetRange(key);
        const startStr = toISO(start);
        const endStr = toISO(end);
        setStartInput(formatForInput(startStr));
        setEndInput(formatForInput(endStr));
        onChange({ preset: key, startDate: startStr, endDate: endStr });
    };

    const handleApply = () => {
        const start = parseInput(startInput);
        const end = parseInput(endInput);
        if (start && end && parseISODate(start) <= parseISODate(end)) {
            onChange({ startDate: start, endDate: end, preset: undefined });
            onClose?.();
        } else if (start && end) {
            onChange({ startDate: end, endDate: start, preset: undefined });
            onClose?.();
        }
        onClose?.();
    };

    const handleClear = () => {
        setPreset("allTime");
        setStartInput("");
        setEndInput("");
        const { start, end } = getPresetRange("allTime");
        onChange({ preset: "allTime", startDate: toISO(start), endDate: toISO(end) });
        onClose?.();
    };

    const handleCalendarClick = (year: number, month: number, day: number) => {
        const d = new Date(year, month, day);
        const iso = toISO(d);
        if (!selectingEnd) {
            setStartInput(formatForInput(iso));
            setEndInput(formatForInput(iso));
            setSelectingEnd(true);
            onChange({ startDate: iso, endDate: iso, preset: undefined });
        } else {
            const start = value.startDate || iso;
            if (parseISODate(iso) < parseISODate(start)) {
                setStartInput(formatForInput(iso));
                setEndInput(formatForInput(start));
                onChange({ startDate: iso, endDate: start, preset: undefined });
            } else {
                setEndInput(formatForInput(iso));
                onChange({ startDate: start, endDate: iso, preset: undefined });
            }
            setSelectingEnd(false);
        }
    };

    const startDateParsed = value.startDate ? parseISODate(value.startDate) : null;
    const endDateParsed = value.endDate ? parseISODate(value.endDate) : null;

    if (!isOpen) return null;

    return (
        <div
            ref={containerRef}
            className={cn(
                "bg-white rounded-3xl border border-slate-200/90 shadow-[0_12px_40px_rgba(15,23,42,0.12)] overflow-hidden",
                "w-full max-w-[780px] min-w-[360px]",
                className
            )}
        >
            <div className="flex">
                {/* Left: Presets */}
                <div className="w-[220px] shrink-0 border-r border-slate-100 bg-slate-50/70 p-2 space-y-0.5">
                    {PRESETS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => applyPreset(p.key)}
                            className={cn(
                                "w-full text-left px-3 h-9 rounded-xl text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                                preset === p.key
                                    ? "bg-white text-zinc-900 font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]"
                                    : "text-zinc-600 hover:bg-white/80 hover:text-zinc-900"
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Right: Custom range + Calendars */}
                <div className="flex-1 p-4 min-w-0">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                                Début
                            </label>
                            <input
                                type="text"
                                placeholder="JJ / MM / AAAA"
                                value={startInput}
                                onChange={(e) => setStartInput(e.target.value)}
                                className="w-full h-9 px-3 text-[13px] font-semibold text-zinc-900 bg-white border border-slate-200 rounded-xl placeholder:text-zinc-300 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                                Fin
                            </label>
                            <input
                                type="text"
                                placeholder="JJ / MM / AAAA"
                                value={endInput}
                                onChange={(e) => setEndInput(e.target.value)}
                                className="w-full h-9 px-3 text-[13px] font-semibold text-zinc-900 bg-white border border-slate-200 rounded-xl placeholder:text-zinc-300 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Two calendars */}
                    <div className="flex gap-8">
                        <MonthCalendar
                            year={leftMonth.getFullYear()}
                            month={leftMonth.getMonth()}
                            onPrev={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                            onNext={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                            startDate={startDateParsed}
                            endDate={endDateParsed}
                            onDayClick={handleCalendarClick}
                        />
                        <MonthCalendar
                            year={rightMonth.getFullYear()}
                            month={rightMonth.getMonth()}
                            onPrev={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                            onNext={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() + 2))}
                            startDate={startDateParsed}
                            endDate={endDateParsed}
                            onDayClick={handleCalendarClick}
                        />
                    </div>

                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={handleClear}
                            className="h-9 px-4 text-xs font-bold text-zinc-700 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                        >
                            Effacer
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className="h-9 px-4 text-xs font-black text-white bg-zinc-950 rounded-xl hover:bg-zinc-800 transition-colors shadow-[0_4px_12px_rgba(9,9,11,0.18),inset_0_1px_0_rgba(255,255,255,0.10)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-offset-2"
                        >
                            Appliquer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function MonthCalendar({
    year,
    month,
    onPrev,
    onNext,
    startDate,
    endDate,
    onDayClick,
}: {
    year: number;
    month: number;
    onPrev: () => void;
    onNext: () => void;
    startDate: Date | null;
    endDate: Date | null;
    onDayClick: (y: number, m: number, d: number) => void;
}) {
    const grid = useMemo(() => {
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        const startPad = first.getDay();
        const daysInMonth = last.getDate();
        const cells: { day: number | null; isCurrent: boolean }[] = [];
        for (let i = 0; i < startPad; i++) cells.push({ day: null, isCurrent: false });
        for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, isCurrent: true });
        return cells;
    }, [year, month]);

    const monthLabel = new Date(year, month).toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
    });

    return (
        <div className="flex flex-col min-w-[180px]">
            <div className="flex items-center justify-between mb-3">
                <button
                    type="button"
                    onClick={onPrev}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-slate-100 hover:text-zinc-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[13px] font-extrabold text-zinc-900 capitalize">
                    {monthLabel}
                </span>
                <button
                    type="button"
                    onClick={onNext}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-slate-100 hover:text-zinc-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => (
                    <div
                        key={w}
                        className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 py-1.5"
                    >
                        {w}
                    </div>
                ))}
                {grid.map((cell, i) => {
                    if (cell.day === null) {
                        return <div key={`e-${i}`} className="min-h-[32px]" />;
                    }
                    const d = new Date(year, month, cell.day);
                    const isStart =
                        startDate &&
                        startDate.getFullYear() === year &&
                        startDate.getMonth() === month &&
                        startDate.getDate() === cell.day;
                    const isEnd =
                        endDate &&
                        endDate.getFullYear() === year &&
                        endDate.getMonth() === month &&
                        endDate.getDate() === cell.day;
                    const inRange =
                        startDate &&
                        endDate &&
                        d >= startDate &&
                        d <= endDate &&
                        !isStart &&
                        !isEnd;
                    const isToday = (() => {
                        const t = new Date();
                        return (
                            t.getFullYear() === year &&
                            t.getMonth() === month &&
                            t.getDate() === cell.day
                        );
                    })();

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onDayClick(year, month, cell.day!)}
                            className={cn(
                                "min-w-[32px] min-h-[32px] w-8 h-8 flex items-center justify-center text-[13px] font-semibold rounded-lg transition-colors tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                                !cell.isCurrent && "text-zinc-300",
                                cell.isCurrent && "text-zinc-800 hover:bg-slate-100",
                                isStart && "bg-zinc-950 text-white font-black hover:bg-zinc-800",
                                isEnd && "bg-zinc-950 text-white font-black hover:bg-zinc-800",
                                inRange && "bg-emerald-50 text-emerald-800",
                                isToday && !isStart && !isEnd && !inRange && "ring-1 ring-inset ring-emerald-500"
                            )}
                        >
                            {cell.day}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
