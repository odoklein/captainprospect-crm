"use client";

// ============================================
// MODE FOCUS — the step before a session. Three questions, answered with real
// data only: which mission, what is waiting in its queue (missed meetings and
// due callbacks first, the way the session will serve them), and is the
// phone ready (number, microphone). Entrée starts.
// ============================================

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Crosshair, Mic, MicOff, Phone, Play, Rows3, Zap } from "lucide-react";
import { Kbd, SegmentedControl } from "@/components/ui";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { cleanLabel } from "@/lib/telephony/audio-prefs";
import { cn } from "@/lib/utils";
import { queueSummary, type QueueRowSummaryLike } from "@/lib/focus/focus";
import { displayPhone } from "@/lib/sdr-queue/display";

export interface FocusMission {
    id: string;
    name: string;
    client?: { name: string } | null;
}

type MicState = "granted" | "prompt" | "denied" | "unknown";

/** Microphone permission, live (the SDR may allow it from the address bar meanwhile). */
function useMicPermission(): MicState {
    const [state, setState] = useState<MicState>("unknown");
    useEffect(() => {
        let status: PermissionStatus | null = null;
        let cancelled = false;
        const read = () => status && setState(status.state as MicState);
        navigator.permissions
            ?.query({ name: "microphone" as PermissionName })
            .then((s) => {
                if (cancelled) return;
                status = s;
                read();
                s.addEventListener("change", read);
            })
            .catch(() => setState("unknown"));
        return () => {
            cancelled = true;
            status?.removeEventListener("change", read);
        };
    }, []);
    return state;
}

const nf = new Intl.NumberFormat("fr-FR");

/** Focus: one prospect at a time, the SDR calls · Power: called automatically one after another · Parallèle: several lines, one conversation. */
export type CallingMode = "focus" | "power" | "parallel";

export interface ParallelAvailability {
    available: boolean;
    reason: string | null;
    maxLines: number | null;
}

