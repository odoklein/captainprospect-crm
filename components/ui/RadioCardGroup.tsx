"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import Badge from "./Badge";

export interface RadioCardOption<T extends string = string> {
    value: T;
    title: string;
    description: string;
    icon?: LucideIcon;
    badge?: string;
    disabled?: boolean;
}

interface RadioCardGroupProps<T extends string = string> {
    options: RadioCardOption<T>[];
    value: T | null;
    onChange: (value: T) => void;
    columns?: 1 | 2 | 3 | 4;
    name: string;
    className?: string;
    /** Optional extra content rendered inside the selected card only (e.g. a nested sub-control). */
    renderExtra?: (option: RadioCardOption<T>) => ReactNode;
}

/**
 * A generic "click to pick one" card group — keyboard-navigable radiogroup.
 * Replaces the hand-coded <button className="border-2"> cards duplicated across
 * the import wizard, its dialog variant, and elsewhere.
 */
export function RadioCardGroup<T extends string = string>({
    options,
    value,
    onChange,
    columns = 2,
    name,
    className,
    renderExtra,
}: RadioCardGroupProps<T>) {
    const gridCols =
        columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

    const focusIndex = (currentIndex: number, delta: number) => {
        const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
        if (enabled.length === 0) return;
        const pos = enabled.findIndex(({ i }) => i === currentIndex);
        const nextPos = (pos + delta + enabled.length) % enabled.length;
        const next = enabled[nextPos];
        onChange(next.o.value);
        const el = document.getElementById(`${name}-${next.i}`);
        el?.focus();
    };

    return (
        <div role="radiogroup" aria-label={name} className={cn("grid gap-3", gridCols, className)}>
            {options.map((option, index) => {
                const selected = value === option.value;
                const Icon = option.icon;
                return (
                    <div
                        key={option.value}
                        id={`${name}-${index}`}
                        role="radio"
                        aria-checked={selected}
                        aria-disabled={option.disabled}
                        tabIndex={option.disabled ? -1 : selected || (value === null && index === 0) ? 0 : -1}
                        onClick={() => !option.disabled && onChange(option.value)}
                        onKeyDown={(e) => {
                            if (option.disabled) return;
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onChange(option.value);
                            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                e.preventDefault();
                                focusIndex(index, 1);
                            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                e.preventDefault();
                                focusIndex(index, -1);
                            }
                        }}
                        className={cn(
                            "relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                            option.disabled
                                ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50"
                                : "cursor-pointer",
                            !option.disabled && selected
                                ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                                : !option.disabled
                                ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                : ""
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {Icon && (
                                <div
                                    className={cn(
                                        "w-9 h-9 shrink-0 rounded-lg flex items-center justify-center",
                                        selected ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"
                                    )}
                                >
                                    <Icon className="w-5 h-5" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn("font-semibold text-sm", selected ? "text-indigo-900" : "text-slate-800")}>
                                        {option.title}
                                    </span>
                                    {option.badge && (
                                        <Badge variant={selected ? "primary" : "outline"} className="text-[10px] py-0.5">
                                            {option.badge}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{option.description}</p>
                            </div>
                            <div
                                className={cn(
                                    "w-4 h-4 shrink-0 rounded-full border-2 mt-0.5 flex items-center justify-center",
                                    selected ? "border-indigo-500" : "border-slate-300"
                                )}
                            >
                                {selected && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                            </div>
                        </div>
                        {selected && renderExtra && (
                            <div className="mt-3 pt-3 border-t border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                {renderExtra(option)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default RadioCardGroup;
