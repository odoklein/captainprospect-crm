"use client";

import { cn } from "@/lib/utils";
import { Calendar, MessageSquare, GitBranch, Clock } from "lucide-react";

interface TaskCardProps {
    task: {
        id: string;
        title: string;
        status: string;
        priority: string;
        dueDate: string | null;
        assignee: { id: string; name: string } | null;
        labels: string[];
        subtasks?: { id: string; status: string }[];
        _count?: { comments: number; subtasks: number };
        estimatedHours?: number | null;
    };
    onClick?: () => void;
    isDragging?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
    URGENT: "bg-red-500",
    HIGH: "bg-orange-500",
    MEDIUM: "bg-blue-500",
    LOW: "bg-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
    URGENT: "Urgent",
    HIGH: "Haute",
    MEDIUM: "Moyenne",
    LOW: "Basse",
};

const LABEL_COLORS = [
    "bg-accent-100 text-accent-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-primary-100 text-primary-700",
];

export function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
    const isOverdue =
        task.dueDate &&
        new Date(task.dueDate) < new Date() &&
        task.status !== "DONE";

    const subtasksDone = task.subtasks?.filter((s) => s.status === "DONE").length || 0;
    const subtasksTotal = task.subtasks?.length || task._count?.subtasks || 0;
    const commentCount = task._count?.comments || 0;

    return (
        <div
            onClick={onClick}
            className={cn(
                "group bg-white border border-slate-200 rounded-lg p-3 cursor-pointer transition-all duration-150",
                "hover:border-primary-300 hover:shadow-md",
                isDragging && "shadow-lg border-primary-400 rotate-2 opacity-90"
            )}
        >
            {/* Priority bar */}
            <div className={cn("h-1 rounded-full mb-2.5 w-12", PRIORITY_COLORS[task.priority])} />

            {/* Labels */}
            {task.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {task.labels.slice(0, 3).map((label, i) => (
                        <span
                            key={label}
                            className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                LABEL_COLORS[i % LABEL_COLORS.length]
                            )}
                        >
                            {label}
                        </span>
                    ))}
                </div>
            )}

            {/* Title */}
            <p className="text-sm font-medium text-slate-800 line-clamp-2 mb-2">{task.title}</p>

            {/* Meta row */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    {/* Due date */}
                    {task.dueDate && (
                        <span
                            className={cn(
                                "flex items-center gap-1",
                                isOverdue && "text-red-600 font-medium"
                            )}
                        >
                            <Calendar className="w-3 h-3" />
                            {new Date(task.dueDate).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                            })}
                        </span>
                    )}

                    {/* Estimated hours */}
                    {task.estimatedHours && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {task.estimatedHours}h
                        </span>
                    )}

                    {/* Subtasks */}
                    {subtasksTotal > 0 && (
                        <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {subtasksDone}/{subtasksTotal}
                        </span>
                    )}

                    {/* Comments */}
                    {commentCount > 0 && (
                        <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {commentCount}
                        </span>
                    )}
                </div>

                {/* Assignee avatar */}
                {task.assignee && (
                    <div
                        className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0"
                        title={task.assignee.name}
                    >
                        {task.assignee.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                    </div>
                )}
            </div>

            {/* Subtask progress bar */}
            {subtasksTotal > 0 && (
                <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
                    />
                </div>
            )}
        </div>
    );
}
