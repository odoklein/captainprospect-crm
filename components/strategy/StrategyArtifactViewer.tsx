"use client";

import React, { useState } from "react";
import { 
    Copy, 
    Check, 
    Sparkles, 
    Target, 
    AlertCircle, 
    CheckCircle2, 
    BarChart3, 
    Rocket, 
    HelpCircle, 
    FileText,
    Layers,
    ChevronDown,
    ChevronUp
} from "lucide-react";

export interface ArtifactSection {
    id: string;
    title: string;
    content: string;
    iconName?: string;
    color?: "indigo" | "amber" | "emerald" | "sky" | "violet" | "rose" | "slate";
}

interface StrategyArtifactViewerProps {
    type: "pitch" | "script";
    content: string | null | undefined;
    emptyText?: string;
    className?: string;
    allowCollapse?: boolean;
}

const COLOR_MAP: Record<string, {
    border: string;
    borderLeft: string;
    badgeBg: string;
    badgeText: string;
    cardBg: string;
    iconColor: string;
}> = {
    indigo: {
        border: "border-indigo-100",
        borderLeft: "border-l-indigo-500",
        badgeBg: "bg-indigo-50",
        badgeText: "text-indigo-700",
        cardBg: "bg-indigo-50/20",
        iconColor: "text-indigo-600",
    },
    amber: {
        border: "border-amber-100",
        borderLeft: "border-l-amber-500",
        badgeBg: "bg-amber-50",
        badgeText: "text-amber-700",
        cardBg: "bg-amber-50/20",
        iconColor: "text-amber-600",
    },
    emerald: {
        border: "border-emerald-100",
        borderLeft: "border-l-emerald-500",
        badgeBg: "bg-emerald-50",
        badgeText: "text-emerald-700",
        cardBg: "bg-emerald-50/20",
        iconColor: "text-emerald-600",
    },
    sky: {
        border: "border-sky-100",
        borderLeft: "border-l-sky-500",
        badgeBg: "bg-sky-50",
        badgeText: "text-sky-700",
        cardBg: "bg-sky-50/20",
        iconColor: "text-sky-600",
    },
    violet: {
        border: "border-violet-100",
        borderLeft: "border-l-violet-500",
        badgeBg: "bg-violet-50",
        badgeText: "text-violet-700",
        cardBg: "bg-violet-50/20",
        iconColor: "text-violet-600",
    },
    rose: {
        border: "border-rose-100",
        borderLeft: "border-l-rose-500",
        badgeBg: "bg-rose-50",
        badgeText: "text-rose-700",
        cardBg: "bg-rose-50/20",
        iconColor: "text-rose-600",
    },
    slate: {
        border: "border-slate-200",
        borderLeft: "border-l-slate-400",
        badgeBg: "bg-slate-100",
        badgeText: "text-slate-700",
        cardBg: "bg-slate-50/60",
        iconColor: "text-slate-500",
    },
};

function renderIcon(iconName?: string) {
    switch (iconName) {
        case "hook":
        case "target":
            return <Target className="w-4 h-4" />;
        case "pain":
        case "alert":
            return <AlertCircle className="w-4 h-4" />;
        case "solution":
        case "sparkles":
            return <Sparkles className="w-4 h-4" />;
        case "proof":
        case "chart":
            return <BarChart3 className="w-4 h-4" />;
        case "cta":
        case "rocket":
            return <Rocket className="w-4 h-4" />;
        case "intro":
            return <Target className="w-4 h-4" />;
        case "discovery":
            return <HelpCircle className="w-4 h-4" />;
        case "objection":
            return <AlertCircle className="w-4 h-4" />;
        case "closing":
            return <CheckCircle2 className="w-4 h-4" />;
        default:
            return <FileText className="w-4 h-4" />;
    }
}

/**
 * Parses markdown header sections, script delimiter sections, or JSON script into structured sections
 */
