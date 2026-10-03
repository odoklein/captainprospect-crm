"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";

interface Task {
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
    position: number;
}

interface KanbanColumn {
    id: string;
    label: string;
    color: string;
    dotColor: string;
}

interface KanbanBoardProps {
    tasks: Task[];
    onStatusChange: (taskId: string, newStatus: string, newPosition: number) => void;
    onReorder: (updates: { id: string; position: number; status?: string }[]) => void;
    onTaskClick: (taskId: string) => void;
    onAddTask?: (status: string) => void;
    columns?: KanbanColumn[];
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
    { id: "TODO", label: "À faire", color: "border-t-slate-400", dotColor: "bg-slate-400" },
    { id: "IN_PROGRESS", label: "En cours", color: "border-t-blue-500", dotColor: "bg-blue-500" },
    { id: "IN_REVIEW", label: "En revue", color: "border-t-amber-500", dotColor: "bg-amber-500" },
    { id: "DONE", label: "Terminé", color: "border-t-emerald-500", dotColor: "bg-emerald-500" },
];

export function KanbanBoard({
    tasks,
    onStatusChange,
    onReorder,
    onTaskClick,
    onAddTask,
    columns = DEFAULT_COLUMNS,
}: KanbanBoardProps) {
    const [draggedTask, setDraggedTask] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
    const dragCounter = useRef<Record<string, number>>({});

    const getColumnTasks = useCallback(
        (columnId: string) =>
            tasks
                .filter((t) => t.status === columnId)
                .sort((a, b) => a.position - b.position),
        [tasks]
    );

    const toggleCollapse = (columnId: string) => {
        setCollapsedColumns((prev) => {
            const next = new Set(prev);
            if (next.has(columnId)) next.delete(columnId);
            else next.add(columnId);
            return next;
        });
    };

    // Drag handlers
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        setDraggedTask(taskId);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", taskId);
        // Add a slight delay for visual feedback
        requestAnimationFrame(() => {
            const el = document.querySelector(`[data-task-id="${taskId}"]`);
            if (el) el.classList.add("opacity-40");
        });
    };

    const handleDragEnd = () => {
        if (draggedTask) {
            const el = document.querySelector(`[data-task-id="${draggedTask}"]`);
            if (el) el.classList.remove("opacity-40");
        }
        setDraggedTask(null);
        setDragOverColumn(null);
        dragCounter.current = {};
    };

    const handleDragEnter = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) + 1;
        setDragOverColumn(columnId);
    };

    const handleDragLeave = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) - 1;
        if (dragCounter.current[columnId] <= 0) {
            dragCounter.current[columnId] = 0;
            if (dragOverColumn === columnId) {
                setDragOverColumn(null);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("text/plain");
        if (!taskId) return;

        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const columnTasks = getColumnTasks(columnId);
        const newPosition = columnTasks.length;

        if (task.status !== columnId) {
            // Moved to new column - update status and position
            onStatusChange(taskId, columnId, newPosition);

            // Reorder all tasks in the new column
            const updates = columnTasks.map((t, i) => ({
                id: t.id,
                position: i,
            }));
            updates.push({ id: taskId, position: newPosition, status: columnId });
            onReorder(updates);
        }

        setDragOverColumn(null);
        setDraggedTask(null);
        dragCounter.current = {};
    };

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
            {columns.map((column) => {
                const columnTasks = getColumnTasks(column.id);
                const isCollapsed = collapsedColumns.has(column.id);
                const isDragTarget = dragOverColumn === column.id && draggedTask;

                return (
                    <div
                        key={column.id}
                        className={cn(
                            "flex-shrink-0 w-72 flex flex-col rounded-xl border-t-4 bg-slate-50/70 border border-slate-200",
                            column.color,
                            isDragTarget && "bg-primary-50/50 border-primary-200"
                        )}
                        onDragEnter={(e) => handleDragEnter(e, column.id)}
                        onDragLeave={(e) => handleDragLeave(e, column.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, column.id)}
                    >
                        {/* Column header */}
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                            <button
                                onClick={() => toggleCollapse(column.id)}
                                className="flex items-center gap-2"
                            >
                                {isCollapsed ? (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span className={cn("w-2 h-2 rounded-full", column.dotColor)} />
                                <span className="text-sm font-semibold text-slate-700">
                                    {column.label}
                                </span>
                                <span className="text-xs text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">
                                    {columnTasks.length}
                                </span>
                            </button>
                            {onAddTask && (
                                <button
                                    onClick={() => onAddTask(column.id)}
                                    className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Column body */}
                        {!isCollapsed && (
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
                                {columnTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        data-task-id={task.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <TaskCard
                                            task={task}
                                            onClick={() => onTaskClick(task.id)}
                                            isDragging={draggedTask === task.id}
                                        />
                                    </div>
                                ))}

                                {columnTasks.length === 0 && (
                                    <div className="flex items-center justify-center h-24 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                                        {isDragTarget ? "Déposer ici" : "Aucune tâche"}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
