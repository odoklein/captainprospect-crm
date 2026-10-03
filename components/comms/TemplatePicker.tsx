"use client";

// ============================================
// TemplatePicker - Quick insert message templates
// ============================================

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    FileText,
    Plus,
    Trash2,
    Loader2,
    ChevronDown,
    X,
    Star,
    Globe,
} from "lucide-react";

interface MessageTemplate {
    id: string;
    name: string;
    category: string | null;
    content: string;
    variables: string[];
    isShared: boolean;
    usageCount: number;
}

interface TemplatePickerProps {
    onSelect: (content: string, templateId: string) => void;
    className?: string;
}

const CATEGORIES = [
    { value: "", label: "Tous" },
    { value: "greeting", label: "Salutation" },
    { value: "follow_up", label: "Suivi" },
    { value: "closing", label: "Clôture" },
    { value: "custom", label: "Personnalisé" },
];

export function TemplatePicker({ onSelect, className }: TemplatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState("");
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newTemplate, setNewTemplate] = useState({ name: "", content: "", category: "" });
    const [isCreating, setIsCreating] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && templates.length === 0) {
            fetchTemplates();
        }
    }, [isOpen]);

    const fetchTemplates = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/comms/templates");
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
            }
        } catch (error) {
            console.error("Failed to fetch templates:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (template: MessageTemplate) => {
        onSelect(template.content, template.id);
        setIsOpen(false);

        // Increment usage in background
        fetch("/api/comms/templates", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateId: template.id }),
        }).catch(() => { });
    };

    const handleCreate = async () => {
        if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;

        setIsCreating(true);
        try {
            const res = await fetch("/api/comms/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newTemplate.name,
                    content: newTemplate.content,
                    category: newTemplate.category || "custom",
                }),
            });

            if (res.ok) {
                const created = await res.json();
                setTemplates((prev) => [created, ...prev]);
                setNewTemplate({ name: "", content: "", category: "" });
                setShowCreateForm(false);
            }
        } catch (error) {
            console.error("Failed to create template:", error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (templateId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`/api/comms/templates?id=${templateId}`, { method: "DELETE" });
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        } catch (error) {
            console.error("Failed to delete template:", error);
        }
    };

    const filteredTemplates = selectedCategory
        ? templates.filter((t) => t.category === selectedCategory)
        : templates;

    return (
        <div className={cn("relative", className)} ref={pickerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "p-2 rounded-lg transition-colors",
                    isOpen
                        ? "bg-primary-100 text-primary-600"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                )}
                title="Modèles de messages"
            >
                <FileText className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">Modèles</span>
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" />
                            Nouveau
                        </button>
                    </div>

                    {/* Create form */}
                    {showCreateForm && (
                        <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2">
                            <input
                                type="text"
                                value={newTemplate.name}
                                onChange={(e) =>
                                    setNewTemplate((prev) => ({ ...prev, name: e.target.value }))
                                }
                                placeholder="Nom du modèle"
                                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                            />
                            <select
                                value={newTemplate.category}
                                onChange={(e) =>
                                    setNewTemplate((prev) => ({ ...prev, category: e.target.value }))
                                }
                                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
                            >
                                <option value="">Catégorie</option>
                                {CATEGORIES.slice(1).map((cat) => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                            <textarea
                                value={newTemplate.content}
                                onChange={(e) =>
                                    setNewTemplate((prev) => ({ ...prev, content: e.target.value }))
                                }
                                placeholder="Contenu du message..."
                                rows={3}
                                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowCreateForm(false)}
                                    className="flex-1 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={
                                        isCreating ||
                                        !newTemplate.name.trim() ||
                                        !newTemplate.content.trim()
                                    }
                                    className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
                                >
                                    {isCreating ? (
                                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                    ) : (
                                        "Créer"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Category filter */}
                    <div className="px-3 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                onClick={() => setSelectedCategory(cat.value)}
                                className={cn(
                                    "px-2 py-1 text-xs rounded-full whitespace-nowrap transition-colors",
                                    selectedCategory === cat.value
                                        ? "bg-primary-100 text-primary-700"
                                        : "text-slate-500 hover:bg-slate-100"
                                )}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Templates list */}
                    <div className="max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className="p-4 text-center">
                                <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-400">
                                Aucun modèle
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredTemplates.map((template) => (
                                    <button
                                        key={template.id}
                                        onClick={() => handleSelect(template)}
                                        className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors group"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-medium text-slate-700">
                                                    {template.name}
                                                </span>
                                                {template.isShared && (
                                                    <Globe className="w-3 h-3 text-slate-400" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                                {template.usageCount > 0 && (
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                                        <Star className="w-3 h-3" />
                                                        {template.usageCount}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => handleDelete(template.id, e)}
                                                    className="p-1 text-slate-400 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 line-clamp-2">
                                            {template.content}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default TemplatePicker;
