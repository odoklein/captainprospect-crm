"use client";

// ============================================
// PRE-CALL BRIEF — the AI brief an SDR reads in the seconds before dialling.
// Built from the CRM only (lib/sdr-assistant/brief); never blocks the call:
// when the AI is unavailable it folds into one muted line.
// ============================================

import { useEffect, useState } from "react";
import { HelpCircle, MessageSquareQuote, RefreshCw, ShieldAlert, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Brief {
    context: string;
    angle: string;
    talkingPoints: string[];
    questions: string[];
    watchOut: string[];
}

type State =
    | { status: "loading" }
    | { status: "ready"; brief: Brief; generatedAt: string; cached: boolean }
    | { status: "unavailable"; reason: string };

export function PrecallBrief({
    companyId,
    contactId,
    missionId,
    className,
    flat = false,
}: {
    companyId: string;
    contactId: string | null;
    missionId: string;
    className?: string;
    /** A section of a workspace pane (Mode Focus) rather than a card. */
    flat?: boolean;
}) {
    const [state, setState] = useState<State>({ status: "loading" });
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        const ctrl = new AbortController();
        const qs = new URLSearchParams({ companyId, missionId });
        if (contactId) qs.set("contactId", contactId);
        if (nonce > 0) qs.set("refresh", "1");
        fetch(`/api/sdr/brief?${qs}`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((json) => {
                if (json?.success) setState(json.data);
                else setState({ status: "unavailable", reason: json?.error ?? "Brief indisponible" });
            })
            .catch((e) => {
                if ((e as Error).name !== "AbortError") setState({ status: "unavailable", reason: "Brief indisponible" });
            });
        return () => ctrl.abort();
    }, [companyId, contactId, missionId, nonce]);

    const regenerate = () => {
        setState({ status: "loading" });
        setNonce((n) => n + 1);
    };

    if (state.status === "unavailable") {
        return (
            <p className={cn("flex items-center gap-1.5 px-1 text-[12px] text-ink-3", className)}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Brief IA indisponible : {state.reason}.
            </p>
        );
    }

    return (
        <section
            className={cn(!flat && "cp-ai-edge rounded-panel border border-line bg-surface shadow-card", className)}
            aria-busy={state.status === "loading"}
        >
            <header className={cn("flex items-center gap-2", flat ? "" : "px-5 pt-4")}>
                <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                <h2 className="text-[13px] font-semibold text-ink">Brief avant l&apos;appel</h2>
                {state.status === "ready" && (
                    <>
                        <span className="text-[11px] text-ink-4">
                            {state.cached ? "à jour" : "généré"} ·{" "}
                            {new Date(state.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <button
                            type="button"
                            onClick={regenerate}
                            className="cp-press ml-auto flex h-7 w-7 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            aria-label="Régénérer le brief"
                            title="Régénérer le brief"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
            </header>

            {state.status === "loading" ? (
                <div className={cn("space-y-2.5 pt-3", !flat && "px-5 pb-5")}>
                    <p className="text-[12px] text-ink-3">Préparation du brief…</p>
                    {[96, 88, 72, 80].map((w, i) => (
                        <div key={i} className="cp-shimmer h-2.5 rounded" style={{ width: `${w}%` }} />
                    ))}
                </div>
            ) : (
                <div className={cn("space-y-4 pt-2.5", !flat && "px-5 pb-5")}>
                    <p className="cp-rise text-[13px] leading-relaxed text-ink-2">{state.brief.context}</p>
                    {state.brief.angle && (
                        <div className="cp-rise flex gap-2.5 rounded-control border-l-2 border-accent bg-accent-50/60 px-3 py-2" style={{ ["--i" as string]: 1 }}>
                            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Accroche</p>
                                <p className="text-[13px] font-medium leading-snug text-ink">{state.brief.angle}</p>
                            </div>
                        </div>
                    )}
                    <div className="cp-rise grid gap-4 sm:grid-cols-2" style={{ ["--i" as string]: 2 }}>
                        <BriefList icon={Target} title="À mettre en avant" items={state.brief.talkingPoints} />
                        <BriefList icon={HelpCircle} title="Questions à poser" items={state.brief.questions} />
                    </div>
                    <div className="cp-rise" style={{ ["--i" as string]: 3 }}>
                        <BriefList icon={ShieldAlert} title="Points de vigilance" items={state.brief.watchOut} tone="warn" />
                    </div>
                </div>
            )}
        </section>
    );
}

function BriefList({ icon: Icon, title, items, tone }: { icon: typeof Target; title: string; items: string[]; tone?: "warn" }) {
    if (items.length === 0) return null;
    return (
        <div>
            <h3 className={cn("mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide", tone === "warn" ? "text-warning-ink" : "text-ink-3")}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {title}
            </h3>
            <ul className="space-y-1">
                {items.map((x, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                        <span className={cn("mt-[7px] h-1 w-1 shrink-0 rounded-full", tone === "warn" ? "bg-warning" : "bg-ink-4")} aria-hidden />
                        {x}
                    </li>
                ))}
            </ul>
        </div>
    );
}
