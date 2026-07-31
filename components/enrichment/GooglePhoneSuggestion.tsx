"use client";

import { useEffect, useState } from "react";
import {
    Check,
    ExternalLink,
    RotateCcw,
    Search,
    ShieldCheck,
    X,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Suggestion = {
    lookupId: string;
    phone: string;
    source: string;
    sourceUrl: string | null;
    matchedCompany: string | null;
    matchedAddress: string | null;
    confidence: number;
    cached: boolean;
};

type GooglePhoneSuggestionProps = {
    companyId: string;
    companyName: string;
    onApplied: (phone: string) => void;
};

type ViewState = "idle" | "loading" | "suggestion" | "empty" | "rejected" | "applied" | "error";

function confidenceMeta(confidence: number) {
    if (confidence >= 85) {
        return {
            label: "Confiance élevée",
            className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
    }
    if (confidence >= 65) {
        return {
            label: "Confiance moyenne",
            className: "bg-amber-50 text-amber-700 border-amber-200",
        };
    }
    return {
        label: "À vérifier",
        className: "bg-orange-50 text-orange-700 border-orange-200",
    };
}

export function GooglePhoneSuggestion({
    companyId,
    companyName,
    onApplied,
}: GooglePhoneSuggestionProps) {
    const [viewState, setViewState] = useState<ViewState>("idle");
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isReviewing, setIsReviewing] = useState(false);

    useEffect(() => {
        setViewState("idle");
        setSuggestion(null);
        setErrorMessage("");
        setIsReviewing(false);
    }, [companyId]);

    const search = async () => {
        setViewState("loading");
        setErrorMessage("");

        try {
            const response = await fetch("/api/enrichment/google-phone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || "La recherche a échoué.");
            }

            if (!payload.data.found) {
                setSuggestion(null);
                setViewState("empty");
                return;
            }

            setSuggestion(payload.data);
            setViewState("suggestion");
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "La recherche a échoué.",
            );
            setViewState("error");
        }
    };

    const review = async (action: "APPLY" | "REJECT") => {
        if (!suggestion) return;
        setIsReviewing(true);
        setErrorMessage("");

        try {
            const response = await fetch("/api/enrichment/google-phone", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lookupId: suggestion.lookupId,
                    action,
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.error || "Action impossible.");
            }

            if (action === "APPLY") {
                onApplied(payload.data.phone);
                setViewState("applied");
            } else {
                setViewState("rejected");
            }
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "Action impossible.",
            );
        } finally {
            setIsReviewing(false);
        }
    };

    if (viewState === "idle") {
        return (
            <button
                type="button"
                onClick={search}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3.5 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 active:scale-[0.99]"
            >
                <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-indigo-600">
                        <Search className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800">
                            Trouver le téléphone via Google
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                            Recherche contrôlée pour {companyName}
                        </span>
                    </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-indigo-600 transition-transform group-hover:translate-x-0.5">
                    Rechercher
                </span>
            </button>
        );
    }

    if (viewState === "loading") {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 w-36 animate-pulse rounded bg-slate-100" />
                        <div className="h-2.5 w-52 max-w-full animate-pulse rounded bg-slate-100" />
                    </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                    Vérification du meilleur établissement correspondant…
                </p>
            </div>
        );
    }

    if (viewState === "empty" || viewState === "rejected" || viewState === "applied") {
        const content = {
            empty: {
                title: "Aucun numéro fiable trouvé",
                detail: "Google Places n’a pas retourné de correspondance suffisamment sûre.",
            },
            rejected: {
                title: "Suggestion rejetée",
                detail: "Le numéro n’a pas été ajouté à la société.",
            },
            applied: {
                title: "Numéro validé",
                detail: "Le téléphone a été ajouté avec votre validation dans l’audit.",
            },
        }[viewState];

        return (
            <div
                className={cn(
                    "rounded-xl border px-4 py-3",
                    viewState === "applied"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50",
                )}
                aria-live="polite"
            >
                <div className="flex items-start gap-3">
                    <ShieldCheck
                        className={cn(
                            "mt-0.5 h-4.5 w-4.5 shrink-0",
                            viewState === "applied"
                                ? "text-emerald-600"
                                : "text-slate-500",
                        )}
                    />
                    <div>
                        <p className="text-sm font-semibold text-slate-800">
                            {content.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-600">
                            {content.detail}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (viewState === "error") {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
                <p className="text-sm font-semibold text-red-800">
                    Recherche indisponible
                </p>
                <p className="mt-1 text-xs leading-5 text-red-700">
                    {errorMessage}
                </p>
                <button
                    type="button"
                    onClick={search}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 hover:underline"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Réessayer
                </button>
            </div>
        );
    }

    if (!suggestion) return null;
    const confidence = confidenceMeta(suggestion.confidence);

    return (
        <div className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm shadow-indigo-100/60">
            <div className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-indigo-800">
                        Suggestion Google Places
                    </span>
                    <span
                        className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            confidence.className,
                        )}
                    >
                        {confidence.label} · {suggestion.confidence}%
                    </span>
                </div>
            </div>

            <div className="space-y-3 p-4">
                <div>
                    <a
                        href={`tel:${suggestion.phone}`}
                        className="text-lg font-bold tracking-tight text-slate-900 hover:text-indigo-700"
                    >
                        {suggestion.phone}
                    </a>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                        {suggestion.matchedCompany || companyName}
                    </p>
                    {suggestion.matchedAddress && (
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            {suggestion.matchedAddress}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>Source : {suggestion.source}</span>
                    {suggestion.cached && <span>Résultat en cache</span>}
                </div>

                {errorMessage && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                        {errorMessage}
                    </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="success"
                        onClick={() => review("APPLY")}
                        disabled={isReviewing}
                        className="active:scale-[0.98]"
                    >
                        <Check className="h-4 w-4" />
                        Appliquer
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => review("REJECT")}
                        disabled={isReviewing}
                        className="active:scale-[0.98]"
                    >
                        <X className="h-4 w-4" />
                        Rejeter
                    </Button>
                </div>

                {suggestion.sourceUrl && (
                    <a
                        href={suggestion.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ouvrir la source
                    </a>
                )}
            </div>
        </div>
    );
}
