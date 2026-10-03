"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Briefcase,
    Check,
    ExternalLink,
    Globe,
    Linkedin,
    Loader2,
    MapPin,
    Phone,
    RotateCcw,
    X,
    type LucideIcon,
} from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
    COMPANY_AI_COMING_SOON_MESSAGE,
    COMPANY_AI_ENRICHMENT_ENABLED,
} from "@/lib/enrichment/company-ai-availability";
import {
    FIELD_LABELS,
    missingCompanyFields,
    triggerGaps,
    type CompanyAiLookupPayload,
    type CompanyForGaps,
    type EnrichableField,
    type EnrichmentSuggestion,
    type SuggestionTrust,
} from "@/lib/enrichment/company-fields";

const ENDPOINT = "/api/enrichment/company-ai";

const FIELD_ICONS: Record<EnrichableField, LucideIcon> = {
    phone: Phone,
    industry: Briefcase,
    country: MapPin,
    city: MapPin,
    linkedin: Linkedin,
    website: Globe,
};

const TRUST: Record<SuggestionTrust, { label: string; className: string }> = {
    own_site: { label: "Site officiel", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    multi_source: { label: "Sources concordantes", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    third_party: { label: "Source tierce", className: "border-amber-200 bg-amber-50 text-amber-700" },
    inferred: { label: "Déduit du web", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const PROGRESS_STEPS = ["Recherche sur le web…", "Lecture des sources…", "Vérification des informations…"];

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Action impossible.");
    return payload.data as T;
}

function ValueLine({ suggestion }: { suggestion: EnrichmentSuggestion }) {
    const { field, value } = suggestion;
    const linkClass = "truncate font-semibold text-slate-900 hover:text-primary-700 hover:underline";
    if (field === "phone") return <a href={`tel:${value}`} className={linkClass}>{value}</a>;
    if (field === "linkedin" || field === "website") {
        return (
            <a href={value} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {value.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
        );
    }
    return <span className="truncate font-semibold text-slate-900">{value}</span>;
}

function SuggestionRow({
    suggestion,
    disabled,
    onDecide,
}: {
    suggestion: EnrichmentSuggestion;
    disabled: boolean;
    onDecide: (action: "APPLY" | "REJECT") => void;
}) {
    const Icon = FIELD_ICONS[suggestion.field];
    const trust = TRUST[suggestion.trust];

    return (
        <li className="flex items-center gap-2.5 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {FIELD_LABELS[suggestion.field]}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-sm">
                    <ValueLine suggestion={suggestion} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span
                        className={cn("rounded-full border px-1.5 py-px text-[10px] font-semibold", trust.className)}
                        title={suggestion.evidence ?? undefined}
                    >
                        {trust.label} · {suggestion.confidence}%
                    </span>
                    {suggestion.sourceUrl && (
                        <a
                            href={suggestion.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={suggestion.evidence ?? "Ouvrir la source"}
                            className="inline-flex items-center gap-1 truncate text-[11px] text-slate-500 hover:text-primary-600"
                        >
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{suggestion.sourceLabel ?? "source"}</span>
                        </a>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={() => onDecide("APPLY")}
                    disabled={disabled}
                    aria-label={`Appliquer : ${FIELD_LABELS[suggestion.field]}`}
                    title="Appliquer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
                >
                    <Check className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={() => onDecide("REJECT")}
                    disabled={disabled}
                    aria-label={`Ignorer : ${FIELD_LABELS[suggestion.field]}`}
                    title="Ignorer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 active:scale-95 disabled:opacity-50"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </li>
    );
}

function Shell({ children, tone = "idle" }: { children: ReactNode; tone?: "idle" | "result" | "error" }) {
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border",
                tone === "result" && "border-primary-200 bg-white shadow-sm",
                tone === "idle" && "border-dashed border-slate-300 bg-slate-50/70",
                tone === "error" && "border-red-200 bg-red-50",
            )}
        >
            {children}
        </div>
    );
}

export function CompanyAiEnrichment({
    companyId,
    company,
    onApplied,
}: {
    companyId: string;
    company: CompanyForGaps;
    onApplied: () => void;
}) {
    const toast = useToast();
    const queryClient = useQueryClient();
    const queryKey = ["company-ai-enrichment", companyId] as const;

    const gaps = triggerGaps(company);
    const missingLabels = missingCompanyFields(company)
        .filter((f) => f === "phone" || f === "industry" || f === "country" || f === "linkedin")
        .map((f) => FIELD_LABELS[f]);

    const lookup = useQuery<CompanyAiLookupPayload>({
        queryKey,
        queryFn: () => callApi<CompanyAiLookupPayload>(`${ENDPOINT}?companyId=${encodeURIComponent(companyId)}`),
        enabled: COMPANY_AI_ENRICHMENT_ENABLED && gaps.length > 0,
        staleTime: 30_000,
    });

    // While the feature is gated, the click opens an info pop-up instead of calling the API.
    const [comingSoonOpen, setComingSoonOpen] = useState(false);

    const search = useMutation({
        mutationFn: (force: boolean) =>
            callApi<CompanyAiLookupPayload>(ENDPOINT, { method: "POST", body: JSON.stringify({ companyId, force }) }),
        onSuccess: (data) => queryClient.setQueryData(queryKey, data),
    });

    const review = useMutation({
        mutationFn: (decisions: Array<{ field: EnrichableField; action: "APPLY" | "REJECT" }>) =>
            callApi<{
                applied: EnrichableField[];
                skipped: Array<{ field: EnrichableField; reason: string }>;
                suggestions: EnrichmentSuggestion[];
            }>(ENDPOINT, {
                method: "PATCH",
                body: JSON.stringify({ lookupId: lookup.data?.lookupId, decisions }),
            }),
        onSuccess: (result) => {
            queryClient.setQueryData<CompanyAiLookupPayload>(queryKey, (old) =>
                old ? { ...old, suggestions: result.suggestions, found: result.suggestions.some((s) => s.status === "PENDING") } : old,
            );
            if (result.applied.length > 0) {
                toast.success("Fiche mise à jour", result.applied.map((f) => FIELD_LABELS[f]).join(", "));
                onApplied();
            }
            for (const item of result.skipped) toast.error(FIELD_LABELS[item.field], item.reason);
        },
        onError: (error: Error) => toast.error("Action impossible", error.message),
    });

    // Rotating progress text: the search takes a few seconds, silence feels broken.
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (!search.isPending) return;
        const timer = setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1)), 2600);
        return () => {
            clearInterval(timer);
            setStep(0);
        };
    }, [search.isPending]);

    // The query cache is the single source of truth (search and review both write into it).
    const data = lookup.data;
    const pending = data?.suggestions.filter((s) => s.status === "PENDING") ?? [];
    const applied = data?.suggestions.filter((s) => s.status === "APPLIED") ?? [];

    if (gaps.length === 0 && pending.length === 0) return null;

    if (search.isPending) {
        return (
            <Shell>
                <div className="flex items-center gap-3 px-3.5 py-3" aria-live="polite">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-600" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{PROGRESS_STEPS[step]}</p>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-500" />
                        </div>
                    </div>
                </div>
            </Shell>
        );
    }

    if (search.isError) {
        return (
            <Shell tone="error">
                <div className="px-3.5 py-3" role="alert">
                    <p className="text-sm font-semibold text-red-800">Recherche IA indisponible</p>
                    <p className="mt-0.5 text-xs leading-5 text-red-700">{search.error.message}</p>
                    <button
                        type="button"
                        onClick={() => search.mutate(false)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 hover:underline"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Réessayer
                    </button>
                </div>
            </Shell>
        );
    }

    if (pending.length > 0) {
        const busy = review.isPending;
        return (
            <Shell tone="result">
                <div className="flex items-center justify-between gap-2 border-b border-primary-100 bg-primary-50/60 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-800">
                        <AiMark className="h-3.5 w-3.5" aria-hidden="true" />
                        {pending.length} information{pending.length > 1 ? "s" : ""} trouvée{pending.length > 1 ? "s" : ""} par l&apos;IA
                    </span>
                    {pending.length > 1 && (
                        <button
                            type="button"
                            onClick={() => review.mutate(pending.map((s) => ({ field: s.field, action: "APPLY" as const })))}
                            disabled={busy}
                            className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-700 active:scale-95 disabled:opacity-50"
                        >
                            Tout appliquer
                        </button>
                    )}
                </div>
                <ul className="divide-y divide-slate-100">
                    {pending.map((s) => (
                        <SuggestionRow
                            key={s.field}
                            suggestion={s}
                            disabled={busy}
                            onDecide={(action) => review.mutate([{ field: s.field, action }])}
                        />
                    ))}
                </ul>
                {applied.length > 0 && (
                    <p className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-[11px] text-emerald-700">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Ajouté : {applied.map((s) => FIELD_LABELS[s.field]).join(", ")}
                    </p>
                )}
                <p className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500">
                    Suggestions générées par l&apos;IA à partir du web : vérifiez avant d&apos;appliquer.
                    {data?.cached && " (résultat déjà recherché)"}
                </p>
            </Shell>
        );
    }

    const searchedWithoutLuck = search.isSuccess && !search.data.found;
    return (
        <>
            <Shell>
                <button
                    type="button"
                    onClick={() => {
                        if (!COMPANY_AI_ENRICHMENT_ENABLED) {
                            setComingSoonOpen(true);
                            return;
                        }
                        search.mutate(searchedWithoutLuck);
                    }}
                    disabled={lookup.isLoading}
                    className="group flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-primary-50/50 active:scale-[0.995] disabled:opacity-60"
                >
                    <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary-600">
                            <AiMark className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">
                                {searchedWithoutLuck ? "Rien de fiable trouvé" : "Fiche incomplète"}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                                {searchedWithoutLuck
                                    ? "Aucune source n'a confirmé ces informations."
                                    : `Manque : ${missingLabels.join(", ")}`}
                            </span>
                        </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-primary-600 transition-transform group-hover:translate-x-0.5">
                        {searchedWithoutLuck ? "Relancer" : "Compléter avec l'IA"}
                    </span>
                </button>
            </Shell>
            <Modal isOpen={comingSoonOpen} onClose={() => setComingSoonOpen(false)} title="Bientôt disponible" size="sm">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                        <AiMark className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="text-sm leading-6 text-slate-600">
                        {COMPANY_AI_COMING_SOON_MESSAGE} D&apos;ici là, vous pouvez compléter la fiche manuellement.
                    </p>
                </div>
                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={() => setComingSoonOpen(false)}
                        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:scale-95"
                    >
                        Compris
                    </button>
                </div>
            </Modal>
        </>
    );
}
