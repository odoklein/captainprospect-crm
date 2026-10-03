"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    FileText,
    Plus,
    Search,
    Edit,
    Trash2,
    Copy,
    X,
    Save,
    Loader2,
    Share2,
    Lock,
    Eye,
    Code,
    Type,
    LayoutTemplate,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { SUPPORTED_TEMPLATE_VARIABLES } from "@/lib/email/constants";

// Sample values for preview (no API call)
const PREVIEW_SAMPLE: Record<string, string> = {
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    title: "Directeur commercial",
    email: "jean.dupont@exemple.fr",
    phone: "+33 6 12 34 56 78",
    linkedin: "https://linkedin.com/in/jeandupont",
    company: "Acme SAS",
    companyName: "Acme SAS",
    industry: "Technologie",
    website: "https://acme.fr",
    country: "France",
    companySize: "50-200",
    currentDate: new Date().toLocaleDateString("fr-FR"),
    currentDay: new Date().toLocaleDateString("fr-FR", { weekday: "long" }),
    currentMonth: new Date().toLocaleDateString("fr-FR", { month: "long" }),
    currentYear: String(new Date().getFullYear()),
};

function substitutePreview(html: string, subject: string): { subject: string; body: string } {
    let outSub = subject;
    let outBody = html;
    SUPPORTED_TEMPLATE_VARIABLES.forEach(({ name }) => {
        const val = PREVIEW_SAMPLE[name] ?? "";
        const regex = new RegExp(`\\{\\{${name}\\}\\}`, "g");
        outSub = outSub.replace(regex, val);
        outBody = outBody.replace(regex, val);
    });
    return { subject: outSub, body: outBody };
}

// ============================================
// TYPES
// ============================================

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string | null;
    category: string;
    isShared: boolean;
    variables: string[];
    useCount: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: {
        id: string;
        name: string;
    };
}

// ============================================
// TEMPLATE EDITOR (slide-over: Code + Preview + variable palette)
// ============================================

interface TemplateEditorProps {
    template?: EmailTemplate | null;
    onClose: () => void;
    onSave: () => void;
}

