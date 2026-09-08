"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Target, FileText, Info, ChevronDown, Copy, Check, Users, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { StrategyArtifactViewer } from "@/components/strategy";

type MissionItem = {
    id: string;
    name: string;
    objective?: string | null;
    campaigns: Array<{ id: string; name: string; isActive: boolean }>;
};

type ListInMission = {
    id: string;
    name: string;
    type: string;
    isActive?: boolean;
    campaignId?: string | null;
    campaign?: {
        id: string;
        name: string;
    } | null;
    readiness?: {
        hasStrategy: boolean;
        hasIcp: boolean;
        hasPitch: boolean;
        hasScript: boolean;
        isReady: boolean;
    };
    _count?: { companies: number };
};

type MissionDetail = {
    id: string;
    name: string;
    objective?: string | null;
    lists: ListInMission[];
    campaigns: Array<{ id: string; name: string; isActive: boolean }>;
};

type StrategyDetail = {
    id: string;
    name: string;
    icp: string;
    pitch: string;
    script?: string | null;
    additionalShared?: string;
    linkedLists: ListInMission[];
};

type ScriptSections = {
    intro?: string;
    discovery?: string;
    objection?: string;
    closing?: string;
};

function parseBaseScript(script: string | null | undefined): ScriptSections {
    if (!script) return {};
    try {
        const parsed = JSON.parse(script) as ScriptSections;
        if (parsed && typeof parsed === "object") return parsed;
    } catch {
        return { intro: script };
    }
    return {};
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };
    return (
        <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#8B8BA7] hover:text-[#7C5CFC] transition-colors"
        >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copié !" : "Copier"}
        </button>
    );
}

const SCRIPT_SECTION_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
    intro:     { color: "text-indigo-700",  bg: "bg-indigo-50/60",  border: "border-l-indigo-400",  label: "Introduction" },
    discovery: { color: "text-sky-700",     bg: "bg-sky-50/60",     border: "border-l-sky-400",     label: "Découverte" },
    objection: { color: "text-amber-700",   bg: "bg-amber-50/60",   border: "border-l-amber-400",   label: "Objections" },
    closing:   { color: "text-emerald-700", bg: "bg-emerald-50/60", border: "border-l-emerald-400", label: "Closing" },
};

