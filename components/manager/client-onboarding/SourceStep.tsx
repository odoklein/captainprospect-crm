"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardPaste, Clock, ExternalLink, Mic, PenLine, RefreshCw, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { FIELD_BASE, FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import type { SourceMode } from "./form";
import { SourcePeek } from "./ui";

// ============================================
// TYPES (shapes of /api/leexi/calls and /api/leexi/calls/[id])
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
}

const MODES: Array<{ value: SourceMode; title: string; text: string; icon: typeof Mic }> = [
    { value: "leexi", title: "Appel Leexi", text: "Choisir l'appel de closing : résumé, playbook et tâches Leexi sont lus par l'IA.", icon: Mic },
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
                        </button>
                    );
                })}
            </div>

            {props.hasExtraction && props.staleExtraction && mode !== "manual" && (
                <Callout tone="warning" title="Le texte a changé depuis l'analyse">
                    Relancez l&apos;analyse pour que la fiche reflète le nouveau texte. Vos corrections déjà faites sont conservées.
                </Callout>
            )}

            {mode === "leexi" && <LeexiPanel {...props} />}
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
                className={cn(FIELD_BASE, "min-h-56 resize-y px-3.5 py-3 text-sm leading-relaxed")}
            />
            <p className={cn("text-xs", length > 0 && length < MIN_RECAP ? "text-danger-ink" : "text-ink-3")}>
                {length.toLocaleString("fr-FR")} caractères
                {length > 0 && length < MIN_RECAP ? ` · ${MIN_RECAP} minimum` : " · plus le récap est complet, moins il reste à saisir"}
            </p>
        </div>
    );
}

// ============================================
// LEEXI
// ============================================

function LeexiPanel({ recapText, onRecapChange, loadedCall, onCallLoaded, autoLoadCallId, onModeChange }: SourceStepProps) {
    const [query, setQuery] = useState("");
    const [period, setPeriod] = useState<Period>("180");
    const [calls, setCalls] = useState<LeexiCallItem[]>([]);
    const [searched, setSearched] = useState<{ q: string; scanned?: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [editText, setEditText] = useState(false);
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
            const res = await fetch(`/api/leexi/calls?${params}`);
            const json = await res.json();
            if (seq !== reqSeq.current) return;
            if (!json.success) {
                setError(json.error || "Leexi est indisponible.");
                setCalls([]);
                return;
            }
            setCalls(json.data.calls ?? []);
            setWarning(json.data.warning ?? null);
            setSearched({ q: q.trim(), scanned: json.data.scanned });
        } catch {
            if (seq === reqSeq.current) setError("Impossible de joindre le serveur.");
        } finally {
            if (seq === reqSeq.current) setLoading(false);
        }
    }, []);

    const loadCall = useCallback(
        async (id: string) => {
            setLoadingId(id);
            setError(null);
            try {
                const res = await fetch(`/api/leexi/calls/${encodeURIComponent(id)}`);
                const json = await res.json();
                if (!json.success) {
                    setError(json.error || "Impossible de charger cet appel.");
                    return;
                }
                if (json.data.warning) setWarning(json.data.warning);
                onCallLoaded({ call: json.data.call, recapText: json.data.recapText, websiteHint: json.data.websiteHint ?? "" });
                setEditText(false);
            } catch {
                setError("Impossible de joindre le serveur.");
            } finally {
                setLoadingId(null);
            }
        },
        [onCallLoaded],
    );

    // Recent calls on open; a call passed by the clients page loads directly.
    useEffect(() => {
        void search("", "180");
        if (autoLoadCallId && autoLoadCallId !== loadedCall?.call.id) void loadCall(autoLoadCallId);
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
            {warning && <Callout tone="warning" title="Clé Leexi à mettre à jour">{warning}</Callout>}

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
                        aria-label="Rechercher un appel Leexi"
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
                    title="Leexi ne répond pas comme prévu"
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
                            ? "Recherche dans Leexi…"
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
                <ul className="max-h-[300px] divide-y divide-line-subtle overflow-y-auto" aria-busy={loading}>
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
                    {calls.map((call) => {
                        const selected = loadedCall?.call.id === call.id;
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
            </div>

            {loadedCall && (
                <div className="space-y-3 rounded-panel border border-primary-200 bg-primary-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{loadedCall.call.title}</p>
                            <p className="mt-0.5 text-xs text-ink-3">
                                {[fmtDate(loadedCall.call.date), fmtDuration(loadedCall.call.duration), loadedCall.call.users.length ? `avec ${loadedCall.call.users.join(", ")}` : ""]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>
                        {loadedCall.call.url && (
                            <a
                                href={loadedCall.call.url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn("inline-flex items-center gap-1 rounded-md text-xs font-medium text-link hover:underline", FOCUS_RING)}
                            >
                                Ouvrir dans Leexi <ExternalLink className="size-3" aria-hidden />
                            </a>
                        )}
                    </div>
                    {loadedCall.call.importedClient && (
                        <Callout tone="info">
                            Cet appel a déjà servi à créer {loadedCall.call.importedClient.name}. Vérifiez qu&apos;il ne s&apos;agit pas du même client.
                        </Callout>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant={loadedCall.call.summary ? "success" : "warning"} dot>
                            {loadedCall.call.summary ? "Résumé Leexi" : "Pas de résumé : transcription utilisée"}
                        </Badge>
                        {loadedCall.call.salesPlaybook && <Badge variant="success" dot>Playbook Leexi</Badge>}
                        {loadedCall.call.followUpTasks.length > 0 && (
                            <Badge variant="default" dot>
                                {loadedCall.call.followUpTasks.length} tâche{loadedCall.call.followUpTasks.length > 1 ? "s" : ""} de suivi
                            </Badge>
                        )}
                        {loadedCall.call.customers.length > 0 && (
                            <Badge variant="default" dot>
                                {loadedCall.call.customers.length} participant{loadedCall.call.customers.length > 1 ? "s" : ""} client
                            </Badge>
                        )}
                    </div>
                    {loadedCall.call.preview && <p className="line-clamp-3 text-xs leading-relaxed text-ink-2">{loadedCall.call.preview}</p>}
                    {editText ? (
                        <textarea
                            value={recapText}
                            onChange={(e) => onRecapChange(e.target.value)}
                            rows={10}
                            aria-label="Texte envoyé à l'IA"
                            className={cn(FIELD_BASE, "resize-y px-3.5 py-2.5 text-xs leading-relaxed")}
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
