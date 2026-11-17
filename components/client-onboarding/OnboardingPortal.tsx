"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CloudOff, Info, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBrand } from "@/lib/brand/client";
import {
    SCREENS, STEPS, isStepDone, minutesLeft, screenIssues, type Answers, type ScreenKey,
} from "@/lib/client-onboarding/questionnaire";
import type { PortalView } from "@/lib/client-onboarding/service";
import { TargetsScreen } from "./TargetsScreen";
import { ReviewScreen } from "./ReviewScreen";
import { NextSteps } from "./NextSteps";
import { MeetingsScreen, MissionScreen, OfferScreen, PitchScreen, ReferentScreen, ValueScreen, type ScreenProps } from "./screens";
import { Avatar, FOCUS, Hint } from "./ui";

const SIMPLE: Partial<Record<ScreenKey, (p: ScreenProps) => React.ReactElement>> = {
    pitch: PitchScreen, mission: MissionScreen, offer: OfferScreen, referent: ReferentScreen,
    value: ValueScreen, meetings: MeetingsScreen,
};

type SaveState = { kind: "idle" | "saving" | "error"; at: number | null };

/** 0 until mounted, so the server render and the first client render agree. */
function useNow(ms: number) {
    const [now, setNow] = useState(0);
    useEffect(() => {
        const tick = () => setNow(Date.now());
        const first = setTimeout(tick, 0);
        const id = setInterval(tick, ms);
        return () => {
            clearTimeout(first);
            clearInterval(id);
        };
    }, [ms]);
    return now;
}