export default function ClientSalesPlaybookPage() {
    const { error: showError } = useToast();
    const [missions, setMissions] = useState<MissionItem[]>([]);
    const [selectedMissionId, setSelectedMissionId] = useState("");
    const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null);
    const [strategies, setStrategies] = useState<StrategyDetail[]>([]);
    const [loadingMissions, setLoadingMissions] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        (async () => {
            setLoadingMissions(true);
            try {
                const res = await fetch("/api/missions?isActive=true&limit=200");
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Impossible de charger les missions");
                const items = (json.data ?? []) as MissionItem[];
                setMissions(items);
                if (items.length > 0) setSelectedMissionId(items[0].id);
            } catch (err) {
                showError("Erreur", err instanceof Error ? err.message : "Impossible de charger les missions");
            } finally {
                setLoadingMissions(false);
            }
        })();
    }, [showError]);

    const selectedMission = useMemo(
        () => missions.find((m) => m.id === selectedMissionId) ?? null,
        [missions, selectedMissionId]
    );

    useEffect(() => {
        if (!selectedMissionId) {
            setMissionDetail(null);
            setStrategies([]);
            return;
        }

        (async () => {
            setLoadingDetail(true);
            try {
                const missionRes = await fetch(`/api/missions/${selectedMissionId}`);
                const missionJson = await missionRes.json();
                if (!missionJson.success) throw new Error(missionJson.error || "Impossible de charger la mission");
                const detail: MissionDetail = missionJson.data;
                setMissionDetail(detail);

                // Active campaigns referenced by lists, plus all active mission campaigns
                const activeCampaignIds = new Set<string>();
                for (const list of detail.lists) {
                    if (list.campaignId) activeCampaignIds.add(list.campaignId);
                }
                for (const c of detail.campaigns) {
                    if (c.isActive) activeCampaignIds.add(c.id);
                }

                if (activeCampaignIds.size === 0) {
                    setStrategies([]);
                    return;
                }

                // Fetch each campaign + its script companion in parallel
                const results = await Promise.all(
                    Array.from(activeCampaignIds).map(async (campaignId) => {
                        const [campaignRes, companionRes] = await Promise.all([
                            fetch(`/api/campaigns/${campaignId}`),
                            fetch(`/api/campaigns/${campaignId}/script-companion`),
                        ]);
                        const campaignJson = await campaignRes.json();
                        if (!campaignJson.success) return null;
                        const companionJson = await companionRes.json();
                        const additionalShared =
                            companionJson.success ? (companionJson.data?.additionalShared as string) || "" : "";
                        const linkedLists = detail.lists.filter((l) => l.campaignId === campaignId);
                        return {
                            id: campaignJson.data.id,
                            name: campaignJson.data.name,
                            icp: campaignJson.data.icp || "",
                            pitch: campaignJson.data.pitch || "",
                            script: campaignJson.data.script,
                            additionalShared,
                            linkedLists,
                        } as StrategyDetail;
                    })
                );
                setStrategies(results.filter((r): r is StrategyDetail => r !== null));
            } catch (err) {
                setMissionDetail(null);
                setStrategies([]);
                showError("Erreur", err instanceof Error ? err.message : "Impossible de charger le playbook");
            } finally {
                setLoadingDetail(false);
            }
        })();
    }, [selectedMissionId, showError]);

    const unlinkedLists = useMemo(() => {
        if (!missionDetail) return [] as ListInMission[];
        return missionDetail.lists.filter((l) => !l.campaignId && l.isActive !== false);
    }, [missionDetail]);

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3" style={{ animation: "playbookFadeUp 0.35s ease both" }}>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
                    <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-[#12122A] tracking-tight">Sales Playbook</h1>
                    <p className="text-xs text-[#6B7194] mt-0.5">Stratégies, listes ciblées et scripts de prospection</p>
                </div>
            </div>

            {loadingMissions ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-7 h-7 animate-spin text-[#7C5CFC]" />
                </div>
            ) : missions.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-[#E8EBF0] rounded-2xl py-16 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#F4F5FA] flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="w-6 h-6 text-[#A0A3BD]" />
                    </div>
                    <p className="text-sm font-semibold text-[#12122A]">Aucune mission active</p>
                    <p className="mt-1 text-xs text-[#6B7194]">Le playbook apparaîtra ici dès qu&apos;une mission sera active.</p>
                </div>
            ) : (
                <>
                    {/* Mission selector */}
                    <div className="max-w-sm" style={{ animation: "playbookFadeUp 0.35s ease both", animationDelay: "40ms" }}>
                        <label className="block text-xs font-bold text-[#6B7194] uppercase tracking-wider mb-1.5">Mission</label>
                        <div className="relative">
                            <select
                                value={selectedMissionId}
                                onChange={(e) => setSelectedMissionId(e.target.value)}
                                className="w-full h-10 px-3 pr-9 rounded-xl border border-[#E8EBF0] bg-white text-sm font-semibold text-[#12122A] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/30 shadow-sm appearance-none"
                            >
                                {missions.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-[#A0A3BD] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    {/* Mission info card */}
                    {selectedMission && (
                        <section
                            className="bg-white border border-[#E8EBF0] rounded-2xl p-5 shadow-sm"
                            style={{ animation: "playbookFadeUp 0.35s ease both", animationDelay: "70ms" }}
                        >
                            <div className="flex items-center gap-2.5 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                    <Info className="w-4 h-4 text-blue-600" />
                                </div>
                                <h2 className="text-sm font-bold text-[#12122A] uppercase tracking-wider">Mission</h2>
                            </div>
                            <div className="space-y-2">
                                <div className="flex gap-3">
                                    <span className="text-xs font-bold text-[#A0A3BD] uppercase tracking-wide w-20 shrink-0 pt-0.5">Nom</span>
                                    <span className="text-sm text-[#3D3E5C]">{selectedMission.name}</span>
                                </div>
                                {selectedMission.objective && (
                                    <div className="flex gap-3">
                                        <span className="text-xs font-bold text-[#A0A3BD] uppercase tracking-wide w-20 shrink-0 pt-0.5">Objectif</span>
                                        <span className="text-sm text-[#3D3E5C] whitespace-pre-wrap">{selectedMission.objective}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {loadingDetail ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-[#7C5CFC]" />
                        </div>
                    ) : strategies.length === 0 ? (
                        <div className="bg-white border border-[#E8EBF0] rounded-2xl p-6 text-sm text-[#6B7194] shadow-sm">
                            Aucune stratégie pour cette mission.
                        </div>
                    ) : (
                        <div className="grid gap-5">
                            {strategies.map((strat, idx) => (
                                <StrategyCard
                                    key={strat.id}
                                    strategy={strat}
                                    animationDelay={`${100 + idx * 60}ms`}
                                />
                            ))}

                            {unlinkedLists.length > 0 && (
                                <section
                                    className="bg-amber-50 border border-amber-200 rounded-2xl p-5"
                                    style={{ animation: "playbookFadeUp 0.35s ease both" }}
                                >
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                        <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wider">
                                            Listes sans stratégie ({unlinkedLists.length})
                                        </h2>
                                    </div>
                                    <p className="text-xs text-amber-700 mb-3">
                                        Ces listes n&apos;ont pas encore de stratégie dédiée — votre Account Manager va les configurer.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {unlinkedLists.map((l) => (
                                            <span
                                                key={l.id}
                                                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-1.5"
                                            >
                                                <Users className="w-3.5 h-3.5" />
                                                {l.name}
                                                <span className="text-amber-500">({l._count?.companies ?? 0})</span>
                                            </span>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </>
            )}

            <style jsx global>{`
                @keyframes playbookFadeUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: none; }
                }
            `}</style>
        </div>
    );
}

function StrategyCard({ strategy, animationDelay }: { strategy: StrategyDetail; animationDelay?: string }) {
    const baseScriptSections = parseBaseScript(strategy.script);
    const scriptEntries = [
        { key: "intro",     value: baseScriptSections.intro || "" },
        { key: "discovery", value: baseScriptSections.discovery || "" },
        { key: "objection", value: baseScriptSections.objection || "" },
        { key: "closing",   value: baseScriptSections.closing || "" },
    ].filter((entry) => Boolean(entry.value));

    const ready = !!strategy.icp.trim() && !!strategy.pitch.trim() && !!(strategy.script && strategy.script.trim());

    return (
        <section
            className="bg-white border border-[#E8EBF0] rounded-2xl shadow-sm overflow-hidden"
            style={{ animation: "playbookFadeUp 0.35s ease both", animationDelay }}
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-50 via-white to-white border-b border-[#E8EBF0] px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-[#12122A] truncate">{strategy.name}</h2>
                            <p className="text-xs text-[#6B7194] mt-0.5">
                                Stratégie de prospection
                            </p>
                        </div>
                    </div>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border",
                            ready
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                        )}
                    >
                        {ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {ready ? "Prête" : "En cours"}
                    </span>
                </div>

                {/* Linked databases / lists */}
                <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Link2 className="w-3.5 h-3.5 text-[#7C5CFC]" />
                        <span className="text-[11px] font-bold text-[#6B7194] uppercase tracking-wider">
                            Base{strategy.linkedLists.length > 1 ? "s" : ""} ciblée{strategy.linkedLists.length > 1 ? "s" : ""}
                        </span>
                    </div>
                    {strategy.linkedLists.length === 0 ? (
                        <p className="text-xs text-[#A0A3BD] italic">Aucune liste assignée à cette stratégie</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {strategy.linkedLists.map((l) => (
                                <span
                                    key={l.id}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border",
                                        l.isActive === false
                                            ? "bg-slate-50 text-slate-500 border-slate-200"
                                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    )}
                                    title={`${l._count?.companies ?? 0} sociétés`}
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    {l.name}
                                    <span className="text-[10px] font-bold opacity-70">
                                        {l._count?.companies ?? 0}
                                    </span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-5 space-y-4">
                {/* ICP */}
                <div className="rounded-xl bg-emerald-50/40 border border-emerald-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-emerald-600" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Cible (ICP)</p>
                    </div>
                    <p className="text-sm text-[#3D3E5C] whitespace-pre-wrap leading-relaxed">
                        {strategy.icp || <span className="text-[#A0A3BD] italic">Non renseigné</span>}
                    </p>
                </div>

                {/* Pitch */}
                <div className="rounded-xl bg-blue-50/40 border border-blue-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Info className="w-4 h-4 text-blue-600" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Pitch Commercial</p>
                    </div>
                    <StrategyArtifactViewer
                        type="pitch"
                        content={strategy.pitch}
                        emptyText="Non renseigné"
                    />
                </div>

                {/* Script */}
                {(scriptEntries.length > 0 || strategy.additionalShared) && (
                    <div className="rounded-xl bg-[#F8F9FC] border border-[#E8EBF0] p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-[#7C5CFC]" />
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#7C5CFC]">Script</p>
                        </div>
                        <div className="space-y-3">
                            {scriptEntries.map((entry) => {
                                const style = SCRIPT_SECTION_STYLES[entry.key] ?? SCRIPT_SECTION_STYLES.intro;
                                return (
                                    <div
                                        key={entry.key}
                                        className={cn("rounded-lg border-l-4 p-3 bg-white", style.border)}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <p className={cn("text-[11px] font-bold uppercase tracking-wider", style.color)}>{style.label}</p>
                                            <CopyButton text={entry.value} />
                                        </div>
                                        <p className="text-sm text-[#3D3E5C] whitespace-pre-wrap leading-relaxed">{entry.value}</p>
                                    </div>
                                );
                            })}
                            {strategy.additionalShared && (
                                <div className="rounded-lg border-l-4 border-l-violet-400 bg-violet-50/60 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Script additionnel</p>
                                        <CopyButton text={strategy.additionalShared} />
                                    </div>
                                    <p className="text-sm text-violet-900 whitespace-pre-wrap leading-relaxed">{strategy.additionalShared}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
