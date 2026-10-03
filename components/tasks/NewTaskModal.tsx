"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";

interface NewTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (task: any) => void;
    defaultProjectId?: string;
    lockProject?: boolean;
    defaultStatus?: string;
    members?: { id: string; name: string }[];
}

const PRIORITY_OPTIONS = [
    { value: "LOW", label: "Basse", color: "bg-slate-100 text-slate-600 border-slate-200" },
    { value: "MEDIUM", label: "Moyenne", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { value: "HIGH", label: "Haute", color: "bg-orange-50 text-orange-700 border-orange-200" },
    { value: "URGENT", label: "Urgent", color: "bg-red-50 text-red-700 border-red-200" },
];

export function NewTaskModal({
    isOpen,
    onClose,
    onSuccess,
    defaultProjectId = "",
    lockProject = false,
    defaultStatus,
    members: propMembers,
}: NewTaskModalProps) {
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [members, setMembers] = useState<{ id: string; name: string }[]>(propMembers || []);
    const [isLoading, setIsLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [labelInput, setLabelInput] = useState("");

    const [form, setForm] = useState({
        title: "",
        description: "",
        projectId: defaultProjectId,
        priority: "MEDIUM",
        dueDate: "",
        startDate: "",
        assigneeId: "",
        estimatedHours: "",
        labels: [] as string[],
    });

    useEffect(() => {
        if (isOpen) {
            setForm((prev) => ({
                ...prev,
                projectId: defaultProjectId || prev.projectId,
                title: "",
                description: "",
                priority: "MEDIUM",
                dueDate: "",
                startDate: "",
                assigneeId: "",
                estimatedHours: "",
                labels: [],
            }));
            setShowAdvanced(false);
            setLabelInput("");

            if (!lockProject) {
                fetch("/api/projects")
                    .then((res) => res.json())
                    .then((json) => {
                        if (json.success) setProjects(json.data);
                    })
                    .catch(console.error);
            }
        }
    }, [isOpen, defaultProjectId, lockProject]);

    // Load members when project changes
    useEffect(() => {
        if (propMembers) {
            setMembers(propMembers);
            return;
        }
        if (form.projectId) {
            fetch(`/api/projects/${form.projectId}`)
                .then((res) => res.json())
                .then((json) => {
                    if (json.success && json.data?.members) {
                        setMembers(
                            json.data.members.map((m: any) => ({
                                id: m.user.id,
                                name: m.user.name,
                            }))
                        );
                    }
                })
                .catch(console.error);
        }
    }, [form.projectId, propMembers]);

    const handleSubmit = async () => {
        if (!form.title.trim() || !form.projectId) return;

        setIsLoading(true);
        try {
            const payload: any = {
                projectId: form.projectId,
                title: form.title.trim(),
                description: form.description.trim() || null,
                priority: form.priority,
                dueDate: form.dueDate || null,
                startDate: form.startDate || null,
                assigneeId: form.assigneeId || null,
                estimatedHours: form.estimatedHours || null,
                labels: form.labels,
            };

            if (defaultStatus) {
                payload.status = defaultStatus;
            }

            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.success) {
                onSuccess(json.data);
                onClose();
            }
        } catch (error) {
            console.error("Failed to create task:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const addLabel = () => {
        const val = labelInput.trim();
        if (val && !form.labels.includes(val)) {
            setForm({ ...form, labels: [...form.labels, val] });
        }
        setLabelInput("");
    };

    const removeLabel = (label: string) => {
        setForm({ ...form, labels: form.labels.filter((l) => l !== label) });
    };

    const handleAiEnhance = async () => {
        if (!form.title.trim()) return;
        setAiLoading(true);
        try {
            const project = projects.find((p) => p.id === form.projectId);
            const res = await fetch("/api/ai/mistral/task-enhance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description,
                    projectContext: project?.name || "",
                }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                setForm((prev) => ({
                    ...prev,
                    title: json.data.enhancedTitle || prev.title,
                    description: json.data.enhancedDescription || prev.description,
                    priority: json.data.suggestedPriority || prev.priority,
                    labels: json.data.suggestedLabels || prev.labels,
                    estimatedHours: json.data.estimatedHours?.toString() || prev.estimatedHours,
                }));
                setShowAdvanced(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nouvelle tâche" size="lg">
            <div className="space-y-4">
                {/* Title + AI Enhance */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Titre *</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                            placeholder="Titre de la tâche"
                            autoFocus
                        />
                        <button
                            onClick={handleAiEnhance}
                            disabled={!form.title.trim() || aiLoading}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                            title="Améliorer avec IA"
                        >
                            {aiLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <AiMark className="w-4 h-4" />
                            )}
                            IA
                        </button>
                    </div>
                </div>

                {/* Project selector */}
                {!lockProject && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Projet *</label>
                        <select
                            value={form.projectId}
                            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                        >
                            <option value="">Sélectionner un projet</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Assignee */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assigné à</label>
                    <select
                        value={form.assigneeId}
                        onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                    >
                        <option value="">Non assigné</option>
                        {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>

                {/* Priority */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Priorité</label>
                    <div className="flex gap-2">
                        {PRIORITY_OPTIONS.map((p) => (
                            <button
                                key={p.value}
                                onClick={() => setForm({ ...form, priority: p.value })}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                                    form.priority === p.value ? p.color : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Due date */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Échéance</label>
                    <input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 resize-none"
                        placeholder="Description détaillée..."
                    />
                </div>

                {/* Toggle advanced */}
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                    {showAdvanced ? "Masquer les options avancées" : "Options avancées"}
                </button>

                {/* Advanced fields */}
                {showAdvanced && (
                    <div className="space-y-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        {/* Start date */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date de début</label>
                            <input
                                type="date"
                                value={form.startDate}
                                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                            />
                        </div>

                        {/* Estimated hours */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Estimation (heures)</label>
                            <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={form.estimatedHours}
                                onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                                placeholder="Ex: 4"
                            />
                        </div>

                        {/* Labels */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Labels</label>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {form.labels.map((l) => (
                                    <span key={l} className="flex items-center gap-1 text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md">
                                        {l}
                                        <button onClick={() => removeLabel(l)}>
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={labelInput}
                                    onChange={(e) => setLabelInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
                                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                                    placeholder="Ajouter un label..."
                                />
                                <button
                                    onClick={addLabel}
                                    className="px-2 py-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ModalFooter>
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                    Annuler
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!form.title.trim() || !form.projectId || isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Créer
                </button>
            </ModalFooter>
        </Modal>
    );
}
