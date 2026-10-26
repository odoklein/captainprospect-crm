"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, RotateCcw, X } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import Button from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { FOCUS_RING } from "@/components/ui/recipes";
import { parisDayOf } from "@/lib/onboarding/checklist-template";
import type { Playbook } from "@/lib/playbook/leexi-types";
import { cn } from "@/lib/utils";
import {
    buildCreatePayload,
    clientStepErrors,
    formValuesFromPlaybook,
    initialForm,
    mergeExtraction,
    type FormErrors,
    type MissingItem,
    type OnboardingForm,
    type SourceMode,
} from "./form";
import { ClientStep } from "./ClientStep";
import { LaunchStep } from "./LaunchStep";
import { PitchStep } from "./PitchStep";
import { SourceStep, type LeexiCallLoaded } from "./SourceStep";

// ============================================
// STEPS & DRAFT
// ============================================

const STEPS = [
    { id: "source", label: "Source" },
    { id: "client", label: "Client" },
    { id: "pitch", label: "Cible & discours" },
    { id: "launch", label: "Lancement" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const MODE_SUBTITLE: Record<SourceMode, string> = {
    leexi: "Depuis un appel Leexi",
    paste: "Depuis un récap collé",
    manual: "Saisie manuelle",
};

const DRAFT_KEY = "cp:client-onboarding-draft:v1";
const DRAFT_MAX_AGE_MS = 14 * 86_400_000;

interface WizardState {
    mode: SourceMode | null;
    stepIndex: number;
    maxVisited: number;
    form: OnboardingForm;
    recapText: string;
    loadedCall: LeexiCallLoaded | null;
    playbook: Playbook | null;
    aiValues: Partial<OnboardingForm> | null;
    extractedFrom: string | null;
}

interface StoredDraft extends WizardState {
    v: 1;
    savedAt: number;
}

function freshState(today: string): WizardState {
    return {
        mode: null,
        stepIndex: 0,
        maxVisited: 0,
        form: initialForm(today),
        recapText: "",
        loadedCall: null,
        playbook: null,
        aiValues: null,
        extractedFrom: null,
    };
}

function readDraft(): StoredDraft | null {
    try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw) as StoredDraft;
        if (d?.v !== 1 || Date.now() - d.savedAt > DRAFT_MAX_AGE_MS || !d.mode) return null;
        return d;
    } catch {
        return null;
    }
}

function writeDraft(state: WizardState) {
    try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, v: 1, savedAt: Date.now() } satisfies StoredDraft));
    } catch {
        // private mode / quota: the in-memory state still survives a close
    }
}

function clearDraft() {
    try {
        window.localStorage.removeItem(DRAFT_KEY);
    } catch {
        // ignore
    }
}

function ago(ts: number): string {
    const min = Math.round((Date.now() - ts) / 60_000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
}

interface CreationResult {
    clientId: string;
    clientName: string;
    missionName: string | null;
    interlocuteurs: number;
    emails: number;
    checklist?: { started: boolean; error?: string };
}

const EXTRACTION_STEPS = ["Lecture du compte rendu", "Identification du client et des contacts", "Cible, volumes et mission", "Rédaction des scripts et de la séquence email"];

// ============================================
// WIZARD
// ============================================

export interface ClientOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called as soon as the client exists (refresh lists). */
    onSuccess: (clientId: string) => void;
    /** « Ouvrir la fiche » on the confirmation screen. */
    onOpenClient?: (clientId: string) => void;
    /** Prefill « Coller un récap ». */
    initialRecapText?: string;
    /** Open on « Appel Leexi » with this call loaded. */
    initialLeexiCallId?: string;
}