export function FocusLaunch({
    missions,
    missionId,
    onMission,
    autoDialSeconds,
    softphoneOn,
    callerId,
    onStart,
    mode,
    onMode,
    parallel,
}: {
    missions: FocusMission[] | null;
    missionId: string | null;
    onMission: (id: string) => void;
    autoDialSeconds: number;
    softphoneOn: boolean;
    callerId: string | null;
    onStart: () => void;
    mode: CallingMode;
    onMode: (m: CallingMode) => void;
    parallel: ParallelAvailability | null;
}) {
    const mic = useMicPermission();
    const { openAudioSettings, audioPrefs } = useSoftphone();
    const { data: rows, isLoading: queueLoading, isError: queueError } = useQuery({
        queryKey: ["focus-launch-queue", missionId],
        enabled: !!missionId,
        staleTime: 30_000,
        queryFn: async () => {
            const res = await fetch(`/api/sdr/action-queue?missionId=${encodeURIComponent(missionId!)}&channel=CALL`, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) throw new Error(json?.error || "Erreur");
            return (json.data?.items ?? []) as QueueRowSummaryLike[];
        },
    });
    const summary = useMemo(() => (rows ? queueSummary(rows) : null), [rows]);
    const canStart = !!missionId && summary?.total !== 0;

    // Entrée starts from anywhere on the screen (except a focused control).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
            const el = e.target as HTMLElement | null;
            // A focused mission (radio) starts too: pick with ↑ / ↓, go with Entrée.
            if (el && el !== document.body && el.closest("button:not([role=radio]), a, input, textarea, select, [role=switch]")) return;
            if (!canStart) return;
            e.preventDefault();
            onStart();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [canStart, onStart]);

    // ↑ / ↓ inside the mission list (radio group pattern).
    const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
        if (!missions?.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        const i = Math.max(0, missions.findIndex((m) => m.id === missionId));
        const next = missions[(i + (e.key === "ArrowDown" ? 1 : -1) + missions.length) % missions.length];
        onMission(next.id);
        e.currentTarget.querySelector<HTMLElement>(`[data-mission="${next.id}"]`)?.focus();
    };

    const number = callerId ? displayPhone(callerId)?.text ?? callerId : null;
    const queueLines = summary
        ? ([
              ["RDV manqués à recaler", summary.absent, "var(--color-danger)"],
              ["Rappels du jour", summary.callbacksDue, "var(--color-warning)"],
              ["Jamais contactés", summary.fresh, "var(--color-success)"],
              ["Relances et nouvelles tentatives", summary.retries, "var(--color-ink-4)"],
          ] as const)
        : [];

    return (
        <div className="flex h-full min-h-0 w-full overflow-y-auto bg-canvas">
            <div className="cp-rise m-auto w-full max-w-[860px] px-6 py-10">
                <header className="mb-7">
                    <p className="text-[12.5px] font-medium text-ink-3">Mode Focus</p>
                    <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">Une session d&apos;appels, sans distraction</h1>
                    <p className="mt-1.5 max-w-[560px] text-[13.5px] leading-relaxed text-ink-3">
                        Un prospect à la fois, dans l&apos;ordre de votre file : les RDV manqués et les rappels du jour d&apos;abord. Le résultat se choisit au clavier, le suivant est déjà là.
                    </p>
                </header>

                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_290px]">
                    {/* ── Mission + options + start ── */}
                    <section aria-labelledby="focus-mission" className="rounded-xl border border-line bg-surface">
                        <h2 id="focus-mission" className="px-4 pb-2 pt-4 text-[13px] font-semibold text-ink">
                            Mission
                        </h2>
                        {missions === null ? (
                            <div className="space-y-1.5 px-4 pb-4">
                                <div className="cp-shimmer h-12 rounded-lg" />
                                <div className="cp-shimmer h-12 rounded-lg" />
                            </div>
                        ) : missions.length === 0 ? (
                            <p className="mx-4 mb-4 rounded-lg bg-surface-2 px-3 py-4 text-[13px] text-ink-3">
                                Aucune mission d&apos;appel dans votre planning du jour. Votre manager l&apos;ajoute depuis le planning.
                            </p>
                        ) : (
                            <ul role="radiogroup" aria-label="Mission" onKeyDown={onListKey} className="space-y-0.5 px-2 pb-2">
                                {missions.map((m) => {
                                    const on = missionId === m.id;
                                    return (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                role="radio"
                                                data-mission={m.id}
                                                aria-checked={on}
                                                tabIndex={on || (!missionId && m === missions[0]) ? 0 : -1}
                                                onClick={() => onMission(m.id)}
                                                className={cn(
                                                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                                    on ? "bg-primary-50" : "hover:bg-surface-2",
                                                )}
                                            >
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                                                        on ? "border-primary bg-primary" : "border-line-strong bg-surface",
                                                    )}
                                                >
                                                    {on && <span className="size-1.5 rounded-full bg-primary-fg" />}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[13.5px] font-semibold text-ink">{m.name}</span>
                                                    {m.client?.name && <span className="block truncate text-[12px] text-ink-3">{m.client.name}</span>}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <div className="border-t border-line-subtle px-4 py-3.5">
                            <div className="flex items-center justify-between gap-3">
                                <p id="focus-mode" className="text-[13px] font-medium text-ink">Mode d&apos;appel</p>
                                <SegmentedControl<CallingMode>
                                    size="sm"
                                    ariaLabel="Mode d'appel"
                                    value={mode}
                                    onChange={onMode}
                                    options={[
                                        { value: "focus", label: "Focus", icon: Crosshair },
                                        { value: "power", label: "Power", icon: Zap, disabled: !softphoneOn },
                                        { value: "parallel", label: "Parallèle", icon: Rows3, disabled: !softphoneOn || !parallel?.available },
                                    ]}
                                />
                            </div>
                            <p id="focus-mode-hint" className="mt-2 text-[12px] leading-relaxed text-ink-3" aria-live="polite">
                                {!softphoneOn
                                    ? "Power et Parallèle nécessitent le téléphone intégré : les numéros s'ouvriront dans votre application d'appel."
                                    : mode === "focus"
                                      ? "Vous lancez chaque appel. Le prochain prospect, choisi pour vous, s'affiche dès que vous qualifiez."
                                      : mode === "power"
                                        ? `Chaque prospect est appelé ${autoDialSeconds} s après son affichage. Échap annule, P met en pause.`
                                        : `Jusqu'à ${parallel?.maxLines ?? 2} lignes sonnent en même temps ; seule une vraie conversation vous est transmise, les messageries sont écartées.`}
                            </p>
                            {softphoneOn && parallel && !parallel.available && parallel.reason && (
                                <p className="mt-1 text-[11.5px] text-ink-4">Parallèle indisponible · {parallel.reason}</p>
                            )}
                        </div>

                        <div className="border-t border-line-subtle p-4">
                            <button
                                type="button"
                                onClick={onStart}
                                disabled={!canStart}
                                className="cp-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Play className="size-4" aria-hidden /> Démarrer la session
                                <Kbd className="ml-1 border-white/25 bg-white/10 text-primary-fg">Entrée</Kbd>
                            </button>
                        </div>
                    </section>

                    {/* ── What's waiting + readiness ── */}
                    <aside className="space-y-4">
                        <section aria-labelledby="focus-queue" className="rounded-xl border border-line bg-surface p-4">
                            <h2 id="focus-queue" className="text-[13px] font-semibold text-ink">
                                Au programme
                            </h2>
                            {!missionId ? (
                                <p className="mt-2 text-[12.5px] text-ink-3">Choisissez une mission pour voir sa file.</p>
                            ) : queueLoading ? (
                                <div className="mt-3 space-y-2">
                                    <div className="cp-shimmer h-8 w-24 rounded" />
                                    <div className="cp-shimmer h-3 w-full rounded" />
                                    <div className="cp-shimmer h-3 w-4/5 rounded" />
                                </div>
                            ) : queueError || !summary ? (
                                <p className="mt-2 text-[12.5px] text-ink-3">File indisponible pour le moment ; la session la chargera au démarrage.</p>
                            ) : summary.total === 0 ? (
                                <p className="mt-2 text-[12.5px] text-ink-3">Personne à appeler sur cette mission pour l&apos;instant : les prospects appelés ces dernières 24 h reviennent d&apos;eux-mêmes.</p>
                            ) : (
                                <>
                                    <p className="mt-2 flex items-baseline gap-1.5">
                                        <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">{nf.format(summary.total)}</span>
                                        <span className="text-[12.5px] text-ink-3">prospect{summary.total > 1 ? "s" : ""} dans la file</span>
                                    </p>
                                    <ul className="mt-3 space-y-1.5">
                                        {queueLines
                                            .filter(([, n]) => n > 0)
                                            .map(([label, n, color]) => (
                                                <li key={label} className="flex items-center gap-2 text-[12.5px]">
                                                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                                                    <span className="min-w-0 flex-1 truncate text-ink-2">{label}</span>
                                                    <span className="tabular-nums font-medium text-ink">{nf.format(n)}</span>
                                                </li>
                                            ))}
                                    </ul>
                                    {summary.callbacksLater > 0 && (
                                        <p className="mt-3 border-t border-line-subtle pt-2.5 text-[11.5px] text-ink-4">
                                            + {nf.format(summary.callbacksLater)} rappel{summary.callbacksLater > 1 ? "s" : ""} planifié{summary.callbacksLater > 1 ? "s" : ""} plus tard
                                        </p>
                                    )}
                                </>
                            )}
                        </section>

                        <section aria-labelledby="focus-ready" className="rounded-xl border border-line bg-surface p-4">
                            <h2 id="focus-ready" className="text-[13px] font-semibold text-ink">
                                Avant de commencer
                            </h2>
                            <ul className="mt-2.5 space-y-2.5">
                                <li className="flex items-start gap-2.5">
                                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", softphoneOn ? "bg-success-soft text-success-ink" : "bg-surface-3 text-ink-3")}>
                                        {softphoneOn ? <Check className="size-3" aria-hidden /> : <Phone className="size-3" aria-hidden />}
                                    </span>
                                    <div className="min-w-0 text-[12.5px]">
                                        <p className="font-medium text-ink">{softphoneOn ? "Téléphone intégré prêt" : "Appels via votre application"}</p>
                                        <p className="text-ink-3">
                                            {softphoneOn ? (number ? `Vos prospects voient le ${number}` : "Appels depuis le navigateur") : "Aucun numéro Twilio attribué (Paramètres → Téléphonie)."}
                                        </p>
                                    </div>
                                </li>
                                {softphoneOn && (
                                    <li className="flex items-start gap-2.5">
                                        <span
                                            className={cn(
                                                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                                                mic === "granted" ? "bg-success-soft text-success-ink" : mic === "denied" ? "bg-danger-soft text-danger-ink" : "bg-surface-3 text-ink-3",
                                            )}
                                        >
                                            {mic === "granted" ? <Check className="size-3" aria-hidden /> : mic === "denied" ? <MicOff className="size-3" aria-hidden /> : <Mic className="size-3" aria-hidden />}
                                        </span>
                                        <div className="min-w-0 text-[12.5px]">
                                            <p className="font-medium text-ink">
                                                {mic === "granted" ? "Micro autorisé" : mic === "denied" ? "Micro bloqué" : "Micro à autoriser"}
                                            </p>
                                            <p className="text-ink-3">
                                                {mic === "granted"
                                                    ? audioPrefs.input?.label
                                                        ? `Micro : ${cleanLabel(audioPrefs.input.label)}`
                                                        : "Micro par défaut du système."
                                                    : mic === "denied"
                                                      ? "Autorisez-le dans la barre d'adresse (icône cadenas), puis revenez."
                                                      : "Le navigateur le demandera au premier appel."}
                                            </p>
                                            <button type="button" onClick={openAudioSettings} className="mt-1 text-[12px] font-medium text-primary hover:underline">
                                                Tester l&apos;audio et choisir le casque
                                            </button>
                                        </div>
                                    </li>
                                )}
                            </ul>
                        </section>
                    </aside>
                </div>

                <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>Espace</Kbd> appeler
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>1</Kbd>–<Kbd>9</Kbd> résultat
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>Entrée</Kbd> enregistrer et suivant
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>S</Kbd> passer
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>?</Kbd> tous les raccourcis
                    </span>
                </p>
            </div>
        </div>
    );
}
