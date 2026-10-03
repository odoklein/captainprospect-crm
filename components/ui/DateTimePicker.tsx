"use client";

import * as React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/Calendar";

export interface DateTimePickerProps {
    /** Value in datetime-local format: YYYY-MM-DDTHH:mm */
    value?: string;
    onChange: (value: string) => void;
    label?: React.ReactNode;
    placeholder?: string;
    disabled?: boolean;
    /** When true, any past date can be chosen (e.g. historique / import). Ignored if `min` is set. */
    allowPastDates?: boolean;
    /** Min datetime (no dates/times before this). Defaults to now unless `allowPastDates` is true. */
    min?: string;
    className?: string;
    /** Optional extra class for the trigger button (e.g. border-amber-200 for rappel) */
    triggerClassName?: string;
}

const TIME_OPTIONS = (() => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            options.push(
                `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
            );
        }
    }
    return options;
})();

export function DateTimePicker({
    value,
    onChange,
    label,
    placeholder = "Choisir date et heure…",
    disabled = false,
    allowPastDates = false,
    min,
    className,
    triggerClassName,
}: DateTimePickerProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const minDate: Date | undefined =
        min != null && min !== ""
            ? new Date(min)
            : allowPastDates
              ? undefined
              : new Date();
    const selectedDate = value ? new Date(value) : null;
    const dateOnly = selectedDate
        ? format(selectedDate, "yyyy-MM-dd")
        : "";
    const timeOnly = selectedDate
        ? format(selectedDate, "HH:mm")
        : "09:00";

    const updatePosition = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const dropdownWidth = 260;
            const dropdownMaxHeight = 340;
            const padding = 8;
            let top = rect.bottom + padding;
            let left = rect.left;
            const viewportW = typeof window !== "undefined" ? window.innerWidth : 0;
            const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
            if (left + dropdownWidth > viewportW - padding) left = viewportW - dropdownWidth - padding;
            if (left < padding) left = padding;
            if (top + dropdownMaxHeight > viewportH - padding) top = Math.max(padding, rect.top - dropdownMaxHeight - padding);
            if (top < padding) top = padding;
            setPosition({ top, left });
        }
    }, []);

    useEffect(() => {
        if (open) updatePosition();
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) return;
        const handleScrollOrResize = () => updatePosition();
        window.addEventListener("scroll", handleScrollOrResize, true);
        window.addEventListener("resize", handleScrollOrResize);
        return () => {
            window.removeEventListener("scroll", handleScrollOrResize, true);
            window.removeEventListener("resize", handleScrollOrResize);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const inTrigger = containerRef.current?.contains(target);
            const inDropdown = dropdownRef.current?.contains(target);
            if (!inTrigger && !inDropdown) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside, true);
        return () => document.removeEventListener("mousedown", handleClickOutside, true);
    }, []);

    const handleDateSelect = useCallback((date: Date | undefined) => {
        if (!date) return;
        const dateStr = format(date, "yyyy-MM-dd");
        const time = timeOnly;
        onChange(`${dateStr}T${time}`);
    }, [timeOnly, onChange]);

    const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const time = e.target.value;
        const dateStr = dateOnly || format(new Date(), "yyyy-MM-dd");
        onChange(`${dateStr}T${time}`);
    };

    const displayLabel = selectedDate
        ? format(selectedDate, "EEEE d MMMM yyyy à HH:mm", { locale: fr })
        : placeholder;

    const isBeforeMin = (date: Date) => {
        if (!minDate) return false;
        const d = startOfDay(date);
        const m = startOfDay(minDate);
        return d < m;
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            {label && (
                <label className="block text-sm font-semibold text-ink mb-2">
                    {label}
                </label>
            )}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    if (disabled) return;
                    if (!open && triggerRef.current) {
                        const rect = triggerRef.current.getBoundingClientRect();
                        setPosition({ top: rect.bottom + 8, left: rect.left });
                    }
                    setOpen(!open);
                }}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border rounded-lg bg-surface text-left transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400",
                    "border-line hover:border-line-strong",
                    open && "ring-2 ring-primary-400/20 border-primary-400",
                    disabled && "opacity-50 cursor-not-allowed bg-surface-2",
                    triggerClassName
                )}
            >
                <span
                    className={cn(
                        selectedDate ? "text-ink" : "text-ink-4"
                    )}
                >
                    {displayLabel}
                </span>
                <CalendarIcon className="w-4 h-4 text-ink-4 shrink-0" />
            </button>

            {open &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed w-[260px] max-h-[min(340px,80vh)] overflow-y-auto p-2.5 bg-surface border border-line rounded-xl shadow-xl ring-1 ring-black/5 animate-scale-in origin-top-left"
                        style={{
                            top: position.top,
                            left: position.left,
                            zIndex: 99999,
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                            Date et heure
                        </div>
                        <Calendar
                            mode="single"
                            selected={selectedDate ?? undefined}
                            onSelect={handleDateSelect}
                            disabled={(date) => isBeforeMin(date)}
                            defaultMonth={selectedDate ?? minDate ?? new Date()}
                            {...(minDate ? { fromDate: minDate } : {})}
                            className="rdp-compact p-0"
                            classNames={{
                                months: "flex flex-col gap-0",
                                month: "flex flex-col gap-0",
                                month_caption: "flex justify-center items-center h-7",
                                caption_label: "text-xs font-medium text-ink",
                                nav: "flex items-center gap-0.5",
                                button_previous: "inline-flex items-center justify-center rounded border border-line bg-surface h-7 w-7 text-ink-2 hover:bg-surface-2 disabled:opacity-50 text-xs",
                                button_next: "inline-flex items-center justify-center rounded border border-line bg-surface h-7 w-7 text-ink-2 hover:bg-surface-2 disabled:opacity-50 text-xs",
                                weekdays: "flex",
                                weekday: "text-ink-3 rounded w-7 font-normal text-[10px]",
                                week: "flex w-full mt-0.5",
                                day: "relative p-0 text-center text-xs",
                                day_button: cn(
                                    "inline-flex items-center justify-center rounded h-7 w-7 font-normal text-xs",
                                    "hover:bg-surface-3 focus:bg-surface-3 focus:outline-none",
                                    "aria-selected:bg-primary-500 aria-selected:text-white aria-selected:opacity-100",
                                    "text-ink"
                                ),
                                selected: "bg-primary-500 text-white rounded hover:bg-primary-600 focus:bg-primary-500",
                                today: "bg-primary-50 text-primary-600 font-medium",
                                outside: "text-ink-4 opacity-75",
                                disabled: "text-ink-4 line-through",
                                hidden: "invisible",
                            }}
                        />
                        <div className="mt-2 pt-2 border-t border-line-subtle">
                            <label className="block text-[10px] font-medium text-ink-2 mb-1">
                                Heure
                            </label>
                            <select
                                value={timeOnly}
                                onChange={handleTimeChange}
                                className="w-full px-2 py-1.5 text-xs border border-line rounded-lg bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400"
                            >
                                {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="mt-1.5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const today = new Date();
                                    const t = format(today, "HH:mm");
                                    const h = parseInt(t.slice(0, 2), 10);
                                    const m = parseInt(t.slice(3), 10);
                                    const rounded = `${String(h).padStart(2, "0")}:${m < 30 ? "00" : "30"}`;
                                    onChange(
                                        `${format(today, "yyyy-MM-dd")}T${rounded}`
                                    );
                                    setOpen(false);
                                }}
                                className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
                            >
                                Maintenant
                            </button>
                            {value && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChange("");
                                        setOpen(false);
                                    }}
                                    className="text-[10px] text-ink-3 hover:text-ink-2"
                                >
                                    Effacer
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}

export default DateTimePicker;
