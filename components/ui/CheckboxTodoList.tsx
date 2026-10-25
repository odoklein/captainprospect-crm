"use client";

/**
 * Checklist card — icon + title, "x/y terminées" pill, progress bar, rows
 * that strike through when ticked, "Effacer les terminées".
 *
 * Adapted from the shadcn "checkbox todo-list" block, but data-driven (the
 * caller owns the items and persists the toggles) and dependency-free: the
 * strike-through and row entrance are CSS transitions, not framer-motion, and
 * it uses none of the shadcn primitives that would collide with this folder's
 * own Button / Checkbox / Badge.
 */

import { Check, CheckCircle2, ListTodo, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TodoListItem {
    id: string;
    text: string;
    completed: boolean;
    /** Second line under the text (client, project…). */
    meta?: string;
    /** Small pill on the right while not completed. */
    tag?: { label: string; tone: "rose" | "amber" | "violet" };
}

export interface CheckboxTodoListProps {
    items: TodoListItem[];
    onToggle: (id: string, completed: boolean) => void;
    /** Shows a trash button on hover when provided. */
    onDelete?: (id: string) => void;
    onClearCompleted?: () => void;
    title?: string;
    subtitle?: string;
    icon?: LucideIcon;
    emptyLabel?: string;
    /** Rendered between the progress bar and the list (hints, alerts). */
    beforeList?: React.ReactNode;
    /** Rendered under the list, inside the scroll area (extra sections). */
    afterList?: React.ReactNode;
    /** Right side of the footer. */
    footerAction?: React.ReactNode;
    className?: string;
}

const TAG_TONES = {
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
} as const;

export function CheckboxTodoList({
    items,
    onToggle,
    onDelete,
    onClearCompleted,
    title = "Tâches",
    subtitle,
    icon: Icon = ListTodo,
    emptyLabel = "Aucune tâche",
    beforeList,
    afterList,
    footerAction,
    className,
}: CheckboxTodoListProps) {
    const completedCount = items.filter((t) => t.completed).length;
    const totalCount = items.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <div className={cn("flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white", className)}>
            {/* Header and progress */}
            <div className="flex flex-col gap-4 px-5 pt-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <Icon className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
                            {subtitle && <p className="truncate text-xs capitalize text-slate-500">{subtitle}</p>}
                        </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium tabular-nums text-slate-700">
                        {completedCount}/{totalCount} terminées
                    </span>
                </div>

                <div>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>Progression</span>
                        <span className="tabular-nums">{progress} %</span>
                    </div>
                    <div
                        role="progressbar"
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                    >
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-[width] duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {beforeList}
            </div>

            {/* Items */}
            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
                {items.length > 0 ? (
                    <ul className="space-y-1.5">
                        {items.map((todo) => (
                            <li
                                key={todo.id}
                                className={cn(
                                    "group/todo flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
                                    todo.completed
                                        ? "border-slate-100 bg-slate-50/60"
                                        : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                                )}
                            >
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={todo.completed}
                                        onChange={(e) => onToggle(todo.id, e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300 peer-focus-visible:ring-offset-1",
                                            todo.completed
                                                ? "border-indigo-600 bg-indigo-600 text-white"
                                                : "border-indigo-300 bg-white group-hover/todo:border-indigo-400"
                                        )}
                                    >
                                        <Check
                                            strokeWidth={3}
                                            className={cn(
                                                "h-3.5 w-3.5 transition-transform duration-200",
                                                todo.completed ? "scale-100" : "scale-0"
                                            )}
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 select-none">
                                        <span
                                            className={cn(
                                                "relative block truncate pr-2 text-sm font-medium transition-colors duration-300",
                                                todo.completed ? "text-slate-400" : "text-slate-900"
                                            )}
                                        >
                                            {todo.text}
                                            {/* Animated strike-through */}
                                            <span
                                                aria-hidden
                                                className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-slate-400 transition-[width] duration-300 ease-in-out"
                                                style={{ width: todo.completed ? "100%" : "0%" }}
                                            />
                                        </span>
                                        {todo.meta && (
                                            <span className="mt-0.5 block truncate text-xs text-slate-500">{todo.meta}</span>
                                        )}
                                    </span>
                                </label>

                                {!todo.completed && todo.tag && (
                                    <span
                                        className={cn(
                                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                            TAG_TONES[todo.tag.tone]
                                        )}
                                    >
                                        {todo.tag.label}
                                    </span>
                                )}

                                {onDelete && (
                                    <button
                                        type="button"
                                        onClick={() => onDelete(todo.id)}
                                        aria-label={`Supprimer « ${todo.text} »`}
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover/todo:opacity-100"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 stroke-[1.5] text-slate-300" aria-hidden />
                        <p className="text-xs font-medium text-slate-500">{emptyLabel}</p>
                    </div>
                )}

                {afterList}
            </div>

            {/* Footer */}
            {(onClearCompleted || footerAction) && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                    {onClearCompleted ? (
                        <button
                            type="button"
                            onClick={onClearCompleted}
                            disabled={completedCount === 0}
                            className="font-medium transition-colors hover:text-slate-900 hover:underline disabled:pointer-events-none disabled:opacity-40"
                        >
                            Effacer les terminées
                        </button>
                    ) : (
                        <span />
                    )}
                    {footerAction}
                </div>
            )}
        </div>
    );
}

export default CheckboxTodoList;