function TemplateEditor({ template, onClose, onSave }: TemplateEditorProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
    const [bodyMode, setBodyMode] = useState<"text" | "html">("text");
    const [form, setForm] = useState({
        name: template?.name || "",
        subject: template?.subject || "",
        bodyHtml: template?.bodyHtml || "",
        category: template?.category || "general",
        isShared: template?.isShared || false,
    });

    useEffect(() => {
        const html = template?.bodyHtml || "";
        if (html && /<\s*(html|head|body|style|div|table)[\s>]/i.test(html)) {
            setBodyMode("html");
        }
    }, [template?.id]);

    const categories = [
        { value: "general", label: "Général" },
        { value: "intro", label: "Introduction" },
        { value: "follow-up", label: "Relance" },
        { value: "sales", label: "Commercial" },
        { value: "meeting", label: "Rendez-vous" },
        { value: "thank-you", label: "Remerciement" },
    ];

    const insertVariable = (varName: string) => {
        const token = `{{${varName}}}`;
        setForm((prev) => ({ ...prev, bodyHtml: prev.bodyHtml + token }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const url = template ? `/api/email/templates/${template.id}` : "/api/email/templates";
            const res = await fetch(url, {
                method: template ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const json = await res.json();
            if (json.success) {
                onSave();
                onClose();
            } else {
                setError(json.error || "Erreur lors de la sauvegarde");
            }
        } catch (err) {
            setError("Erreur lors de la sauvegarde");
        } finally {
            setIsSaving(false);
        }
    };

    const preview = substitutePreview(form.bodyHtml, form.subject);

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-4xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-primary-600">
                        <h2 className="text-lg font-semibold text-white">
                            {template ? "Modifier le template" : "Nouveau template"}
                        </h2>
                        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom du template *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Ex: Relance prospect froid"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie</label>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.isShared}
                                        onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-slate-700">Partager avec l&apos;équipe</span>
                                </label>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Sujet *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.subject}
                                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Re: {{firstName}}, suite à notre échange"
                                />
                            </div>
                        </div>

                        {/* Variable palette */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-medium text-slate-600 mb-2">Variables — cliquer pour insérer</p>
                            <div className="flex flex-wrap gap-1.5">
                                {SUPPORTED_TEMPLATE_VARIABLES.map((v) => (
                                    <button
                                        key={v.name}
                                        type="button"
                                        onClick={() => insertVariable(v.name)}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors"
                                        title={v.description}
                                    >
                                        {`{{${v.name}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Code / Preview tabs */}
                        <div>
                            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("code")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                                        activeTab === "code" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                                    )}
                                >
                                    <Code className="w-4 h-4" />
                                    Code
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("preview")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                                        activeTab === "preview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                                    )}
                                >
                                    <LayoutTemplate className="w-4 h-4" />
                                    Aperçu
                                </button>
                            </div>

                            {activeTab === "code" && (
                                <div>
                                    <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 mb-2">
                                        <button
                                            type="button"
                                            onClick={() => setBodyMode("text")}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                                bodyMode === "text" ? "bg-white text-primary-600 shadow-sm" : "text-slate-600"
                                            )}
                                        >
                                            <Type className="w-3.5 h-3.5" /> Texte
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBodyMode("html")}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                                bodyMode === "html" ? "bg-white text-primary-600 shadow-sm" : "text-slate-600"
                                            )}
                                        >
                                            <Code className="w-3.5 h-3.5" /> HTML / CSS
                                        </button>
                                    </div>
                                    <textarea
                                        required
                                        value={form.bodyHtml}
                                        onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
                                        rows={bodyMode === "html" ? 20 : 14}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y min-h-[280px]"
                                        placeholder={bodyMode === "text"
                                            ? "Bonjour {{firstName}},\n\nJe me permets de vous contacter..."
                                            : '<style>.title{font-family:Arial;}</style>\n<p class="title">Bonjour {{firstName}},</p>'}
                                    />
                                </div>
                            )}

                            {activeTab === "preview" && (
                                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[320px]">
                                    <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs text-slate-500 font-medium">
                                        Sujet : {preview.subject || "(vide)"}
                                    </div>
                                    <div
                                        className="p-4 prose prose-slate max-w-none prose-p:my-2 text-sm"
                                        dangerouslySetInnerHTML={{
                                            __html: preview.body
                                                ? preview.body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                                                : "<p class='text-slate-400'>Aucun contenu à prévisualiser.</p>",
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {template ? "Mettre à jour" : "Créer"}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}

// ============================================
// MAIN PAGE
// ============================================

export default function EmailTemplatesPage() {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
    const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

    const categories = [
        { value: "", label: "Toutes" },
        { value: "general", label: "Général" },
        { value: "intro", label: "Introduction" },
        { value: "follow-up", label: "Relance" },
        { value: "sales", label: "Commercial" },
        { value: "meeting", label: "Rendez-vous" },
        { value: "thank-you", label: "Remerciement" },
    ];

    // Fetch templates
    const fetchTemplates = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (categoryFilter) params.set("category", categoryFilter);
            if (search) params.set("search", search);

            const res = await fetch(`/api/email/templates?${params}`);
            const json = await res.json();
            if (json.success) {
                setTemplates(json.data);
            }
        } catch (error) {
            console.error("Failed to fetch templates:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, [categoryFilter]);

    // Search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTemplates();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Delete template
    const handleDelete = async (id: string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer ce template ?")) return;

        try {
            await fetch(`/api/email/templates/${id}`, { method: "DELETE" });
            setTemplates(templates.filter(t => t.id !== id));
        } catch (error) {
            console.error("Failed to delete template:", error);
        }
    };

    // Duplicate template
    const handleDuplicate = async (template: EmailTemplate) => {
        try {
            const res = await fetch("/api/email/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${template.name} (copie)`,
                    subject: template.subject,
                    bodyHtml: template.bodyHtml,
                    category: template.category,
                    isShared: false,
                }),
            });

            const json = await res.json();
            if (json.success) {
                fetchTemplates();
            }
        } catch (error) {
            console.error("Failed to duplicate template:", error);
        }
    };

    const getCategoryBadge = (category: string) => {
        const colors: Record<string, string> = {
            general: "bg-slate-100 text-slate-600",
            intro: "bg-blue-100 text-blue-700",
            "follow-up": "bg-amber-100 text-amber-700",
            sales: "bg-emerald-100 text-emerald-700",
            meeting: "bg-accent-100 text-accent-700",
            "thank-you": "bg-pink-100 text-pink-700",
        };
        const labels: Record<string, string> = {
            general: "Général",
            intro: "Introduction",
            "follow-up": "Relance",
            sales: "Commercial",
            meeting: "Rendez-vous",
            "thank-you": "Remerciement",
        };

        return (
            <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", colors[category] || colors.general)}>
                {labels[category] || category}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Templates Email</h1>
                    <p className="text-sm text-slate-500">Créez et gérez vos templates d'email</p>
                </div>
                <button
                    onClick={() => {
                        setEditingTemplate(null);
                        setEditorOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nouveau template
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {categories.map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => setCategoryFilter(cat.value)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                categoryFilter === cat.value
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900"
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1 max-w-xs">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Templates Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                            Aucun template
                        </h3>
                        <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                            Créez un template pour réutiliser un email type.
                        </p>
                        <button
                            onClick={() => {
                                setEditingTemplate(null);
                                setEditorOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Créer un template
                        </button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => (
                        <Card key={template.id} className="hover:border-slate-300 transition-colors">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {getCategoryBadge(template.category)}
                                        {template.isShared ? (
                                            <span title="Partagé"><Share2 className="w-3.5 h-3.5 text-slate-400" /></span>
                                        ) : (
                                            <span title="Privé"><Lock className="w-3.5 h-3.5 text-slate-400" /></span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setEditingTemplate(template);
                                                setEditorOpen(true);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="Modifier"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDuplicate(template)}
                                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="Dupliquer"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(template.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="text-sm font-semibold text-slate-900 mb-1 truncate">
                                    {template.name}
                                </h3>
                                <p className="text-xs text-slate-500 mb-3 truncate">
                                    {template.subject}
                                </p>

                                <div className="p-2 bg-slate-50 rounded-lg mb-3">
                                    <p className="text-xs text-slate-600 line-clamp-3">
                                        {template.bodyHtml.replace(/<[^>]*>/g, '').substring(0, 150)}...
                                    </p>
                                </div>

                                <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span>Par {template.createdBy.name}</span>
                                    <span>
                                        {template.useCount} utilisations
                                        {template.lastUsedAt && (
                                            <span className="ml-1">
                                                · Dernière utilisation {new Date(template.lastUsedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Editor slide-over */}
            {editorOpen && (
                <TemplateEditor
                    template={editingTemplate}
                    onClose={() => {
                        setEditorOpen(false);
                        setEditingTemplate(null);
                    }}
                    onSave={fetchTemplates}
                />
            )}

            {/* Preview modal */}
            {previewTemplate && (() => {
                const { subject, body } = substitutePreview(previewTemplate.bodyHtml, previewTemplate.subject);
                return (
                    <>
                        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setPreviewTemplate(null)} />
                        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-white rounded-2xl shadow-2xl">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                                <h3 className="text-lg font-semibold text-slate-900">Aperçu : {previewTemplate.name}</h3>
                                <button
                                    type="button"
                                    onClick={() => setPreviewTemplate(null)}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-sm text-slate-600">
                                <span className="font-medium">Sujet :</span> {subject || "(vide)"}
                            </div>
                            <div
                                className="flex-1 overflow-y-auto p-6 prose prose-slate max-w-none prose-p:my-2 text-sm"
                                dangerouslySetInnerHTML={{
                                    __html: body
                                        ? body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                                        : "<p class='text-slate-400'>Aucun contenu.</p>",
                                }}
                            />
                        </div>
                    </>
                );
            })()}
        </div>
    );
}