export function ClientOnboardingModal({ isOpen, onClose, onSuccess, onOpenClient, initialRecapText, initialLeexiCallId }: ClientOnboardingModalProps) {
    const { error: toastError } = useToast();
    const today = useMemo(() => parisDayOf(new Date()), []);
    const [state, setState] = useState<WizardState>(() => freshState(today));
    const { mode, stepIndex, maxVisited, form, recapText, loadedCall, playbook, aiValues, extractedFrom } = state;
    const patch = useCallback((p: Partial<WizardState>) => setState((s) => ({ ...s, ...p })), []);

    const [autoLoadCallId, setAutoLoadCallId] = useState<string | null>(null);
    const [draftOffer, setDraftOffer] = useState<StoredDraft | null>(null);
    const [errors, setErrors] = useState<FormErrors>({});
    const [extracting, setExtracting] = useState(false);
    const [extractStep, setExtractStep] = useState(0);
    const [extractError, setExtractError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [result, setResult] = useState<CreationResult | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const step: StepId = STEPS[stepIndex].id;
    const aiMode = mode === "leexi" || mode === "paste";
    const stale = !!playbook && extractedFrom !== null && recapText.trim() !== extractedFrom.trim();
    const needsExtraction = aiMode && (!playbook || stale);
    const canAnalyse = aiMode && recapText.trim().length >= 20;

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setState(freshState(today));
        setErrors({});
        setExtractError(null);
        setSubmitError(null);
        setResult(null);
        setAutoLoadCallId(null);
        clearDraft();
    }, [today]);

    // Entry points from the clients page reset the wizard; otherwise offer the saved draft.
    useEffect(() => {
        if (!isOpen) return;
        if (initialRecapText) {
            reset();
            patch({ mode: "paste", recapText: initialRecapText });
        } else if (initialLeexiCallId) {
            reset();
            patch({ mode: "leexi" });
            setAutoLoadCallId(initialLeexiCallId);
        } else if (!state.mode && !result) {
            setDraftOffer(readDraft());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialRecapText, initialLeexiCallId]);

    // Autosave (per browser) so a reload or a closed tab loses nothing.
    useEffect(() => {
        if (!isOpen || !mode || result) return;
        const t = setTimeout(() => writeDraft(state), 800);
        return () => clearTimeout(t);
    }, [state, isOpen, mode, result]);

    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 });
    }, [stepIndex, result]);

    const set = useCallback(<K extends keyof OnboardingForm>(field: K, value: OnboardingForm[K]) => {
        setState((s) => ({ ...s, form: { ...s.form, [field]: value } }));
        setErrors((e) => (field in e ? { ...e, [field]: undefined } : e));
    }, []);

    const goTo = useCallback((index: number) => {
        setState((s) => ({ ...s, stepIndex: index, maxVisited: Math.max(s.maxVisited, index) }));
    }, []);

    const jumpTo = (target: MissingItem["step"]) => goTo(STEPS.findIndex((s) => s.id === target));

    // ============================================
    // EXTRACTION
    // ============================================

    useEffect(() => {
        if (!extracting) return;
        setExtractStep(0);
        const t = setInterval(() => setExtractStep((i) => Math.min(i + 1, EXTRACTION_STEPS.length - 1)), 7000);
        return () => clearInterval(t);
    }, [extracting]);

    const extract = async () => {
        const text = recapText.trim();
        if (text.length < 20) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setExtracting(true);
        setExtractError(null);
        try {
            const res = await fetch("/api/generate-playbook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recapText: text, internalNames: mode === "leexi" ? loadedCall?.call.users : undefined }),
                signal: controller.signal,
            });
            const json = await res.json().catch(() => null);
            if (!json?.success) {
                setExtractError(json?.error || "L'analyse a échoué.");
                return;
            }
            const pb = json.data as Playbook;
            const proposed = formValuesFromPlaybook(pb, { websiteHint: mode === "leexi" ? loadedCall?.websiteHint : undefined });
            setState((s) => ({
                ...s,
                form: mergeExtraction(s.form, proposed, s.aiValues, initialForm(today)),
                aiValues: proposed,
                playbook: pb,
                extractedFrom: text,
                stepIndex: 1,
                maxVisited: Math.max(s.maxVisited, 1),
            }));
        } catch (err) {
            if ((err as Error)?.name !== "AbortError") setExtractError("La connexion a été interrompue pendant l'analyse. Relancez-la.");
        } finally {
            setExtracting(false);
            abortRef.current = null;
        }
    };

    // ============================================
    // SUBMIT
    // ============================================

    const submit = async () => {
        const errs = clientStepErrors(form);
        if (Object.values(errs).some(Boolean)) {
            setErrors(errs);
            goTo(1);
            return;
        }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const payload = buildCreatePayload(form, playbook, {
                mode: mode ?? "manual",
                recapText: extractedFrom ?? recapText,
                leexiCall: mode === "leexi" && loadedCall
                    ? { id: loadedCall.call.id, title: loadedCall.call.title, date: loadedCall.call.date, duration: loadedCall.call.duration }
                    : null,
            });
            const res = await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => null);
            if (!json?.success) {
                setSubmitError(json?.error || "Le client n'a pas pu être créé.");
                return;
            }
            clearDraft();
            setResult({
                clientId: json.data.id,
                clientName: json.data.name,
                missionName: form.createMission ? (json.data.missions?.[0]?.name ?? null) : null,
                interlocuteurs: form.contacts.filter((c) => c.asInterlocuteur && c.name.trim()).length,
                emails: form.createMission ? (payload.emailTemplates as unknown[]).length : 0,
                checklist: json.data.checklist,
            });
            onSuccess(json.data.id);
        } catch {
            setSubmitError("Impossible de joindre le serveur.");
            toastError("Erreur", "Impossible de joindre le serveur.");
        } finally {
            setSubmitting(false);
        }
    };

    // ============================================
    // NAVIGATION
    // ============================================

    const next = () => {
        if (step === "source") {
            if (needsExtraction) void extract();
            else goTo(1);
            return;
        }
        if (step === "client") {
            const errs = clientStepErrors(form);
            if (Object.values(errs).some(Boolean)) {
                setErrors(errs);
                return;
            }
        }
        goTo(stepIndex + 1);
    };

    const restoreDraft = () => {
        if (!draftOffer) return;
        const { v: _v, savedAt: _s, ...restored } = draftOffer;
        setState(restored);
        setDraftOffer(null);
    };

    const discardDraft = () => {
        clearDraft();
        setDraftOffer(null);
    };

    const onResetClick = () => {
        if (!confirmReset) {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
            return;
        }
        setConfirmReset(false);
        reset();
    };

    const sourceText = aiMode ? extractedFrom ?? recapText : "";
    const primaryDisabled =
        extracting ||
        submitting ||
        (step === "source" && (!mode || (needsExtraction && !canAnalyse)));

    const draftNotice = draftOffer && !mode ? (
        <Callout
            tone="info"
            title="Un onboarding n'a pas été terminé"
            action={
                <>
                    <Button size="xs" variant="ghost" onClick={discardDraft}>
                        Ignorer
                    </Button>
                    <Button size="xs" variant="primary" onClick={restoreDraft}>
                        Reprendre
                    </Button>
                </>
            }
        >
            {draftOffer.form.name ? `« ${draftOffer.form.name} »` : MODE_SUBTITLE[draftOffer.mode!]}, enregistré {ago(draftOffer.savedAt)}.
        </Callout>
    ) : null;

    // ============================================
    // RENDER
    // ============================================

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            showCloseButton={false}
            closeOnOverlay={false}
            className="h-[min(90vh,880px)] max-h-[90vh]"
            contentClassName="flex min-h-0 flex-col overflow-hidden p-0"
        >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line-subtle px-5 pb-4 pt-5 sm:px-6">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-ink">{result ? "Client créé" : "Nouveau client"}</h2>
                    <p className="mt-0.5 text-sm text-ink-3">
                        {result ? result.clientName : mode ? MODE_SUBTITLE[mode] : "Choisissez d'où partir : l'IA pré-remplit la fiche, vous vérifiez."}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {mode && !result && (
                        <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="size-3.5" aria-hidden />} onClick={onResetClick}>
                            {confirmReset ? "Tout effacer ?" : "Recommencer"}
                        </Button>
                    )}
                    <IconButton icon={X} label="Fermer" onClick={onClose} />
                </div>
            </div>

            {/* Stepper */}
            {!result && (
                <nav aria-label="Étapes" className="shrink-0 border-b border-line-subtle px-5 py-3 sm:px-6">
                    <ol className="flex items-center gap-1 sm:gap-2">
                        {STEPS.map((s, i) => {
                            const current = i === stepIndex;
                            const done = i < stepIndex || (i <= maxVisited && i !== stepIndex);
                            // Before the first analysis, an AI source has nothing to show past « Source ».
                            const reachable = i <= maxVisited && !extracting && !(i > 0 && needsExtraction && !playbook);
                            return (
                                <li key={s.id} className={cn("flex items-center gap-1 sm:gap-2", i < STEPS.length - 1 && "flex-1")}>
                                    <button
                                        type="button"
                                        onClick={() => reachable && goTo(i)}
                                        disabled={!reachable}
                                        aria-current={current ? "step" : undefined}
                                        className={cn(
                                            "flex items-center gap-2 rounded-control px-1.5 py-1 text-left disabled:cursor-default",
                                            FOCUS_RING,
                                            reachable && !current && "hover:bg-surface-2",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold tabular-nums",
                                                current ? "bg-primary text-primary-fg" : done ? "bg-primary-100 text-primary-700" : "bg-surface-3 text-ink-4",
                                            )}
                                        >
                                            {done && !current ? <Check className="size-3.5" aria-hidden /> : i + 1}
                                        </span>
                                        <span className={cn("text-xs font-semibold", current ? "text-ink" : "hidden text-ink-3 sm:inline")}>{s.label}</span>
                                    </button>
                                    {i < STEPS.length - 1 && <span aria-hidden className={cn("h-px flex-1", i < maxVisited ? "bg-primary-200" : "bg-line")} />}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            )}

            {/* Body */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto bg-surface-2/40 px-5 py-5 sm:px-6">
                {result ? (
                    <DoneView result={result} />
                ) : extracting ? (
                    <ExtractingView current={extractStep} onCancel={() => abortRef.current?.abort()} />
                ) : (
                    <>
                        {extractError && step === "source" && (
                            <Callout tone="danger" title="L'analyse n'a pas abouti" className="mb-4">
                                {extractError}
                            </Callout>
                        )}
                        {step === "source" && (
                            <SourceStep
                                mode={mode}
                                onModeChange={(m) => {
                                    setDraftOffer(null);
                                    patch({ mode: m, recapText: m === "leexi" && loadedCall ? loadedCall.recapText : recapText });
                                }}
                                recapText={recapText}
                                onRecapChange={(t) => patch({ recapText: t })}
                                loadedCall={loadedCall}
                                onCallLoaded={(l) => patch({ loadedCall: l, recapText: l?.recapText ?? "" })}
                                autoLoadCallId={autoLoadCallId}
                                hasExtraction={!!playbook}
                                staleExtraction={stale}
                                notice={draftNotice}
                            />
                        )}
                        {step === "client" && <ClientStep form={form} set={set} ai={aiValues} errors={errors} sourceText={sourceText} />}
                        {step === "pitch" && <PitchStep form={form} set={set} ai={aiValues} sourceText={sourceText} />}
                        {step === "launch" && <LaunchStep form={form} set={set} ai={aiValues} today={today} mode={mode ?? "manual"} onJump={jumpTo} />}
                        {submitError && step === "launch" && (
                            <Callout tone="danger" title="Création impossible" className="mt-4">
                                {submitError}
                            </Callout>
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line-subtle bg-surface px-5 py-3.5 sm:px-6">
                {result ? (
                    <>
                        <Button variant="ghost" onClick={reset}>
                            Créer un autre client
                        </Button>
                        <Button
                            variant="primary"
                            rightIcon={<ArrowRight className="size-4" aria-hidden />}
                            onClick={() => {
                                const id = result.clientId;
                                reset();
                                if (onOpenClient) onOpenClient(id);
                                else onClose();
                            }}
                        >
                            Ouvrir la fiche client
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            {stepIndex > 0 && (
                                <Button variant="ghost" leftIcon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => goTo(stepIndex - 1)} disabled={submitting}>
                                    Retour
                                </Button>
                            )}
                            {step === "source" && playbook && !stale && aiMode && (
                                <Button variant="ghost" leftIcon={<AiMark className="size-4" aria-hidden />} onClick={() => void extract()} disabled={extracting || !canAnalyse}>
                                    Relancer l&apos;analyse
                                </Button>
                            )}
                        </div>
                        {step === "launch" ? (
                            <Button variant="primary" onClick={() => void submit()} isLoading={submitting} disabled={submitting} rightIcon={<Check className="size-4" aria-hidden />}>
                                Créer le client
                            </Button>
                        ) : step === "source" && needsExtraction ? (
                            <Button variant="accent" onClick={next} disabled={primaryDisabled} leftIcon={<AiMark className="size-4" aria-hidden />}>
                                {stale ? "Relancer l'analyse" : "Analyser avec l'IA"}
                            </Button>
                        ) : (
                            <Button variant="primary" onClick={next} disabled={primaryDisabled} rightIcon={<ArrowRight className="size-4" aria-hidden />}>
                                Continuer
                            </Button>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}

// ============================================
// EXTRACTION & DONE VIEWS
// ============================================

function ExtractingView({ current, onCancel }: { current: number; onCancel: () => void }) {
    return (
        <div className="flex h-full min-h-72 flex-col items-center justify-center gap-6 py-10 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-panel bg-accent-50 text-accent-600">
                <AiMark className="size-6" aria-hidden />
            </span>
            <div>
                <p className="text-base font-semibold text-ink">Analyse du récap en cours</p>
                <p className="mt-1 text-sm text-ink-3">Comptez 20 à 60 secondes. Tout restera modifiable.</p>
            </div>
            <ol className="w-full max-w-sm space-y-2 text-left" aria-live="polite">
                {EXTRACTION_STEPS.map((label, i) => (
                    <li key={label} className={cn("flex items-center gap-2.5 text-sm", i < current ? "text-ink-3" : i === current ? "font-medium text-ink" : "text-ink-4")}>
                        {i < current ? <Check className="size-4 text-success" aria-hidden /> : i === current ? <Spinner className="text-accent-600" /> : <span className="size-4" aria-hidden />}
                        {label}
                    </li>
                ))}
            </ol>
            <Button variant="ghost" size="sm" onClick={onCancel}>
                Annuler
            </Button>
        </div>
    );
}

function DoneView({ result }: { result: CreationResult }) {
    const lines = [
        `Client « ${result.clientName} » et sa fiche d'onboarding`,
        result.interlocuteurs ? `${result.interlocuteurs} interlocuteur${result.interlocuteurs > 1 ? "s" : ""} RDV` : null,
        result.missionName ? `Mission « ${result.missionName} » avec sa campagne` : null,
        result.emails ? `${result.emails} modèle${result.emails > 1 ? "s" : ""} d'email` : null,
        result.checklist?.started ? "Checklist d'onboarding démarrée : les premières étapes sont dans vos tâches du jour" : null,
    ].filter((l): l is string => !!l);
    return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-8 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="size-6" aria-hidden />
            </span>
            <div>
                <p className="text-lg font-semibold text-ink">{result.clientName} est prêt</p>
                <p className="mt-1 text-sm text-ink-3">La suite se passe dans la fiche client : checklist, équipe, listes.</p>
            </div>
            <ul className="w-full space-y-2 rounded-panel border border-line bg-surface p-4 text-left">
                {lines.map((l) => (
                    <li key={l} className="flex items-start gap-2 text-sm text-ink-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        {l}
                    </li>
                ))}
            </ul>
            {result.checklist && !result.checklist.started && (
                <Callout tone="warning" icon={CircleAlert} title="Checklist non démarrée" className="w-full text-left">
                    {result.checklist.error ?? "Erreur inconnue"}. Démarrez-la depuis la fiche client.
                </Callout>
            )}
        </div>
    );
}
