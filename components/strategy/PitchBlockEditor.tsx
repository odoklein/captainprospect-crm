"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
    Sparkles, 
    Target, 
    AlertCircle, 
    BarChart3, 
    Rocket, 
    Layers, 
    FileText, 
    Wand2, 
    Plus, 
    Trash2, 
    Copy, 
    Check, 
    Eye, 
    EyeOff, 
    Loader2,
    Bold,
    List,
    HelpCircle
} from "lucide-react";
import { StrategyArtifactViewer } from "./StrategyArtifactViewer";

export interface PitchBlock {
    id: string;
    key: "hook" | "pain" | "solution" | "proof" | "cta" | "custom";
    title: string;
    description: string;
    content: string;
    icon: "target" | "alert" | "sparkles" | "chart" | "rocket" | "custom";
    color: "indigo" | "amber" | "emerald" | "sky" | "violet" | "slate";
    required?: boolean;
}

const DEFAULT_BLOCKS: PitchBlock[] = [
    {
        id: "hook",
        key: "hook",
        title: "1. Accroche & Proposition de valeur",
        description: "En 1 ou 2 phrases percutantes : comment capter l'attention dès le début ?",
        content: "",
        icon: "target",
        color: "indigo",
        required: true,
    },
    {
        id: "pain",
        key: "pain",
        title: "2. Problème identifié / Pain Points",
        description: "Quel est le problème douloureux que votre cible rencontre au quotidien ?",
        content: "",
        icon: "alert",
        color: "amber",
    },
    {
        id: "solution",
        key: "solution",
        title: "3. Solution & Offre concrète",
        description: "Comment votre produit / service résout ce problème de façon unique ?",
        content: "",
        icon: "sparkles",
        color: "emerald",
    },
    {
        id: "proof",
        key: "proof",
        title: "4. Preuves, Chiffres & Références",
        description: "Données chiffrées, métriques (ex: +35% de leads), cas clients ou réassurance.",
        content: "",
        icon: "chart",
        color: "sky",
    },
    {
        id: "cta",
        key: "cta",
        title: "5. Call-to-Action / Objectif",
        description: "La proposition claire : échange de 15 min, démo, audit rapide...",
        content: "",
        icon: "rocket",
        color: "violet",
    },
];

interface PitchBlockEditorProps {
    value: string;
    onChange: (value: string) => void;
    clientName?: string;
    icp?: string;
    channel?: string;
    placeholder?: string;
    className?: string;
    error?: string;
}

/**
 * Parses a raw pitch string into structured blocks.
 */
function parsePitchToBlocks(raw: string): PitchBlock[] {
    if (!raw || !raw.trim()) {
        return DEFAULT_BLOCKS.map(b => ({ ...b, content: "" }));
    }

    // Check if it has markdown header structure like "### 🎯 Accroche"
    const headerRegex = /(?:^|\n)#{2,4}\s+(.+)/g;
    const matches = Array.from(raw.matchAll(headerRegex));

    if (matches.length > 0) {
        const blocks: PitchBlock[] = [];
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const rawTitle = match[1].trim();
            const startIndex = (match.index ?? 0) + match[0].length;
            const endIndex = i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
            const content = raw.substring(startIndex, endIndex).trim();

            const lower = rawTitle.toLowerCase();
            if (lower.includes("accroche") || lower.includes("hook") || lower.includes("proposition")) {
                blocks.push({ ...DEFAULT_BLOCKS[0], content });
            } else if (lower.includes("problème") || lower.includes("probleme") || lower.includes("pain")) {
                blocks.push({ ...DEFAULT_BLOCKS[1], content });
            } else if (lower.includes("solution") || lower.includes("offre")) {
                blocks.push({ ...DEFAULT_BLOCKS[2], content });
            } else if (lower.includes("preuve") || lower.includes("chiffre") || lower.includes("métrique") || lower.includes("reference")) {
                blocks.push({ ...DEFAULT_BLOCKS[3], content });
            } else if (lower.includes("action") || lower.includes("cta") || lower.includes("closing") || lower.includes("conclusion")) {
                blocks.push({ ...DEFAULT_BLOCKS[4], content });
            } else {
                // Custom block
                blocks.push({
                    id: `custom-${i}`,
                    key: "custom",
                    title: rawTitle,
                    description: "Section personnalisée",
                    content,
                    icon: "custom",
                    color: "slate",
                });
            }
        }

        // Ensure missing default blocks are preserved if user wants them
        const existingKeys = new Set(blocks.map(b => b.key));
        DEFAULT_BLOCKS.forEach(def => {
            if (!existingKeys.has(def.key)) {
                blocks.push({ ...def, content: "" });
            }
        });

        return blocks;
    }

    // If plain text, place all in hook or split if multiple paragraphs
    const paragraphs = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length >= 2) {
        const blocks = DEFAULT_BLOCKS.map(b => ({ ...b, content: "" }));
        blocks[0].content = paragraphs[0] || "";
        if (paragraphs.length >= 4) {
            blocks[1].content = paragraphs[1] || "";
            blocks[2].content = paragraphs[2] || "";
            blocks[4].content = paragraphs.slice(3).join("\n\n");
        } else {
            blocks[2].content = paragraphs.slice(1).join("\n\n");
        }
        return blocks;
    }

    // Fallback: single block with raw text
    return DEFAULT_BLOCKS.map((b, idx) => ({
        ...b,
        content: idx === 0 ? raw : "",
    }));
}