export function parseStrategySections(content: string, type: "pitch" | "script"): ArtifactSection[] {
    if (!content || !content.trim()) return [];

    // 1. Check if it's JSON (e.g. script JSON)
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") {
            const sections: ArtifactSection[] = [];
            if (parsed.intro?.trim()) {
                sections.push({
                    id: "intro",
                    title: "1. Introduction / Accroche",
                    content: parsed.intro.trim(),
                    iconName: "intro",
                    color: "indigo",
                });
            }
            if (parsed.discovery?.trim()) {
                sections.push({
                    id: "discovery",
                    title: "2. Phase de découverte",
                    content: parsed.discovery.trim(),
                    iconName: "discovery",
                    color: "sky",
                });
            }
            if (parsed.objection?.trim()) {
                sections.push({
                    id: "objection",
                    title: "3. Réponses aux objections",
                    content: parsed.objection.trim(),
                    iconName: "objection",
                    color: "amber",
                });
            }
            if (parsed.closing?.trim()) {
                sections.push({
                    id: "closing",
                    title: "4. Closing / Appel à l'action",
                    content: parsed.closing.trim(),
                    iconName: "closing",
                    color: "emerald",
                });
            }
            if (sections.length > 0) return sections;
        }
    } catch {
        // Not JSON, continue to markdown / delimiter parsing
    }

    // 2. Check for script delimiters like "--- Introduction ---"
    if (content.includes("--- Introduction ---") || content.includes("--- Decouverte ---") || content.includes("--- Objections ---") || content.includes("--- Closing ---")) {
        const parts = content.split(/---\s*([A-Za-zÀ-ÿ\s/'-]+)\s*---/);
        const sections: ArtifactSection[] = [];
        for (let i = 1; i < parts.length; i += 2) {
            const rawTitle = (parts[i] || "").trim();
            const rawBody = (parts[i + 1] || "").trim();
            if (!rawBody) continue;

            let color: "indigo" | "amber" | "emerald" | "sky" | "violet" = "indigo";
            let icon = "file";
            const lower = rawTitle.toLowerCase();
            if (lower.includes("intro")) { color = "indigo"; icon = "intro"; }
            else if (lower.includes("decouverte") || lower.includes("découverte")) { color = "sky"; icon = "discovery"; }
            else if (lower.includes("objection")) { color = "amber"; icon = "objection"; }
            else if (lower.includes("closing") || lower.includes("cloture") || lower.includes("clôture")) { color = "emerald"; icon = "closing"; }

            sections.push({
                id: `sec-${i}`,
                title: rawTitle,
                content: rawBody,
                iconName: icon,
                color,
            });
        }
        if (sections.length > 0) return sections;
    }

    // 3. Check for Markdown headers (### or ##)
    const headerRegex = /(?:^|\n)#{2,4}\s+(.+)/g;
    const matches = Array.from(content.matchAll(headerRegex));

    if (matches.length > 0) {
        const sections: ArtifactSection[] = [];
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const title = match[1].trim();
            const startIndex = (match.index ?? 0) + match[0].length;
            const endIndex = i + 1 < matches.length ? (matches[i + 1].index ?? content.length) : content.length;
            const sectionContent = content.substring(startIndex, endIndex).trim();

            if (sectionContent) {
                const lower = title.toLowerCase();
                let color: "indigo" | "amber" | "emerald" | "sky" | "violet" | "slate" = "slate";
                let icon = "file";

                if (lower.includes("accroche") || lower.includes("hook") || lower.includes("intro")) {
                    color = "indigo";
                    icon = "hook";
                } else if (lower.includes("problème") || lower.includes("probleme") || lower.includes("pain")) {
                    color = "amber";
                    icon = "pain";
                } else if (lower.includes("solution") || lower.includes("valeur") || lower.includes("offre")) {
                    color = "emerald";
                    icon = "solution";
                } else if (lower.includes("preuve") || lower.includes("chiffre") || lower.includes("métrique") || lower.includes("resultat")) {
                    color = "sky";
                    icon = "proof";
                } else if (lower.includes("action") || lower.includes("cta") || lower.includes("closing") || lower.includes("conclusion")) {
                    color = "violet";
                    icon = "cta";
                } else if (lower.includes("objection")) {
                    color = "amber";
                    icon = "objection";
                } else if (lower.includes("découverte") || lower.includes("decouverte")) {
                    color = "sky";
                    icon = "discovery";
                }

                sections.push({
                    id: `md-sec-${i}`,
                    title,
                    content: sectionContent,
                    iconName: icon,
                    color,
                });
            }
        }
        if (sections.length > 0) return sections;
    }

    // 4. Default: single section with full text (preserving all lines and spaces)
    return [{
        id: "default",
        title: type === "pitch" ? "Pitch Commercial" : "Script d'Appel",
        content: content.trim(),
        iconName: type === "pitch" ? "solution" : "file",
        color: type === "pitch" ? "indigo" : "slate",
    }];
}

export function StrategyArtifactViewer({
    type,
    content,
    emptyText = "Non renseigné",
    className = "",
    allowCollapse = false,
}: StrategyArtifactViewerProps) {
    const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    if (!content || !content.trim()) {
        return (
            <div className={`rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-sm text-slate-400 italic ${className}`}>
                {emptyText}
            </div>
        );
    }

    const sections = parseStrategySections(content, type);

    const handleCopy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedIndex(id);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch {
            // fallback
        }
    };

    const handleCopyAll = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedIndex("all");
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch {
            // fallback
        }
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Header toolbar */}
            <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{sections.length > 1 ? `${sections.length} blocs structurés` : (type === "pitch" ? "Pitch commercial" : "Script de prospection")}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCopyAll}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-md hover:bg-slate-100"
                        title="Copier tout le contenu"
                    >
                        {copiedIndex === "all" ? (
                            <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600 font-semibold">Copié !</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3 h-3" />
                                <span>Copier tout</span>
                            </>
                        )}
                    </button>
                    {allowCollapse && (
                        <button
                            type="button"
                            onClick={() => setCollapsed(!collapsed)}
                            className="text-slate-400 hover:text-slate-600 p-1"
                        >
                            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                    )}
                </div>
            </div>

            {/* Sections cards / artifacts */}
            {!collapsed && (
                <div className="space-y-2.5">
                    {sections.map((sec) => {
                        const colors = COLOR_MAP[sec.color || "indigo"] || COLOR_MAP.indigo;
                        return (
                            <div
                                key={sec.id}
                                className={`rounded-xl border ${colors.border} ${colors.cardBg} border-l-4 ${colors.borderLeft} p-3.5 shadow-sm transition-all hover:shadow-md bg-white`}
                            >
                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <span className={`p-1 rounded-md ${colors.badgeBg} ${colors.iconColor}`}>
                                            {renderIcon(sec.iconName)}
                                        </span>
                                        <span className={`text-xs font-bold uppercase tracking-wider ${colors.badgeText}`}>
                                            {sec.title}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(sec.id, sec.content)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 px-2 py-0.5 rounded transition-colors"
                                        title="Copier ce bloc"
                                    >
                                        {copiedIndex === sec.id ? (
                                            <>
                                                <Check className="w-3 h-3 text-emerald-600" />
                                                <span className="text-emerald-600 font-semibold">Copié</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-3 h-3" />
                                                <span>Copier bloc</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                {/* CRITICAL: whitespace-pre-wrap ensures ALL spaces, newlines, and tabs are preserved! */}
                                <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                                    {sec.content}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
