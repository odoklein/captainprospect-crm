"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    Copy,
    FileText,
    Minus,
    PanelLeftClose,
    Plus,
    ScrollText,
    Search,
    Sparkles,
    X,
} from "lucide-react";
import { TextSkeleton, useToast } from "@/components/ui";
import { parseStrategySections, type ArtifactSection } from "@/components/strategy/StrategyArtifactViewer";
import { usePersistentState } from "@/hooks/usePersistentState";
import { cn } from "@/lib/utils";
import {
    sdrScriptCompanionCampaignsKey,
    sdrScriptCompanionDataKey,
} from "@/lib/query-keys";

export interface ScriptProspect {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    companyName?: string | null;
}

interface ScriptCompanionDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    missionId?: string;
    missionName?: string;
    /** Campaign resolved for the row being worked (list strategy, else mission default).
     *  When set, it wins over the mission's first active campaign. */
    campaignId?: string | null;
    /** Prospect being worked: fills {prénom}, {entreprise}… placeholders in the script. */
    prospect?: ScriptProspect | null;
    /** Keep mounted but out of sight (e.g. while a booking or Allo modal is on top). */
    hidden?: boolean;
}

type ScriptTabId = "base" | "additional" | "ai";
type FontSize = "sm" | "md" | "lg";

type CampaignSummary = { id: string; name: string };

type CompanionData = {
    campaignId: string;
    campaignName: string;
    baseScript: string;
    additionalDraft: string;
    additionalShared: string;
    sharedUpdatedAt: string | null;
    sharedUpdatedBy: string | null;
    aiShared: string;
    aiGeneratedAt: string | null;
    aiGeneratedFrom: string | null;
    defaultTab: ScriptTabId;
};

const FONT_SIZES: FontSize[] = ["sm", "md", "lg"];
const FONT_CLASS: Record<FontSize, string> = {
    sm: "text-sm leading-6",
    md: "text-base leading-7",
    lg: "text-lg leading-8",
};

const SECTION_ACCENT: Record<string, string> = {
    indigo: "bg-cp-info",
    sky: "bg-cp-info",
    amber: "bg-cp-warn",
    emerald: "bg-cp-green",
    violet: "bg-cp-green",
    rose: "bg-cp-danger",
    slate: "bg-cp-ink-3",
};

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-cp-green/40";

// ── Placeholder personalisation ──────────────────────────────────────────────

function normaliseKey(raw: string): string {
    return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_-]+/g, "");
}

const PLACEHOLDER_FIELDS: Record<string, keyof ScriptProspect | "fullName"> = {
    prenom: "firstName",
    firstname: "firstName",
    nom: "lastName",
    lastname: "lastName",
    nomcomplet: "fullName",
    fullname: "fullName",
    contact: "fullName",
    entreprise: "companyName",
    societe: "companyName",
    company: "companyName",
    raisonsociale: "companyName",
    poste: "title",
    fonction: "title",
    title: "title",
    jobtitle: "title",
};

type Segment = { text: string; kind: "text" | "filled" | "missing" };

// {prénom}, {{prenom}} and [Prénom]-style tokens. Square brackets are only
// treated as placeholders when they name a known field ([pause] stays text).
const TOKEN_RE = /\{\{?\s*([^{}\n]{2,40}?)\s*\}?\}|\[([^[\]\n]{2,30})\]/g;

function personalise(content: string, prospect: ScriptProspect | null | undefined): Segment[] {
    const values: Record<string, string | null | undefined> = {
        firstName: prospect?.firstName,
        lastName: prospect?.lastName,
        title: prospect?.title,
        companyName: prospect?.companyName,
        fullName: [prospect?.firstName, prospect?.lastName].filter(Boolean).join(" ") || null,
    };
    const out: Segment[] = [];
    let last = 0;
    for (const match of content.matchAll(TOKEN_RE)) {
        const raw = match[1] ?? match[2] ?? "";
        const field = PLACEHOLDER_FIELDS[normaliseKey(raw)];
        const isBracket = match[2] !== undefined;
        if (!field && isBracket) continue;
        const index = match.index ?? 0;
        if (index > last) out.push({ text: content.slice(last, index), kind: "text" });
        const value = field ? values[field]?.trim() : null;
        out.push(value ? { text: value, kind: "filled" } : { text: match[0], kind: "missing" });
        last = index + match[0].length;
    }
    if (last < content.length) out.push({ text: content.slice(last), kind: "text" });
    return out;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string, keyPrefix: string): ReactNode {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return parts.map((part, i) =>
        i % 2 === 1 ? (
            <mark key={`${keyPrefix}-${i}`} className="rounded bg-cp-warn-soft px-0.5 text-cp-ink">{part}</mark>
        ) : (
            <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
        ),
    );
}

