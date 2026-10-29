"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClipboardPaste, Clock, ExternalLink, Mic, PenLine, RefreshCw, Search, Users } from "lucide-react";
import { NotetakerLogo, NotetakerLogoStack } from "@/components/notetakers/NotetakerLogo";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { FIELD_BASE, FOCUS_RING } from "@/components/ui/recipes";
import { NOTETAKER_IDS } from "@/lib/notetakers/catalog";
import { NOTETAKER_GUIDES, NOTETAKER_HOW_IT_WORKS, notetakerSettingsHref } from "@/lib/notetakers/guide";
import { cn } from "@/lib/utils";
import type { SourceMode } from "./form";
import { SourcePeek } from "./ui";

// ============================================
// TYPES (shapes of /api/notetakers/[provider]/calls and …/calls/[id];
// Leexi's own fields — deal, sales playbook — stay empty for the others)
// ============================================

export interface LeexiCallItem {
    id: string;
    title: string;
    date: string | null;
    duration: number;
    url: string | null;
    type: string | null;
    companyName: string;
    customers: Array<{ name: string; email: string | null; phone: string | null }>;
    users: string[];
    deal: { name: string; stage: string | null; status: string | null } | null;
    hasSummary: boolean;
    hasSalesPlaybook: boolean;
    preview: string;
    importedClient?: { id: string; name: string } | null;
}

export interface LeexiCallLoaded {
    call: LeexiCallItem & { summary: string; salesPlaybook: string; followUpTasks: string[]; hasTranscript: boolean };
    recapText: string;
    websiteHint: string;
    /** Note-taker the call comes from (none in drafts saved before the other note-takers: Leexi). */
    provider?: NotetakerChoice;
}

/** A meeting recorder (Leexi, Grain, Fireflies…). */
export interface NotetakerChoice {
    id: string;
    label: string;
}

interface NotetakerStatus extends NotetakerChoice {
    configured: boolean;
}

export const LEEXI: NotetakerChoice = { id: "leexi", label: "Leexi" };

const MODES: Array<{ value: SourceMode; title: string; text: string; icon: typeof Mic }> = [
    { value: "leexi", title: "Appel enregistré", text: "Choisissez l'appel de closing : l'IA lit le résumé, les tâches et au besoin la transcription.", icon: Mic },
    { value: "paste", title: "Coller un récap", text: "Notes d'appel, compte rendu, thread email : l'IA en tire la fiche et le playbook.", icon: ClipboardPaste },
    { value: "manual", title: "Saisie manuelle", text: "Remplir la fiche soi-même, sans IA.", icon: PenLine },
];

