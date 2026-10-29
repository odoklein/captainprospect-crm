"use client";

/**
 * Head of a folder home: folder tile, inline rename (GENERAL folders; a CLIENT
 * folder is named after its client), counts that jump to their tab, archive,
 * and the folder instructions editor (debounced autosave, token meter).
 */

import { createElement, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
    Archive,
    ArchiveRestore,
    BarChart3,
    BookOpen,
    Brain,
    Briefcase,
    Building2,
    Calendar,
    ChevronDown,
    FileText,
    Flag,
    Folder,
    Globe,
    Heart,
    Layers,
    LayoutGrid,
    Lightbulb,
    Mail,
    Megaphone,
    MessageSquare,
    Pencil,
    Phone,
    Rocket,
    ScrollText,
    ShieldCheck,
    Star,
    Target,
    Users,
    type LucideIcon,
} from "lucide-react";
import type { FolderDetail } from "@/lib/assistant/api-contract";
import { useFolderMutations } from "@/lib/assistant/client/folder-hooks";
import { CARD, FOCUS, ICON_BUTTON, IconTile, SECONDARY_BUTTON, Shimmer, StatusPill, relativeTime, type AccueilTone } from "@/components/accueil/AccueilUI";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import { liveTokens, savedAgoLabel, tokenMeter, type FolderTabId } from "./logic";

// ============================================
// Folder glyph (also used by the command palette)
// ============================================

const ICONS: Record<string, LucideIcon> = {
    building2: Building2,
    building: Building2,
    folder: Folder,
    briefcase: Briefcase,
    target: Target,
    users: Users,
    rocket: Rocket,
    star: Star,
    bookopen: BookOpen,
    filetext: FileText,
    megaphone: Megaphone,
    lightbulb: Lightbulb,
    phone: Phone,
    mail: Mail,
    calendar: Calendar,
    barchart3: BarChart3,
    chart: BarChart3,
    globe: Globe,
    heart: Heart,
    shieldcheck: ShieldCheck,
    flag: Flag,
    layers: Layers,
    layoutgrid: LayoutGrid,
};

const TONES: AccueilTone[] = ["emerald", "amber", "rose", "indigo", "teal", "violet", "slate"];
const DERIVED: AccueilTone[] = ["indigo", "teal", "emerald", "amber", "rose", "slate"];