function ScriptText({ content, prospect, query }: { content: string; prospect?: ScriptProspect | null; query: string }) {
    const segments = useMemo(() => personalise(content, prospect), [content, prospect]);
    return (
        <>
            {segments.map((seg, i) =>
                seg.kind === "text" ? (
                    <Fragment key={i}>{highlight(seg.text, query, String(i))}</Fragment>
                ) : seg.kind === "filled" ? (
                    <span key={i} className="rounded bg-cp-green-soft px-1 font-medium text-cp-green" title="Rempli depuis la fiche">
                        {highlight(seg.text, query, String(i))}
                    </span>
                ) : (
                    <span key={i} className="rounded border border-dashed border-cp-warn/40 px-1 text-cp-warn" title="Information absente de la fiche">
                        {seg.text}
                    </span>
                ),
            )}
        </>
    );
}

// ── Copy helper ──────────────────────────────────────────────────────────────

function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    const copy = async (id: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(null), 1600);
        } catch {
            // clipboard unavailable
        }
    };
    return { copied, copy };
}

// ── Structured reader (base + AI scripts) ────────────────────────────────────

function ScriptReader({
    content,
    prospect,
    fontSize,
    emptyText,
    meta,
}: {
    content: string;
    prospect?: ScriptProspect | null;
    fontSize: FontSize;
    emptyText: string;
    meta?: ReactNode;
}) {
    const [query, setQuery] = useState("");
    const sections = useMemo<ArtifactSection[]>(() => parseStrategySections(content, "script"), [content]);
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const { copied, copy } = useCopy();
    const q = query.trim();
    const visible = q ? sections.filter((s) => `${s.title}\n${s.content}`.toLowerCase().includes(q.toLowerCase())) : sections;

    if (!content.trim()) {
        return (
            <div className="rounded-xl border border-dashed border-cp-border-strong bg-cp-canvas px-4 py-10 text-center text-sm text-cp-ink-3">
                {emptyText}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {meta}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-cp-ink-3" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape" && query) {
                            e.stopPropagation();
                            setQuery("");
                        }
                    }}
                    placeholder="Chercher dans le script (objection, prix…)"
                    aria-label="Chercher dans le script"
                    className="h-9 w-full rounded-lg border border-cp-border bg-cp-canvas pl-8 pr-3 text-sm text-cp-ink placeholder:text-cp-ink-3 focus:border-cp-green focus:bg-cp-raised focus:outline-none focus:ring-2 focus:ring-cp-green/25 [&::-webkit-search-cancel-button]:hidden"
                />
            </div>

            {sections.length > 1 && !q && (
                <nav aria-label="Sections du script" className="flex flex-wrap gap-1.5">
                    {sections.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => sectionRefs.current[s.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                            className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-cp-border bg-cp-raised px-2.5 text-xs font-medium text-cp-ink-2 hover:border-cp-border-strong hover:text-cp-ink", focusRing)}
                        >
                            <span className={cn("size-1.5 rounded-full", SECTION_ACCENT[s.color ?? "slate"])} aria-hidden />
                            {s.title.replace(/^\d+\.\s*/, "")}
                        </button>
                    ))}
                </nav>
            )}

            {q && (
                <p className="text-xs text-cp-ink-3" aria-live="polite">
                    {visible.length === 0 ? "Aucune section ne contient ce texte." : `${visible.length} section${visible.length > 1 ? "s" : ""} trouvée${visible.length > 1 ? "s" : ""}`}
                </p>
            )}

            <div className="space-y-3">
                {visible.map((s) => (
                    <section
                        key={s.id}
                        ref={(el) => { sectionRefs.current[s.id] = el; }}
                        className="relative scroll-mt-2 overflow-hidden rounded-xl border border-cp-border bg-cp-raised"
                    >
                        <span className={cn("absolute inset-y-0 left-0 w-1", SECTION_ACCENT[s.color ?? "slate"])} aria-hidden />
                        <header className="flex items-center justify-between gap-2 border-b border-cp-border/70 py-2 pl-4 pr-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-cp-ink-2">{s.title}</h3>
                            <button
                                type="button"
                                onClick={() => copy(s.id, s.content)}
                                className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-cp-ink-3 hover:bg-cp-sunken hover:text-cp-ink", focusRing)}
                            >
                                {copied === s.id ? <Check className="size-3.5 text-cp-green" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                                {copied === s.id ? "Copié" : "Copier"}
                            </button>
                        </header>
                        <div className={cn("whitespace-pre-wrap py-3 pl-4 pr-3 text-cp-ink", FONT_CLASS[fontSize])}>
                            <ScriptText content={s.content} prospect={prospect} query={q} />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function ScriptCompanionDrawer({
    isOpen,
    onClose,
    missionId,
    missionName,
    campaignId,
    prospect,
    hidden = false,
}: ScriptCompanionDrawerProps) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const [activeTab, setActiveTab] = useState<ScriptTabId>("base");
    const [additionalDraft, setAdditionalDraft] = useState("");
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [collapsed, setCollapsed] = usePersistentState<boolean>("sdr_script_collapsed", false, (v) => typeof v === "boolean");
    const [fontSize, setFontSize] = usePersistentState<FontSize>("sdr_script_font", "sm", (v) => FONT_SIZES.includes(v as FontSize));

    const { data: campaigns = [], isFetching: campaignsLoading } = useQuery<CampaignSummary[]>({
        queryKey: sdrScriptCompanionCampaignsKey(isOpen && missionId ? missionId : null),
        queryFn: async () => {
            const res = await fetch(`/api/campaigns?missionId=${missionId}&isActive=true&limit=50`);
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return [];
            return json.data as CampaignSummary[];
        },
        enabled: isOpen && !!missionId,
        staleTime: 60_000,
    });

    // Per-list strategy: the row's campaign comes from its list (see /api/sdr/action-queue).
    // Falling back to campaigns[0] would always show the mission default script.
    const selectedCampaignId = campaignId ?? campaigns[0]?.id ?? null;

    const {
        data: companionData,
        isLoading: companionLoading,
        refetch: refetchCompanionData,
    } = useQuery<CompanionData | null>({
        queryKey: sdrScriptCompanionDataKey(isOpen && selectedCampaignId ? selectedCampaignId : null),
        queryFn: async () => {
            const res = await fetch(`/api/campaigns/${selectedCampaignId}/script-companion`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de charger le script");
            return json.data as CompanionData;
        },
        enabled: isOpen && !!selectedCampaignId,
        staleTime: 30_000,
    });

    // Reset the editor and preferred tab only when the campaign changes — a
    // background refetch must never wipe what the SDR is typing.
    const loadedCampaignRef = useRef<string | null>(null);
    useEffect(() => {
        if (!companionData || loadedCampaignRef.current === companionData.campaignId) return;
        loadedCampaignRef.current = companionData.campaignId;
        setAdditionalDraft(companionData.additionalDraft || companionData.additionalShared || "");
        const preferred = companionData.defaultTab;
        const hasAi = !!companionData.aiShared?.trim();
        setActiveTab(preferred === "ai" && !hasAi ? "base" : preferred ?? "base");
    }, [companionData]);

    const savedDraft = companionData?.additionalDraft || companionData?.additionalShared || "";
    const hasUnsavedChanges = !!companionData && savedDraft !== additionalDraft;

    const handleSaveDraft = async () => {
        if (!selectedCampaignId || isSavingDraft) return;
        setIsSavingDraft(true);
        try {
            const res = await fetch(`/api/campaigns/${selectedCampaignId}/script-companion`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft: additionalDraft }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de sauvegarder le brouillon");
            await refetchCompanionData();
            success("Brouillon sauvegardé", "Votre script additionnel est enregistré.");
        } catch (err) {
            showError("Sauvegarde", err instanceof Error ? err.message : "Erreur inattendue");
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleShare = async () => {
        if (!selectedCampaignId) return;
        setIsPublishing(true);
        try {
            const res = await fetch(`/api/campaigns/${selectedCampaignId}/script-companion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: additionalDraft }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de partager le script");
            await Promise.all([
                refetchCompanionData(),
                queryClient.invalidateQueries({ queryKey: sdrScriptCompanionDataKey(selectedCampaignId) }),
            ]);
            success("Script partagé", "Le script additionnel est maintenant partagé avec l'équipe.");
        } catch (err) {
            showError("Partage", err instanceof Error ? err.message : "Erreur inattendue");
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isOpen) return null;

    const hasAi = !!companionData?.aiShared?.trim();
    const tabs: Array<{ id: ScriptTabId; label: string; icon: typeof FileText; disabled?: boolean; dot?: boolean }> = [
        { id: "base", label: "Base", icon: FileText },
        { id: "additional", label: "Additionnel", icon: Plus, dot: hasUnsavedChanges },
        { id: "ai", label: "IA", icon: Sparkles, disabled: !hasAi },
    ];
    const fontIndex = FONT_SIZES.indexOf(fontSize);

    // Width leaves room for the UnifiedActionDrawer (max-w-2xl, right side).
    const panelWidth = "w-[min(30rem,max(20rem,calc(100vw-45.5rem)))]";

    if (collapsed) {
        return (
            <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Afficher le script"
                className={cn(
                    "fixed bottom-2 left-2 top-2 z-[80] flex w-11 flex-col items-center gap-3 rounded-2xl border border-cp-border bg-cp-raised py-4 text-cp-ink-2 shadow-xl transition-colors hover:text-cp-green",
                    hidden && "hidden",
                    focusRing,
                )}
            >
                <ScrollText className="size-5" aria-hidden />
                <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">Script</span>
            </button>
        );
    }

    return (
        <aside
            aria-label="Script d'appel"
            className={cn(
                "fixed bottom-2 left-2 top-2 z-[80] flex flex-col overflow-hidden rounded-2xl border border-cp-border bg-cp-canvas font-cp shadow-2xl animate-slide-in-left",
                panelWidth,
                hidden && "hidden",
            )}
        >
            {/* Header */}
            <div className="border-b border-cp-border bg-cp-raised px-4 pb-3 pt-3.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-cp-ink">
                            <ScrollText className="size-4 text-cp-green" aria-hidden />
                            Script d&apos;appel
                        </p>
                        <p className="truncate text-xs text-cp-ink-3">
                            {companionData?.campaignName || missionName || "Campagne"}
                            {prospect?.companyName ? ` · ${prospect.companyName}` : ""}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <div className="mr-1 flex items-center rounded-lg border border-cp-border" role="group" aria-label="Taille du texte">
                            <button
                                type="button"
                                onClick={() => setFontSize(FONT_SIZES[Math.max(0, fontIndex - 1)])}
                                disabled={fontIndex === 0}
                                aria-label="Réduire le texte"
                                className={cn("flex size-7 items-center justify-center text-cp-ink-3 hover:text-cp-ink disabled:opacity-40", focusRing)}
                            >
                                <Minus className="size-3.5" />
                            </button>
                            <span className="text-xs font-semibold text-cp-ink-2" aria-hidden>A</span>
                            <button
                                type="button"
                                onClick={() => setFontSize(FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIndex + 1)])}
                                disabled={fontIndex === FONT_SIZES.length - 1}
                                aria-label="Agrandir le texte"
                                className={cn("flex size-7 items-center justify-center text-cp-ink-3 hover:text-cp-ink disabled:opacity-40", focusRing)}
                            >
                                <Plus className="size-3.5" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCollapsed(true)}
                            aria-label="Réduire le panneau"
                            title="Réduire"
                            className={cn("flex size-8 items-center justify-center rounded-lg text-cp-ink-3 hover:bg-cp-sunken hover:text-cp-ink", focusRing)}
                        >
                            <PanelLeftClose className="size-4" />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fermer le script"
                            title="Fermer (s)"
                            className={cn("flex size-8 items-center justify-center rounded-lg text-cp-ink-3 hover:bg-cp-sunken hover:text-cp-ink", focusRing)}
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div role="tablist" aria-label="Version du script" className="mt-3 flex rounded-lg border border-cp-border bg-cp-sunken/60 p-0.5">
                    {tabs.map((t) => {
                        const selected = activeTab === t.id;
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                disabled={t.disabled}
                                onClick={() => setActiveTab(t.id)}
                                title={t.disabled ? "Aucun script IA pour cette campagne" : undefined}
                                className={cn(
                                    "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                    selected ? "bg-cp-raised text-cp-ink shadow-sm" : "text-cp-ink-3 hover:text-cp-ink",
                                    focusRing,
                                )}
                            >
                                <Icon className="size-3.5" aria-hidden />
                                {t.label}
                                {t.dot && <span className="size-1.5 rounded-full bg-cp-warn" aria-label="modifications non sauvegardées" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 drawer-scrollbar">
                {(campaignsLoading && campaigns.length === 0) || companionLoading ? (
                    <div className="space-y-3">
                        <TextSkeleton lines={1} className="h-8 w-2/3" />
                        <TextSkeleton lines={8} />
                    </div>
                ) : !selectedCampaignId ? (
                    <div className="rounded-xl border border-dashed border-cp-border-strong bg-cp-raised px-4 py-10 text-center text-sm text-cp-ink-3">
                        Aucune campagne active pour cette mission.
                    </div>
                ) : !companionData ? (
                    <div className="rounded-xl border border-cp-danger/20 bg-cp-danger-soft px-4 py-6 text-center text-sm text-cp-danger">
                        Impossible de charger le script.
                        <button type="button" onClick={() => refetchCompanionData()} className={cn("ml-2 font-semibold underline", focusRing)}>Réessayer</button>
                    </div>
                ) : activeTab === "base" ? (
                    <ScriptReader
                        key={`base-${companionData.campaignId}`}
                        content={companionData.baseScript || ""}
                        prospect={prospect}
                        fontSize={fontSize}
                        emptyText="Aucun script de base configuré sur cette campagne."
                    />
                ) : activeTab === "ai" ? (
                    <ScriptReader
                        key={`ai-${companionData.campaignId}`}
                        content={companionData.aiShared || ""}
                        prospect={prospect}
                        fontSize={fontSize}
                        emptyText="Aucun script IA disponible pour cette campagne."
                        meta={companionData.aiGeneratedAt ? (
                            <p className="inline-flex items-center gap-1.5 rounded-full border border-cp-green/20 bg-cp-green-soft px-2.5 py-0.5 text-xs font-medium text-cp-green">
                                <Sparkles className="size-3" aria-hidden />
                                Généré {companionData.aiGeneratedFrom ? `depuis ${companionData.aiGeneratedFrom} ` : ""}le {new Date(companionData.aiGeneratedAt).toLocaleDateString("fr-FR")}
                            </p>
                        ) : undefined}
                    />
                ) : (
                    <div className="flex h-full flex-col gap-3">
                        <p className="text-xs text-cp-ink-3">
                            Vos compléments au script (objections rencontrées, tournures qui marchent). Le brouillon reste privé jusqu&apos;au partage.
                        </p>
                        <textarea
                            value={additionalDraft}
                            onChange={(e) => setAdditionalDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                                    e.preventDefault();
                                    void handleSaveDraft();
                                }
                            }}
                            placeholder={"## Objection : « on a déjà un prestataire »\nRéponse qui a marché…"}
                            aria-label="Script additionnel"
                            className={cn(
                                "min-h-72 w-full flex-1 resize-none rounded-xl border border-cp-border bg-cp-raised px-3 py-3 text-cp-ink placeholder:text-cp-ink-3 focus:border-cp-green focus:outline-none focus:ring-2 focus:ring-cp-green/25",
                                FONT_CLASS[fontSize],
                            )}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cp-ink-3">
                            <span className={cn(hasUnsavedChanges && "font-medium text-cp-warn")} aria-live="polite">
                                {hasUnsavedChanges ? "Modifications non sauvegardées · Ctrl+S" : "Brouillon à jour"}
                            </span>
                            {companionData.sharedUpdatedAt && (
                                <span>
                                    Partagé le {new Date(companionData.sharedUpdatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                                    {companionData.sharedUpdatedBy ? ` par ${companionData.sharedUpdatedBy}` : ""}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: editor actions */}
            {activeTab === "additional" && companionData && (
                <div className="flex gap-2 border-t border-cp-border bg-cp-raised px-4 py-3">
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={isSavingDraft || isPublishing || !hasUnsavedChanges}
                        className={cn("h-9 flex-1 rounded-lg border border-cp-border bg-cp-raised text-sm font-medium text-cp-ink hover:border-cp-border-strong disabled:opacity-50", focusRing)}
                    >
                        {isSavingDraft ? "Sauvegarde…" : "Sauvegarder le brouillon"}
                    </button>
                    <button
                        type="button"
                        onClick={handleShare}
                        disabled={isPublishing || isSavingDraft || !additionalDraft.trim()}
                        className={cn("h-9 flex-1 rounded-lg bg-cp-green text-sm font-medium text-white hover:bg-cp-green-hover disabled:opacity-50", focusRing)}
                    >
                        {isPublishing ? "Partage…" : "Partager avec l'équipe"}
                    </button>
                </div>
            )}
        </aside>
    );
}