const PERIODS = [
    { value: "30", label: "30 j" },
    { value: "90", label: "3 mois" },
    { value: "180", label: "6 mois" },
    { value: "365", label: "1 an" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const MIN_RECAP = 20;
// The call list grows in the wizard body (no scroll box of its own: two nested scrollbars),
// so it shows a page of calls at a time.
const CALLS_PAGE = 6;

function fmtDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDuration(seconds: number): string {
    if (!seconds) return "";
    const min = Math.round(seconds / 60);
    return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

function customerLine(call: LeexiCallItem): string {
    return call.customers
        .slice(0, 3)
        .map((c) => {
            const domain = c.email?.split("@")[1];
            return domain ? `${c.name} · ${domain}` : c.name;
        })
        .join(", ");
}

// ============================================
// STEP
// ============================================

interface SourceStepProps {
    mode: SourceMode | null;
    onModeChange: (mode: SourceMode) => void;
    /** Note-taker of the « Appel enregistré » source. */
    provider: NotetakerChoice;
    onProviderChange: (provider: NotetakerChoice) => void;
    recapText: string;
    onRecapChange: (text: string) => void;
    loadedCall: LeexiCallLoaded | null;
    onCallLoaded: (loaded: LeexiCallLoaded | null) => void;
    /** Load this call as soon as the Leexi panel opens (from the clients page). */
    autoLoadCallId?: string | null;
    hasExtraction: boolean;
    staleExtraction: boolean;
    notice?: ReactNode;
}

export function SourceStep(props: SourceStepProps) {
    const { mode, onModeChange, notice } = props;
    return (
        <div className="space-y-5">
            {notice}
            <div role="radiogroup" aria-label="Source de l'onboarding" className="grid gap-3 sm:grid-cols-3">
                {MODES.map((m) => {
                    const active = mode === m.value;
                    const Icon = m.icon;
                    return (
                        <button
                            key={m.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onModeChange(m.value)}
                            className={cn(
                                "group flex flex-col items-start gap-2 rounded-panel border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150",
                                FOCUS_RING,
                                active ? "border-primary-300 bg-primary-50 shadow-xs" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                            )}
                        >
                            <span className={cn("inline-flex size-9 items-center justify-center rounded-control", active ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-2")}>
                                <Icon className="size-[18px]" aria-hidden />
                            </span>
                            <span className="text-sm font-semibold text-ink">{m.title}</span>
                            <span className="text-xs leading-relaxed text-ink-3">{m.text}</span>
                            {m.value === "leexi" && <NotetakerLogoStack ids={NOTETAKER_IDS} max={5} className="mt-auto pt-1" />}
                        </button>
                    );
                })}
            </div>

            {props.hasExtraction && props.staleExtraction && mode !== "manual" && (
                <Callout tone="warning" title="Le texte a changé depuis l'analyse">
                    Relancez l&apos;analyse pour que la fiche reflète le nouveau texte. Vos corrections déjà faites sont conservées.
                </Callout>
            )}

            {mode === "leexi" && <RecordedCallSource {...props} />}
            {mode === "paste" && <PastePanel {...props} />}
            {mode === "manual" && (
                <Callout tone="neutral" icon={PenLine}>
                    Les étapes suivantes reprennent la fiche client, la cible et le discours, puis le lancement. Tout reste modifiable après création.
                </Callout>
            )}
        </div>
    );
}

// ============================================
// PASTE
// ============================================

function PastePanel({ recapText, onRecapChange }: SourceStepProps) {
    const length = recapText.trim().length;
    return (
        <div className="space-y-2">
            <label htmlFor="onboarding-recap" className="text-[13px] font-medium text-ink-2">
                Récap à analyser
            </label>
            <textarea
                id="onboarding-recap"
                value={recapText}
                onChange={(e) => onRecapChange(e.target.value)}
                rows={12}
                autoFocus
                placeholder={"Collez le compte rendu de l'appel de closing : contexte, cible, volumes, objections, contacts, date de démarrage…"}
                className={cn(FIELD_BASE, "field-sizing-content min-h-56 resize-y px-3.5 py-3 text-sm leading-relaxed")}
            />
            <p className={cn("text-xs", length > 0 && length < MIN_RECAP ? "text-danger-ink" : "text-ink-3")}>
                {length.toLocaleString("fr-FR")} caractères
                {length > 0 && length < MIN_RECAP ? ` · ${MIN_RECAP} minimum` : " · plus le récap est complet, moins il reste à saisir"}
            </p>
        </div>
    );
}

// ============================================
// RECORDED CALL — pick the note-taker, then the call
// ============================================

function RecordedCallSource(props: SourceStepProps) {
    const { provider, onProviderChange, onModeChange } = props;
    const [tools, setTools] = useState<NotetakerStatus[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [checking, setChecking] = useState(false);
    const aliveRef = useRef(true);

    const load = useCallback(async () => {
        setChecking(true);
        try {
            const json = await fetch("/api/notetakers").then((r) => r.json());
            if (!aliveRef.current) return;
            if (json?.success && Array.isArray(json.data)) setTools(json.data as NotetakerStatus[]);
            else setLoadError(true);
        } catch {
            if (aliveRef.current) setLoadError(true);
        } finally {
            if (aliveRef.current) setChecking(false);
        }
    }, []);

    useEffect(() => {
        aliveRef.current = true;
        void load();
        return () => {
            aliveRef.current = false;
        };
    }, [load]);

    const connected = tools?.filter((t) => t.configured) ?? [];
    const others = tools?.filter((t) => !t.configured) ?? [];

    // The tool picked last may have been disconnected since: fall back to the first connected one.
    useEffect(() => {
        if (!tools || connected.length === 0 || connected.some((t) => t.id === provider.id)) return;
        onProviderChange({ id: connected[0].id, label: connected[0].label });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tools]);

    // The key goes in from a Paramètres tab: coming back to this one checks again.
    const noneConnected = !!tools && connected.length === 0;
    useEffect(() => {
        if (!noneConnected) return;
        const onFocus = () => void load();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [noneConnected, load]);

    if (loadError) {
        // Leexi worked before the other tools existed: keep it usable.
        return <CallsPanel key={LEEXI.id} {...props} provider={LEEXI} />;
    }
    if (!tools) {
        return (
            <div className="flex items-center justify-center gap-2 rounded-panel border border-line px-4 py-10 text-sm text-ink-3">
                <Spinner /> Outils d&apos;enregistrement…
            </div>
        );
    }
    if (connected.length === 0) {
        return <ConnectNotetaker tools={tools} checking={checking} onRecheck={() => void load()} onPaste={() => onModeChange("paste")} />;
    }

    const current = connected.find((t) => t.id === provider.id) ?? connected[0];
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {connected.length > 1 ? (
                    <SegmentedControl
                        ariaLabel="Outil d'enregistrement"
                        options={connected.map((t) => ({
                            value: t.id,
                            label: (
                                <span className="inline-flex items-center gap-1.5">
                                    <NotetakerLogo id={t.id} size="xs" />
                                    {t.label}
                                </span>
                            ),
                        }))}
                        value={current.id}
                        onChange={(id) => {
                            const t = connected.find((c) => c.id === id);
                            if (t) onProviderChange({ id: t.id, label: t.label });
                        }}
                        size="sm"
                    />
                ) : (
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2">
                        <NotetakerLogo id={current.id} size="sm" />
                        Appels {current.label}
                    </span>
                )}
                {others.length > 0 && (
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                        Aussi compatibles
                        <NotetakerLogoStack ids={others.map((t) => t.id)} max={4} />
                        <Link
                            href={notetakerSettingsHref()}
                            target="_blank"
                            rel="noopener"
                            className={cn("inline-flex items-center gap-1 rounded-md font-medium text-link hover:underline", FOCUS_RING)}
                        >
                            Connecter un autre outil <ExternalLink className="size-3" aria-hidden />
                        </Link>
                    </span>
                )}
            </div>
            <CallsPanel key={current.id} {...props} provider={{ id: current.id, label: current.label }} />
        </div>
    );
}

/** No note-taker connected yet: what the import does, and one click per tool to its key in Paramètres. */
function ConnectNotetaker({
    tools,
    checking,
    onRecheck,
    onPaste,
}: {
    tools: NotetakerStatus[];
    checking: boolean;
    onRecheck: () => void;
    onPaste: () => void;
}) {
    return (
        <div className="space-y-4 rounded-panel border border-line bg-surface p-5">
            <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">Connectez l&apos;outil qui enregistre vos appels de closing</p>
                <p className="max-w-2xl text-xs leading-relaxed text-ink-3">
                    Une clé API, ajoutée une fois pour toute l&apos;agence. Vos appels récents s&apos;affichent ensuite ici : vous choisissez
                    le bon, l&apos;IA pré-remplit la fiche client, la cible et le discours à partir du résumé, des tâches et au besoin de la
                    transcription. Il ne reste qu&apos;à vérifier.
                </p>
            </div>

            <ol className="grid gap-2 sm:grid-cols-3">
                {NOTETAKER_HOW_IT_WORKS.map((step, i) => (
                    <li key={step} className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">
                            {i + 1}
                        </span>
                        {step}
                    </li>
                ))}
            </ol>

            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Outils compatibles">
                {tools.map((t) => {
                    const guide = NOTETAKER_GUIDES[t.id as keyof typeof NOTETAKER_GUIDES];
                    return (
                        <li key={t.id}>
                            <Link
                                href={notetakerSettingsHref(t.id)}
                                target="_blank"
                                rel="noopener"
                                className={cn(
                                    "group flex items-center gap-3 rounded-control border border-line px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2",
                                    FOCUS_RING,
                                )}
                            >
                                <NotetakerLogo id={t.id} size="md" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-ink">{t.label}</span>
                                    <span className="block text-xs leading-snug text-ink-3">{guide?.tagline}</span>
                                    {guide?.plan && <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">API : {guide.plan}</span>}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-3 group-hover:text-link">
                                    Connecter <ExternalLink className="size-3" aria-hidden />
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>

            <div className="flex flex-col gap-3 border-t border-line-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-3">
                    La clé s&apos;ajoute dans Paramètres › Intégrations, dans un nouvel onglet. Revenez ici : la liste se met à jour.
                </p>
                <div className="flex shrink-0 gap-2">
                    <Button size="xs" variant="ghost" onClick={onRecheck} isLoading={checking} leftIcon={<RefreshCw className="size-3.5" aria-hidden />}>
                        Vérifier à nouveau
                    </Button>
                    <Button size="xs" variant="secondary" onClick={onPaste}>
                        Coller le récap à la place
                    </Button>
                </div>
            </div>
        </div>
    );
}

function CallsPanel({ provider, recapText, onRecapChange, loadedCall, onCallLoaded, autoLoadCallId, onModeChange }: SourceStepProps) {
    const label = provider.label;
    const base = `/api/notetakers/${encodeURIComponent(provider.id)}/calls`;
    // A call loaded from another tool stays loaded, but is not this list's selection.
    const loadedHere = loadedCall && (loadedCall.provider?.id ?? LEEXI.id) === provider.id ? loadedCall : null;
    const [query, setQuery] = useState("");
    const [period, setPeriod] = useState<Period>("180");
    const [calls, setCalls] = useState<LeexiCallItem[]>([]);
    const [searched, setSearched] = useState<{ q: string; scanned?: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [editText, setEditText] = useState(false);
    const [shown, setShown] = useState(CALLS_PAGE);
    const reqSeq = useRef(0);

    const search = useCallback(async (q: string, days: Period) => {
        const seq = ++reqSeq.current;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (q.trim()) {
                params.set("q", q.trim());
                params.set("days", days);
            }
            const res = await fetch(`${base}?${params}`);
            const json = await res.json();
            if (seq !== reqSeq.current) return;
            if (!json.success) {
                setError(json.error || `${label} est indisponible.`);
                setCalls([]);
                return;
            }
            setCalls(json.data.calls ?? []);
            setShown(CALLS_PAGE);
            setWarning(json.data.warning ?? null);
            setSearched({ q: q.trim(), scanned: json.data.scanned });
        } catch {
            if (seq === reqSeq.current) setError("Impossible de joindre le serveur.");
        } finally {
            if (seq === reqSeq.current) setLoading(false);
        }
    }, [base, label]);

    const loadCall = useCallback(
        async (id: string) => {
            setLoadingId(id);
            setError(null);
            try {
                const res = await fetch(`${base}/${encodeURIComponent(id)}`);
                const json = await res.json();
                if (!json.success) {
                    setError(json.error || "Impossible de charger cet appel.");
                    return;
                }
                if (json.data.warning) setWarning(json.data.warning);
                onCallLoaded({ call: json.data.call, recapText: json.data.recapText, websiteHint: json.data.websiteHint ?? "", provider });
                setEditText(false);
            } catch {
                setError("Impossible de joindre le serveur.");
            } finally {
                setLoadingId(null);
            }
        },
        [base, onCallLoaded, provider],
    );

    // Recent calls on open; a call passed by the clients page (always Leexi) loads directly.
    useEffect(() => {
        void search("", "180");
        if (provider.id === LEEXI.id && autoLoadCallId && autoLoadCallId !== loadedCall?.call.id) void loadCall(autoLoadCallId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Typing searches after a pause, Entrée at once; clearing the box shows the recent calls again.
    const firstRun = useRef(true);
    useEffect(() => {
        if (firstRun.current) {
            firstRun.current = false;
            return;
        }
        const t = setTimeout(() => void search(query, period), query.trim() ? 600 : 0);
        return () => clearTimeout(t);
    }, [query, period, search]);

    return (
        <div className="space-y-4">
            {warning && <Callout tone="warning" title={`Clé ${label} à mettre à jour`}>{warning}</Callout>}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void search(query, period);
                            }
                        }}
                        aria-label={`Rechercher un appel ${label}`}
                        placeholder="Entreprise, participant, email, deal…"
                        className={cn(FIELD_BASE, "h-10 pl-10 pr-3.5 text-sm")}
                    />
                </div>
                <SegmentedControl
                    ariaLabel="Période de recherche"
                    options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                    value={period}
                    onChange={setPeriod}
                    size="sm"
                />
            </div>

            {error && (
                <Callout
                    tone="danger"
                    title={`${label} ne répond pas comme prévu`}
                    action={
                        <Button size="xs" variant="secondary" onClick={() => onModeChange("paste")}>
                            Coller le récap à la place
                        </Button>
                    }
                >
                    {error}
                </Callout>
            )}

            <div className="overflow-hidden rounded-panel border border-line">
                <div className="flex items-center justify-between gap-2 border-b border-line-subtle bg-surface-2 px-4 py-2 text-xs text-ink-3">
                    <span>
                        {loading
                            ? `Recherche dans ${label}…`
                            : searched?.q
                                ? `${calls.length} appel${calls.length > 1 ? "s" : ""} pour « ${searched.q} »${searched.scanned ? ` · ${searched.scanned} parcourus` : ""}`
                                : `${calls.length} appels récents`}
                    </span>
                    <button
                        type="button"
                        onClick={() => void search(query, period)}
                        className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-ink-3 hover:text-ink", FOCUS_RING)}
                    >
                        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
                        Actualiser
                    </button>
                </div>
                <ul className="divide-y divide-line-subtle" aria-busy={loading}>
                    {loading && calls.length === 0 && (
                        <li className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-ink-3">
                            <Spinner /> Chargement des appels…
                        </li>
                    )}
                    {!loading && calls.length === 0 && !error && (
                        <li className="px-4 py-10 text-center text-sm text-ink-3">
                            Aucun appel trouvé{searched?.q ? " : élargissez la période ou essayez un autre mot." : "."}
                        </li>
                    )}
                    {calls.slice(0, shown).map((call) => {
                        const selected = loadedHere?.call.id === call.id;
                        return (
                            <li key={call.id}>
                                <button
                                    type="button"
                                    onClick={() => void loadCall(call.id)}
                                    disabled={loadingId !== null}
                                    aria-pressed={selected}
                                    className={cn(
                                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors disabled:cursor-wait",
                                        FOCUS_RING,
                                        "focus-visible:ring-inset focus-visible:ring-offset-0",
                                        selected ? "bg-primary-50" : "hover:bg-surface-2",
                                    )}
                                >
                                    <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-control", selected ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-3")}>
                                        {loadingId === call.id ? <Spinner /> : <Mic className="size-4" aria-hidden />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <span className="truncate text-sm font-medium text-ink">{call.title}</span>
                                            {call.hasSalesPlaybook && <Badge size="sm" variant="accent">Playbook Leexi</Badge>}
                                            {!call.hasSummary && <Badge size="sm" variant="warning">Sans résumé</Badge>}
                                            {call.importedClient && <Badge size="sm" variant="info">Déjà importé · {call.importedClient.name}</Badge>}
                                        </span>
                                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                                            {call.date && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="size-3" aria-hidden />
                                                    {fmtDate(call.date)}
                                                    {call.duration ? ` · ${fmtDuration(call.duration)}` : ""}
                                                </span>
                                            )}
                                            {call.customers.length > 0 ? (
                                                <span className="inline-flex min-w-0 items-center gap-1">
                                                    <Users className="size-3 shrink-0" aria-hidden />
                                                    <span className="truncate">{customerLine(call)}</span>
                                                </span>
                                            ) : (
                                                <span className="text-ink-4">Réunion interne</span>
                                            )}
                                            {call.deal && (
                                                <span className="truncate text-ink-2">
                                                    Deal {call.deal.name}
                                                    {call.deal.stage ? ` · ${call.deal.stage}` : ""}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {calls.length > shown && (
                    <button
                        type="button"
                        onClick={() => setShown((n) => n + CALLS_PAGE)}
                        className={cn("w-full border-t border-line-subtle bg-surface-2 px-4 py-2 text-xs font-medium text-ink-3 hover:text-ink", FOCUS_RING, "focus-visible:ring-inset focus-visible:ring-offset-0")}
                    >
                        Afficher {Math.min(CALLS_PAGE, calls.length - shown)} appel{Math.min(CALLS_PAGE, calls.length - shown) > 1 ? "s" : ""} de plus · {calls.length - shown} restant{calls.length - shown > 1 ? "s" : ""}
                    </button>
                )}
            </div>

            {loadedHere && (
                <div className="space-y-3 rounded-panel border border-primary-200 bg-primary-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                            <NotetakerLogo id={provider.id} size="sm" className="mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink">{loadedHere.call.title}</p>
                                <p className="mt-0.5 text-xs text-ink-3">
                                    {[fmtDate(loadedHere.call.date), fmtDuration(loadedHere.call.duration), loadedHere.call.users.length ? `avec ${loadedHere.call.users.join(", ")}` : ""]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            </div>
                        </div>
                        {loadedHere.call.url && (
                            <a
                                href={loadedHere.call.url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn("inline-flex items-center gap-1 rounded-md text-xs font-medium text-link hover:underline", FOCUS_RING)}
                            >
                                Ouvrir dans {label} <ExternalLink className="size-3" aria-hidden />
                            </a>
                        )}
                    </div>
                    {loadedHere.call.importedClient && (
                        <Callout tone="info">
                            Cet appel a déjà servi à créer {loadedHere.call.importedClient.name}. Vérifiez qu&apos;il ne s&apos;agit pas du même client.
                        </Callout>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant={loadedHere.call.summary ? "success" : "warning"} dot>
                            {loadedHere.call.summary ? `Résumé ${label}` : loadedHere.call.hasTranscript ? "Pas de résumé : transcription utilisée" : "Ni résumé ni transcription"}
                        </Badge>
                        {loadedHere.call.salesPlaybook && <Badge variant="success" dot>Playbook Leexi</Badge>}
                        {loadedHere.call.followUpTasks.length > 0 && (
                            <Badge variant="default" dot>
                                {loadedHere.call.followUpTasks.length} tâche{loadedHere.call.followUpTasks.length > 1 ? "s" : ""} de suivi
                            </Badge>
                        )}
                        {loadedHere.call.customers.length > 0 && (
                            <Badge variant="default" dot>
                                {loadedHere.call.customers.length} participant{loadedHere.call.customers.length > 1 ? "s" : ""} client
                            </Badge>
                        )}
                    </div>
                    {loadedHere.call.preview && <p className="line-clamp-3 text-xs leading-relaxed text-ink-2">{loadedHere.call.preview}</p>}
                    {editText ? (
                        <textarea
                            value={recapText}
                            onChange={(e) => onRecapChange(e.target.value)}
                            rows={10}
                            aria-label="Texte envoyé à l'IA"
                            className={cn(FIELD_BASE, "field-sizing-content min-h-40 resize-y px-3.5 py-2.5 text-xs leading-relaxed")}
                        />
                    ) : (
                        <SourcePeek text={recapText} title="Texte envoyé à l'IA" />
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setEditText((v) => !v)}>
                        {editText ? "Terminer la modification" : "Modifier ou compléter ce texte"}
                    </Button>
                </div>
            )}
        </div>
    );
}