export function folderIcon(kind: "CLIENT" | "GENERAL", icon: string | null): LucideIcon {
    const key = (icon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return ICONS[key] ?? (kind === "CLIENT" ? Building2 : Folder);
}

/** Tone or CSS colour of a folder: a tone name, a hex, a --ds token, else derived from the name. */
export function folderColor(color: string | null, name: string): { tone: AccueilTone } | { css: string } {
    const c = (color ?? "").trim();
    if ((TONES as string[]).includes(c)) return { tone: c as AccueilTone };
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return { css: c };
    if (c.startsWith("--")) return { css: `var(${c})` };
    if (c.startsWith("ds-")) return { css: `var(--${c})` };
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return { tone: DERIVED[h % DERIVED.length] };
}

export function FolderGlyph({
    kind,
    icon,
    color,
    name,
    size = "sm",
}: {
    kind: "CLIENT" | "GENERAL";
    icon: string | null;
    color: string | null;
    name: string;
    size?: "sm" | "lg" | "xs";
}) {
    const Icon = folderIcon(kind, icon);
    const resolved = folderColor(color, name);
    if ("tone" in resolved && size !== "xs") return <IconTile icon={Icon} tone={resolved.tone} size={size} />;
    const style: CSSProperties | undefined = "css" in resolved ? { background: resolved.css } : undefined;
    const toneClass = "tone" in resolved ? TILE_BG[resolved.tone] : "";
    return (
        <div
            aria-hidden
            style={style}
            className={cn(
                "flex flex-shrink-0 items-center justify-center text-white shadow-xs",
                size === "lg" ? "h-12 w-12 rounded-2xl" : size === "sm" ? "h-8 w-8 rounded-xl" : "h-6 w-6 rounded-lg",
                toneClass,
            )}
        >
            {createElement(Icon, { className: size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-3.5 w-3.5", "aria-hidden": true })}
        </div>
    );
}

const TILE_BG: Record<AccueilTone, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-600",
    indigo: "bg-primary-600",
    teal: "bg-teal-500",
    violet: "bg-accent-600",
    slate: "bg-zinc-900",
};

// ============================================
// Header
// ============================================

export function FolderHeaderSkeleton() {
    return (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement du dossier">
            <div className="flex items-center gap-4">
                <Shimmer className="h-12 w-12" />
                <div className="flex-1 space-y-2">
                    <Shimmer className="h-3 w-24 rounded-md" />
                    <Shimmer className="h-6 w-56 rounded-lg" />
                </div>
            </div>
            <Shimmer className="h-14 w-full" />
        </div>
    );
}

/** Head of the agency view (no folder). */
export function AgencyHeader() {
    return (
        <header className="flex items-center gap-4 motion-safe:animate-ds-enter">
            <IconTile icon={Globe} tone="indigo" size="lg" />
            <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-4">Captain AI</p>
                <h1 className="truncate text-xl font-black tracking-tight text-ink sm:text-2xl">Vue agence</h1>
                <p className="mt-0.5 text-xs font-semibold text-ink-3">Conversations hors dossier et mémoire commune de l&apos;agence.</p>
            </div>
        </header>
    );
}

const COUNTS: Array<{ tab: FolderTabId; key: keyof FolderDetail["counts"]; icon: LucideIcon; one: string; many: string }> = [
    { tab: "conversations", key: "conversations", icon: MessageSquare, one: "conversation", many: "conversations" },
    { tab: "memoire", key: "memories", icon: Brain, one: "souvenir", many: "souvenirs" },
    { tab: "fichiers", key: "files", icon: FileText, one: "fichier", many: "fichiers" },
    { tab: "tableau", key: "pins", icon: LayoutGrid, one: "épingle", many: "épingles" },
];

export function FolderHeader({ detail, onTabChange }: { detail: FolderDetail; onTabChange(tab: FolderTabId): void }) {
    const { rename, archive, unarchive } = useFolderMutations(detail.id);
    const toast = useToast();
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const isGeneral = detail.kind === "GENERAL";
    const panelId = useId();

    const doArchive = async () => {
        setArchiving(true);
        try {
            await archive();
            setConfirmArchive(false);
            toast.addToast({
                type: "success",
                title: "Dossier archivé",
                message: `« ${detail.name} » n'apparaît plus dans la barre latérale.`,
                duration: 7000,
                action: {
                    label: "Annuler",
                    onClick: () => {
                        unarchive().catch((e: Error) => toast.error("Restauration impossible", e.message));
                    },
                },
            });
        } catch (e) {
            toast.error("Archivage impossible", (e as Error).message);
        } finally {
            setArchiving(false);
        }
    };

    const doUnarchive = async () => {
        try {
            await unarchive();
            toast.success("Dossier restauré");
        } catch (e) {
            toast.error("Restauration impossible", (e as Error).message);
        }
    };

    const missionLabel =
        detail.kind === "CLIENT"
            ? detail.missions.length === 0
                ? "Dossier client"
                : `Dossier client · ${detail.missions.length} mission${detail.missions.length > 1 ? "s" : ""}`
            : "Dossier";

    return (
        <header className="space-y-4 motion-safe:animate-ds-enter">
            <div className="flex items-start gap-3 sm:gap-4">
                <FolderGlyph kind={detail.kind} icon={detail.icon} color={detail.color} name={detail.name} size="lg" />
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-4">{missionLabel}</p>
                    <InlineTitle
                        name={detail.name}
                        editable={isGeneral && !detail.archivedAt}
                        lockedHint={detail.kind === "CLIENT" ? "Le nom suit la fiche client." : undefined}
                        onSave={async (name) => {
                            try {
                                await rename(name);
                            } catch (e) {
                                toast.error("Renommage impossible", (e as Error).message);
                            }
                        }}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {COUNTS.map(({ tab, key, icon: Icon, one, many }) => {
                            const n = detail.counts[key] ?? 0;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => onTabChange(tab)}
                                    className={cn(
                                        "inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[11px] font-bold text-ink-2 shadow-2xs",
                                        "transition-[border-color,color] duration-150 ease-[var(--ease-snappy)] hover:border-line-strong hover:text-ink",
                                        FOCUS,
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 text-ink-4" aria-hidden />
                                    <span className="tabular-nums">{n.toLocaleString("fr-FR")}</span> {n > 1 ? many : one}
                                </button>
                            );
                        })}
                        {detail.hasAgentActivity && (
                            <button type="button" onClick={() => onTabChange("agent")} className={cn("rounded-full", FOCUS)}>
                                <StatusPill tone="violet" pulse icon={AiMark}>
                                    Agent : à examiner
                                </StatusPill>
                            </button>
                        )}
                        {detail.lastActivityAt && (
                            <span className="ml-1 text-[11px] font-semibold text-ink-4">Actif {relativeTime(detail.lastActivityAt)}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                        type="button"
                        className={cn(SECONDARY_BUTTON, "hidden sm:inline-flex")}
                        aria-expanded={instructionsOpen}
                        aria-controls={panelId}
                        onClick={() => setInstructionsOpen((v) => !v)}
                    >
                        <ScrollText className="h-3.5 w-3.5" aria-hidden />
                        Instructions
                    </button>
                    {isGeneral && !detail.archivedAt && (
                        <button type="button" className={ICON_BUTTON} aria-label="Archiver le dossier" title="Archiver le dossier" onClick={() => setConfirmArchive(true)}>
                            <Archive className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            </div>

            {detail.archivedAt && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 motion-safe:animate-ds-pop">
                    <p className="text-xs font-semibold text-warning-ink">Dossier archivé {relativeTime(detail.archivedAt)}. Il reste consultable, mais n&apos;apparaît plus dans la barre latérale.</p>
                    <button type="button" className={SECONDARY_BUTTON} onClick={doUnarchive}>
                        <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                        Restaurer
                    </button>
                </div>
            )}

            <InstructionsPanel key={detail.id} detail={detail} open={instructionsOpen} onToggle={() => setInstructionsOpen((v) => !v)} panelId={panelId} />

            <ConfirmModal
                isOpen={confirmArchive}
                onClose={() => setConfirmArchive(false)}
                onConfirm={doArchive}
                isLoading={archiving}
                variant="warning"
                title={`Archiver « ${detail.name} » ?`}
                message="Le dossier quitte la barre latérale. Ses conversations, souvenirs et fichiers sont conservés et tu pourras le restaurer."
                confirmText="Archiver"
            />
        </header>
    );
}

// ============================================
// Inline title
// ============================================

function InlineTitle({ name, editable, lockedHint, onSave }: { name: string; editable: boolean; lockedHint?: string; onSave(name: string): Promise<void> }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const commit = () => {
        const next = value.trim().replace(/\s+/g, " ");
        setEditing(false);
        if (next && next !== name) void onSave(next.slice(0, 80));
        else setValue(name);
    };

    const titleClass = "text-xl font-black tracking-tight text-ink sm:text-2xl";

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={value}
                maxLength={80}
                aria-label="Nom du dossier"
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        setValue(name);
                        setEditing(false);
                    }
                }}
                className={cn(titleClass, "-mx-1.5 w-full rounded-lg border border-primary-300 bg-surface px-1.5 py-0 outline-none ring-4 ring-primary-500/12")}
            />
        );
    }

    if (!editable) {
        return (
            <h1 className={cn(titleClass, "truncate")} title={lockedHint}>
                {name}
            </h1>
        );
    }

    return (
        <h1 className="min-w-0">
            <button
                type="button"
                onClick={() => {
                    setValue(name);
                    setEditing(true);
                }}
                className={cn(titleClass, "group -mx-1.5 inline-flex max-w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-surface-3/70", FOCUS)}
                aria-label={`Renommer le dossier « ${name} »`}
            >
                <span className="truncate">{name}</span>
                <Pencil className="h-4 w-4 flex-shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
            </button>
        </h1>
    );
}

// ============================================
// Instructions
// ============================================

/** Clock read outside render (event handlers, effects, timers). */
const nowMs = () => Date.now();

type SaveState ={ kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

function InstructionsPanel({ detail, open, onToggle, panelId }: { detail: FolderDetail; open: boolean; onToggle(): void; panelId: string }) {
    const { saveInstructions } = useFolderMutations(detail.id);
    const [text, setText] = useState(detail.instructions ?? "");
    const [state, setState] = useState<SaveState>({ kind: "idle" });
    const [now, setNow] = useState(() => Date.now());
    // Last text the server accepted, with its token count: state for the meter, ref for the async save.
    const [savedSnapshot, setSavedSnapshot] = useState<{ text: string; tokens: number }>(() => ({ text: detail.instructions ?? "", tokens: detail.instructionsTokens }));
    const saved = useRef(savedSnapshot);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seq = useRef(0);
    const latest = useRef(text);

    const max = detail.instructionsMaxTokens;
    const tokens = liveTokens(text, savedSnapshot);
    const meter = tokenMeter(tokens, max);

    const save = useCallback(async () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const value = latest.current;
        if (value === saved.current.text) {
            setState((s) => (s.kind === "dirty" ? { kind: "idle" } : s));
            return;
        }
        const id = ++seq.current;
        setState({ kind: "saving" });
        try {
            const res = await saveInstructions(value);
            saved.current = { text: value, tokens: res?.instructionsTokens ?? liveTokens(value, saved.current) };
            setSavedSnapshot(saved.current);
            if (id === seq.current) {
                const at = nowMs();
                setNow(at);
                setState(latest.current === value ? { kind: "saved", at } : { kind: "dirty" });
            }
        } catch (e) {
            if (id === seq.current) setState({ kind: "error", message: (e as Error).message });
        }
    }, [saveInstructions]);

    const onChange = (value: string) => {
        latest.current = value;
        setText(value);
        setState({ kind: "dirty" });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 800);
    };

    // Flush a pending edit when the panel goes away (folder switch, navigation).
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    });
    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
                void saveRef.current();
            }
        },
        [],
    );

    // « il y a 2 s » ticks while fresh.
    useEffect(() => {
        if (state.kind !== "saved") return;
        const id = setInterval(() => setNow(Date.now()), Date.now() - state.at < 60_000 ? 1000 : 30_000);
        return () => clearInterval(id);
    }, [state, now]);

    const hasText = !!(detail.instructions ?? "").trim() || !!text.trim();
    const preview = text.trim().split("\n")[0];
    const fill = meter.level === "over" ? "bg-danger" : meter.level === "warn" ? "bg-warning" : "bg-primary-500";
    const meterText = meter.level === "over" ? "text-danger-ink" : meter.level === "warn" ? "text-warning-ink" : "text-ink-3";

    return (
        <section className={cn(CARD, "overflow-hidden rounded-2xl")}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60", FOCUS, "focus-visible:ring-inset focus-visible:ring-offset-0")}
            >
                <ScrollText className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block text-xs font-extrabold text-ink">Instructions du dossier</span>
                    <span className="block truncate text-[11px] font-semibold text-ink-3">
                        {hasText ? preview || "…" : "Des consignes que Captain suit dans chaque conversation de ce dossier."}
                    </span>
                </span>
                <SaveBadge state={state} now={now} />
                <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-snappy)]", open && "rotate-180")} aria-hidden />
            </button>
            <div
                id={panelId}
                className={cn("grid transition-[grid-template-rows] duration-300 ease-[var(--ease-snappy)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
            >
                <div className="min-h-0 overflow-hidden" inert={!open || undefined}>
                    <div className="space-y-2.5 border-t border-line-subtle px-4 pb-4 pt-3">
                        <label htmlFor={`${panelId}-ta`} className="sr-only">
                            Instructions du dossier
                        </label>
                        <textarea
                            id={`${panelId}-ta`}
                            value={text}
                            rows={5}
                            onChange={(e) => onChange(e.target.value)}
                            onBlur={() => {
                                if (timer.current) void save();
                            }}
                            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                                    e.preventDefault();
                                    void save();
                                }
                            }}
                            placeholder={
                                detail.kind === "CLIENT"
                                    ? "Ex. : Le client vise les DAF de PME industrielles. Toujours chiffrer les RDV par mission, tutoyer l'équipe interne."
                                    : "Ex. : Réponds en listes courtes, cite les fichiers du dossier, signale toute donnée manquante."
                            }
                            aria-invalid={meter.level === "over" || state.kind === "error" || undefined}
                            aria-describedby={`${panelId}-meter`}
                            className={cn(
                                "min-h-28 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-2xs placeholder:text-ink-4",
                                "transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12",
                                meter.level === "over" && "border-danger focus:border-danger focus:ring-danger/15",
                            )}
                        />
                        <div id={`${panelId}-meter`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <div
                                className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-3"
                                role="meter"
                                aria-label="Taille des instructions"
                                aria-valuemin={0}
                                aria-valuemax={max}
                                aria-valuenow={Math.min(tokens, max)}
                                aria-valuetext={`${tokens} jetons sur ${max}`}
                            >
                                <div className={cn("h-full rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-snappy)]", fill)} style={{ width: `${meter.pct}%` }} />
                            </div>
                            <span className={cn("text-[11px] font-bold tabular-nums", meterText)}>
                                {tokens.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")} jetons
                            </span>
                        </div>
                        {meter.level === "over" && state.kind !== "error" && (
                            <p className="text-[11px] font-semibold text-danger-ink">Au-delà de la limite : raccourcis les instructions pour qu&apos;elles soient enregistrées.</p>
                        )}
                        {state.kind === "error" && (
                            <p role="alert" className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-danger-ink motion-safe:animate-ds-pop">
                                Non enregistré : {state.message}
                                <button type="button" onClick={() => void save()} className={cn("rounded-md px-1.5 py-0.5 font-bold underline underline-offset-2 hover:bg-danger-soft", FOCUS)}>
                                    Réessayer
                                </button>
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function SaveBadge({ state, now }: { state: SaveState; now: number }) {
    const base = "hidden flex-shrink-0 items-center gap-1.5 text-[11px] font-semibold sm:inline-flex";
    if (state.kind === "saving")
        return (
            <span className={cn(base, "text-ink-3")} aria-live="polite">
                <Spinner className="h-3 w-3" label="Enregistrement" />
                Enregistrement…
            </span>
        );
    if (state.kind === "dirty") return <span className={cn(base, "text-ink-4")}>Modifications…</span>;
    if (state.kind === "saved")
        return (
            <span className={cn(base, "text-success-ink motion-safe:animate-ds-pop")} aria-live="polite">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                {savedAgoLabel(state.at, now)}
            </span>
        );
    if (state.kind === "error")
        return (
            <span className={cn(base, "text-danger-ink")} aria-live="assertive">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
                Non enregistré
            </span>
        );
    return null;
}