/**
 * Serializes structured blocks back into a clean formatted string.
 */
function serializeBlocks(blocks: PitchBlock[]): string {
    const filledBlocks = blocks.filter(b => b.content.trim().length > 0);
    if (filledBlocks.length === 0) return "";

    // If only 1 block is filled and it's the hook or custom, return raw content
    if (filledBlocks.length === 1 && filledBlocks[0].key === "hook") {
        return filledBlocks[0].content;
    }

    return filledBlocks
        .map(b => `### ${b.title}\n${b.content.trim()}`)
        .join("\n\n");
}

export function PitchBlockEditor({
    value,
    onChange,
    clientName,
    icp,
    channel,
    placeholder = "Décrivez la proposition de valeur et le pitch...",
    className = "",
    error,
}: PitchBlockEditorProps) {
    const [mode, setMode] = useState<"blocks" | "text">(() => {
        // Default to blocks mode if value contains structured headers or multiple paragraphs
        return value && (value.includes("###") || value.includes("\n\n")) ? "blocks" : "blocks";
    });

    const [blocks, setBlocks] = useState<PitchBlock[]>(() => parsePitchToBlocks(value));
    const [rawText, setRawText] = useState(value || "");
    const [showPreview, setShowPreview] = useState(false);
    const [isOrganizing, setIsOrganizing] = useState(false);
    const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Synchronize when value changes externally
    useEffect(() => {
        if (value !== rawText) {
            setRawText(value);
            setBlocks(parsePitchToBlocks(value));
        }
    }, [value]);

    const handleBlockChange = (id: string, newContent: string) => {
        const updated = blocks.map(b => b.id === id ? { ...b, content: newContent } : b);
        setBlocks(updated);
        const serialized = serializeBlocks(updated);
        setRawText(serialized);
        onChange(serialized);
    };

    const handleRawTextChange = (text: string) => {
        setRawText(text);
        onChange(text);
        setBlocks(parsePitchToBlocks(text));
    };

    const handleAddCustomBlock = () => {
        const newBlock: PitchBlock = {
            id: `custom-${Date.now()}`,
            key: "custom",
            title: `Bloc personnalisé ${blocks.filter(b => b.key === "custom").length + 1}`,
            description: "Ajoutez des informations clés supplémentaires...",
            content: "",
            icon: "custom",
            color: "slate",
        };
        const updated = [...blocks, newBlock];
        setBlocks(updated);
    };

    const handleRemoveCustomBlock = (id: string) => {
        const updated = blocks.filter(b => b.id !== id);
        setBlocks(updated);
        const serialized = serializeBlocks(updated);
        setRawText(serialized);
        onChange(serialized);
    };

    const handleCopyBlock = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedBlockId(id);
            setTimeout(() => setCopiedBlockId(null), 2000);
        } catch {
            // fallback
        }
    };

    const insertVariable = (variable: string) => {
        if (mode === "text" && textareaRef.current) {
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const nextText = rawText.substring(0, start) + variable + rawText.substring(end);
            handleRawTextChange(nextText);
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + variable.length, start + variable.length);
            }, 50);
        } else {
            // Insert in first block
            if (blocks.length > 0) {
                handleBlockChange(blocks[0].id, (blocks[0].content ? blocks[0].content + " " : "") + variable);
            }
        }
    };

    // Auto-organize pasted text using AI or local heuristic
    const handleOrganizePastedText = async () => {
        const currentToOrganize = rawText.trim() || blocks.map(b => b.content).filter(Boolean).join("\n\n");
        if (!currentToOrganize) return;

        setIsOrganizing(true);
        try {
            const res = await fetch("/api/ai/pitch/organize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rawText: currentToOrganize,
                    clientName,
                    icp,
                    channel,
                }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                const { hook, pain, solution, proof, cta } = json.data;
                const newBlocks = DEFAULT_BLOCKS.map(b => {
                    if (b.key === "hook") return { ...b, content: hook || "" };
                    if (b.key === "pain") return { ...b, content: pain || "" };
                    if (b.key === "solution") return { ...b, content: solution || "" };
                    if (b.key === "proof") return { ...b, content: proof || "" };
                    if (b.key === "cta") return { ...b, content: cta || "" };
                    return b;
                });
                setBlocks(newBlocks);
                const serialized = serializeBlocks(newBlocks);
                setRawText(serialized);
                onChange(serialized);
                setMode("blocks");
            }
        } catch (err) {
            console.error("Failed to organize pitch:", err);
        } finally {
            setIsOrganizing(false);
        }
    };

    const renderBlockIcon = (b: PitchBlock) => {
        switch (b.icon) {
            case "target": return <Target className="w-4 h-4 text-indigo-600" />;
            case "alert": return <AlertCircle className="w-4 h-4 text-amber-600" />;
            case "sparkles": return <Sparkles className="w-4 h-4 text-emerald-600" />;
            case "chart": return <BarChart3 className="w-4 h-4 text-sky-600" />;
            case "rocket": return <Rocket className="w-4 h-4 text-violet-600" />;
            default: return <FileText className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Action Bar / Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setMode("blocks")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            mode === "blocks"
                                ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        Mode Blocs (Artifacts)
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("text")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                            mode === "text"
                                ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                                : "text-slate-600 hover:text-slate-900"
                        }`}
                    >
                        <FileText className="w-3.5 h-3.5 text-slate-600" />
                        Texte libre formaté
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* Auto-organize button */}
                    <button
                        type="button"
                        onClick={handleOrganizePastedText}
                        disabled={isOrganizing || (!rawText.trim() && blocks.every(b => !b.content.trim()))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 shadow-sm shadow-indigo-500/20 transition-all"
                        title="Réorganise intelligemment le texte collé en 5 blocs distincts"
                    >
                        {isOrganizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        <span>Structurer en blocs</span>
                    </button>

                    {/* Preview Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            showPreview
                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                        title="Aperçu du rendu final"
                    >
                        {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{showPreview ? "Masquer aperçu" : "Aperçu"}</span>
                    </button>
                </div>
            </div>

            {/* Quick Variables insertion tags */}
            <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-slate-500">
                <span className="text-[11px] font-medium text-slate-400">Insérer variable :</span>
                {["[Prénom]", "[Nom]", "[Société]", "[Poste]", "[Secteur]"].map(v => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[11px] font-mono font-medium text-slate-600 border border-slate-200 transition-colors"
                    >
                        +{v}
                    </button>
                ))}
            </div>

            {/* LIVE PREVIEW IF TOGGLED */}
            {showPreview && (
                <div className="p-4 bg-slate-50/70 border border-indigo-100 rounded-2xl animate-in fade-in duration-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">Aperçu rendu commercial</p>
                    <StrategyArtifactViewer type="pitch" content={rawText} />
                </div>
            )}

            {/* MODE BLOCS (Cards / Artifacts) */}
            {mode === "blocks" && (
                <div className="space-y-3">
                    {blocks.map((b) => (
                        <div
                            key={b.id}
                            className="p-3.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-xs transition-all"
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-lg bg-slate-100">
                                        {renderBlockIcon(b)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            {b.key === "custom" ? (
                                                <input
                                                    type="text"
                                                    value={b.title}
                                                    onChange={(e) => {
                                                        const updated = blocks.map(bl => bl.id === b.id ? { ...bl, title: e.target.value } : bl);
                                                        setBlocks(updated);
                                                        onChange(serializeBlocks(updated));
                                                    }}
                                                    className="text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-indigo-500"
                                                />
                                            ) : (
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                                    {b.title}
                                                </span>
                                            )}
                                            {b.required && <span className="text-red-500 text-xs font-bold">*</span>}
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{b.description}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1">
                                    {b.content && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyBlock(b.id, b.content)}
                                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                            title="Copier ce bloc"
                                        >
                                            {copiedBlockId === b.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    )}
                                    {b.key === "custom" && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCustomBlock(b.id)}
                                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                            title="Supprimer ce bloc"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* CRITICAL: whitespace-pre-wrap preserved */}
                            <textarea
                                value={b.content}
                                onChange={(e) => handleBlockChange(b.id, e.target.value)}
                                placeholder={`Rédigez le contenu pour : ${b.title}...`}
                                rows={2}
                                className="w-full px-3 py-2 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 transition-all resize-y font-sans leading-relaxed whitespace-pre-wrap"
                            />
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={handleAddCustomBlock}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/30 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Ajouter un bloc personnalisé (ex: Offre spéciale, Objection clé)
                    </button>
                </div>
            )}

            {/* MODE TEXTE LIBRE FORMATÉ */}
            {mode === "text" && (
                <div>
                    {/* CRITICAL: font-sans with whitespace-pre-wrap preserves spaces & line returns */}
                    <textarea
                        ref={textareaRef}
                        value={rawText}
                        onChange={(e) => handleRawTextChange(e.target.value)}
                        placeholder={placeholder}
                        rows={10}
                        className={`w-full px-4 py-3 bg-white border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y font-sans leading-relaxed whitespace-pre-wrap ${
                            error ? "border-red-400" : "border-slate-200"
                        }`}
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 px-1">
                        <span>Astuce : Vous pouvez utiliser les titres `### Accroche` pour séparer visuellement en blocs.</span>
                        <span>{rawText.length} caractères</span>
                    </div>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
            )}
        </div>
    );
}