export function OnboardingPortal({ token, view }: { token: string; view: PortalView }) {
    const brand = useBrand();
    const [answers, setAnswers] = useState<Answers>(view.state.answers);
    const [screen, setScreen] = useState<ScreenKey>(view.state.screen);
    const [prefilled, setPrefilled] = useState(view.state.prefilled);
    const [started, setStarted] = useState(!!view.state.updatedAt || !!view.state.submittedAt);
    const [submittedAt, setSubmittedAt] = useState(view.state.submittedAt);
    const [issues, setIssues] = useState<string[]>([]);
    const [save, setSave] = useState<SaveState>({ kind: "idle", at: view.state.updatedAt ? Date.parse(view.state.updatedAt) : null });
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const dirty = useRef(false);
    const payload = useRef({ answers, screen });
    payload.current = { answers, screen };
    const now = useNow(5_000);

    const index = SCREENS.findIndex((s) => s.key === screen);
    const step = SCREENS[index].step;
    const stepIndex = STEPS.findIndex((s) => s.key === step);

    const flush = useCallback(async (keepalive = false) => {
        // After approval the server keeps only the « Prochaines étapes » fields.
        if (!dirty.current) return;
        dirty.current = false;
        setSave((s) => ({ ...s, kind: "saving" }));
        try {
            const res = await fetch(`/api/public/onboarding/${token}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload.current),
                keepalive,
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setPrefilled(json.data.prefilled);
            setSave({ kind: "idle", at: Date.now() });
        } catch {
            dirty.current = true;
            setSave((s) => ({ ...s, kind: "error" }));
        }
    }, [token]);

    // Debounced autosave; retries on the next change or every 10 s after an error.
    useEffect(() => {
        if (!started) return;
        const t = setTimeout(() => void flush(), 700);
        return () => clearTimeout(t);
    }, [answers, screen, started, flush]);
    useEffect(() => {
        if (save.kind !== "error") return;
        const t = setTimeout(() => void flush(), 10_000);
        return () => clearTimeout(t);
    }, [save.kind, flush]);
    useEffect(() => {
        const onHide = () => void flush(true);
        window.addEventListener("pagehide", onHide);
        return () => window.removeEventListener("pagehide", onHide);
    }, [flush]);

    const update = useCallback((fn: (a: Answers) => void) => {
        setAnswers((prev) => {
            const next = structuredClone(prev);
            fn(next);
            return next;
        });
        dirty.current = true;
        setIssues([]);
    }, []);

    const go = (key: ScreenKey) => {
        setScreen(key);
        dirty.current = true;
        setIssues([]);
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    const next = () => {
        const problems = screenIssues(screen, answers);
        if (problems.length) {
            setIssues(problems);
            return;
        }
        if (index < SCREENS.length - 1) go(SCREENS[index + 1].key);
    };
    const back = () => index > 0 && go(SCREENS[index - 1].key);

    const submit = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            dirty.current = true;
            await flush();
            const res = await fetch(`/api/public/onboarding/${token}/submit`, { method: "POST" });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Validation impossible");
            setSubmittedAt(json.data.submittedAt);
            window.scrollTo({ top: 0 });
        } catch (e) {
            setSubmitError(e instanceof Error ? e.message : "Validation impossible, réessayez.");
        } finally {
            setSubmitting(false);
        }
    };

    const manager = view.accountManager?.name ?? null;
    const savedAgo = save.at && now ? Math.max(1, Math.round((now - save.at) / 1000)) : null;
    const savedLabel = save.kind === "saving" ? "Enregistrement…"
        : save.kind === "error" ? "Hors ligne, nouvel essai…"
        : savedAgo === null ? "Enregistrement automatique"
        : savedAgo < 60 ? `Enregistré il y a ${savedAgo} s` : `Enregistré il y a ${Math.round(savedAgo / 60)} min`;
    const hasPrefill = prefilled.some((p) =>
        (screen === "pitch" && p === "company.pitch") || (screen === "targets" && p === "segments")
        || (screen === "referent" && p === "referent.email"));

    // ── Welcome ──
    if (!started) {
        return (
            <div className="min-h-dvh bg-canvas">
                <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-12">
                    <BrandLogo height={36} priority />
                    <h1 className="mt-10 font-display text-[clamp(2.2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tight text-ink">
                        Bienvenue, <span className="text-primary">{view.clientName}</span>.
                    </h1>
                    <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-3">
                        Quelques questions pour préparer votre campagne avec {brand.name}. Comptez environ {minutesLeft(0)} minutes ; tout est enregistré automatiquement, vous pouvez reprendre quand vous voulez.
                    </p>
                    {(view.welcomeMessage || manager) && (
                        <figure className="mt-8 flex gap-4 rounded-[20px] border border-line bg-surface p-5">
                            {manager && <Avatar name={manager} size={44} />}
                            <div>
                                {view.welcomeMessage && <blockquote className="text-[15px] leading-relaxed text-ink-2">{view.welcomeMessage}</blockquote>}
                                {manager && <figcaption className="mt-2 text-sm font-semibold text-ink">{manager} <span className="font-normal text-ink-3">· votre contact chez {brand.name}</span></figcaption>}
                            </div>
                        </figure>
                    )}
                    <ol className="mt-8 grid gap-3 sm:grid-cols-4">
                        {STEPS.map((s, i) => (
                            <li key={s.key} className="flex items-center gap-2.5 text-sm font-semibold text-ink-2 sm:flex-col sm:items-start">
                                <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">{i + 1}</span>
                                {s.label}
                            </li>
                        ))}
                    </ol>
                    <button
                        type="button"
                        onClick={() => { setStarted(true); dirty.current = true; }}
                        className={cn("mt-10 inline-flex w-fit items-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-bold text-primary-fg shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--brand-primary)_70%,transparent)] hover:bg-primary-hover", FOCUS)}
                    >
                        Commencer <ArrowRight className="size-5" aria-hidden />
                    </button>
                </div>
            </div>
        );
    }

    const Simple = SIMPLE[screen];
    const isReview = screen === "review" && !submittedAt;

    return (
        <div className="min-h-dvh bg-canvas">
            {/* Header */}
            <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
                <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
                    <div className="w-auto lg:w-[248px]"><BrandLogo height={30} priority /></div>
                    <p className="hidden min-w-0 truncate text-[15px] font-semibold text-ink md:block">
                        Onboarding <span className="text-ink-4">·</span> <span className="text-ink-3">{view.clientName}</span>
                    </p>
                    <span
                        className={cn(
                            "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                            save.kind === "error" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700",
                        )}
                        role="status"
                        aria-live="polite"
                    >
                        {save.kind === "saving" ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
                            : save.kind === "error" ? <CloudOff className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                        {submittedAt && save.at === null ? "Validé" : savedLabel}
                    </span>
                    {manager && (
                        <span className="hidden items-center gap-2.5 border-l border-line pl-4 text-sm lg:flex">
                            <Avatar name={manager} size={34} />
                            <span><span className="font-semibold text-ink">{manager.split(/\s+/)[0]}</span><span className="text-ink-3">, votre contact</span></span>
                        </span>
                    )}
                </div>
            </header>

            <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
                {/* Step rail */}
                <nav aria-label="Étapes" className="hidden border-r border-line bg-surface/60 lg:block">
                    <ol className="sticky top-16 space-y-1 p-5">
                        {STEPS.map((s, i) => {
                            const done = !!submittedAt || isStepDone(s.key, answers);
                            const current = s.key === step && !submittedAt;
                            const first = SCREENS.find((x) => x.step === s.key)!.key;
                            return (
                                <li key={s.key} className="relative">
                                    {i > 0 && <span aria-hidden className={cn("absolute -top-2 left-[29px] h-3 w-0.5", done || current ? "bg-primary" : "bg-line")} />}
                                    <button
                                        type="button"
                                        disabled={!!submittedAt}
                                        onClick={() => go(first)}
                                        aria-current={current ? "step" : undefined}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-semibold transition-colors",
                                            current ? "bg-primary-50 text-primary-900" : "text-ink-2 hover:bg-surface-2",
                                            FOCUS,
                                        )}
                                    >
                                        <span className={cn(
                                            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                                            done ? "bg-primary text-primary-fg" : current ? "bg-primary text-primary-fg" : "border-2 border-line text-ink-3",
                                        )}>
                                            {done && !current ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                                        </span>
                                        {s.label}
                                    </button>
                                </li>
                            );
                        })}
                        {submittedAt && (
                            <li className="relative">
                                <span aria-hidden className="absolute -top-2 left-[29px] h-3 w-0.5 bg-primary" />
                                <span aria-current="step" className="flex w-full items-center gap-3 rounded-2xl bg-primary-50 px-3 py-3 text-[15px] font-semibold text-primary-900">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"><ListChecks className="size-4" aria-hidden /></span>
                                    Prochaines étapes
                                </span>
                            </li>
                        )}
                    </ol>
                </nav>

                <main className="min-w-0 px-4 pb-36 pt-8 sm:px-8 lg:pt-12">
                    {/* Mobile step indicator */}
                    <p className={cn("mb-6 text-xs font-bold uppercase tracking-[0.12em] text-ink-3 lg:hidden", submittedAt && "hidden")}>
                        Étape {stepIndex + 1} sur {STEPS.length} · {STEPS[stepIndex].label}
                    </p>

                    <div key={screen} className="motion-safe:animate-[ds-enter_.25s_ease-out]">
                        {submittedAt ? (
                            <NextSteps view={view} answers={answers} update={update} />
                        ) : isReview ? (
                            <ReviewScreen
                                token={token}
                                view={view}
                                answers={answers}
                                onEdit={go}
                                onSubmit={submit}
                                submitting={submitting}
                                error={submitError}
                            />
                        ) : screen === "targets" ? (
                            <TargetsScreen token={token} answers={answers} update={update} />
                        ) : Simple ? (
                            <Simple answers={answers} update={update} clientName={view.clientName} />
                        ) : null}
                    </div>

                    {hasPrefill && !isReview && !submittedAt && (
                        <div className="mx-auto mt-6 max-w-3xl">
                            <Hint icon={Info}>Pré-rempli par {brand.name} : vérifiez et corrigez si besoin.</Hint>
                        </div>
                    )}
                    {issues.length > 0 && (
                        <div className="mx-auto mt-6 max-w-3xl rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200" role="alert">
                            {issues.map((m) => <p key={m}>{m}</p>)}
                        </div>
                    )}
                </main>
            </div>

            {/* Bottom bar */}
            {!isReview && !submittedAt && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md lg:left-[280px]">
                    <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-8">
                        <div className="hidden min-w-0 flex-1 sm:block">
                            <div className="h-2 max-w-md overflow-hidden rounded-full bg-surface-3">
                                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(((index + 1) / SCREENS.length) * 100)}%` }} />
                            </div>
                            <p className="mt-1.5 text-sm text-ink-3">Étape {stepIndex + 1} sur {STEPS.length} · environ {minutesLeft(index)} min restantes</p>
                        </div>
                        <div className="ml-auto flex gap-3">
                            <button type="button" onClick={back} disabled={index === 0} className={cn("inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3 font-bold text-ink hover:bg-surface-2 disabled:opacity-40", FOCUS)}>
                                <ArrowLeft className="size-4" aria-hidden /> Retour
                            </button>
                            <button type="button" onClick={next} className={cn("inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-primary-fg shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--brand-primary)_70%,transparent)] hover:bg-primary-hover", FOCUS)}>
                                {SCREENS[index + 1]?.key === "review" ? "Vérifier mes réponses" : "Continuer"} <ArrowRight className="size-4" aria-hidden />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
