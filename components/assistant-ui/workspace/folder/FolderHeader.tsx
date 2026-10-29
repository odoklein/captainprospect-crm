"use client";

/**
 * Head of a folder home, on the shadcn layer: one Card with the folder glyph,
 * the inline rename (GENERAL folders; a CLIENT folder is named after its
 * client), counts that jump to their tab, the « Agent : à examiner » badge,
 * archive (AlertDialog + undo toast), and the folder instructions editor in a
 * Collapsible (debounced autosave, token meter amber at 80 %, red over).
 */

import { createElement, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
import {
    countLabel,
    folderColor,
    folderIconKey,
    instructionsPreview,
    liveTokens,
    savedAgoLabel,
    tokenMeter,
    type FolderTabId,
    type FolderTone,
} from "@/lib/assistant/client/folder-logic";
import { relativeTime } from "@/components/accueil/AccueilUI";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import { Kbd } from "@/components/ui/shadcn/kbd";
import { Progress } from "@/components/ui/shadcn/progress";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { EYEBROW, FOCUS_RING } from "@/components/ui/recipes";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { InlineTitleInput, Spinner } from "./parts";

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

export function folderIcon(kind: "CLIENT" | "GENERAL", icon: string | null): LucideIcon {
    return ICONS[folderIconKey(icon)] ?? (kind === "CLIENT" ? Building2 : Folder);
}

export { folderColor };

// Literal class strings so Tailwind's scanner sees each one.
const TILE_BG: Record<FolderTone, string> = {
    emerald: "bg-success text-white",
    amber: "bg-warning text-white",
    rose: "bg-danger text-white",
    indigo: "bg-primary-600 text-white",
    teal: "bg-info text-white",
    violet: "bg-accent text-accent-fg",
    slate: "bg-ink text-surface",
};

const GLYPH_SIZE = {
    xs: { box: "size-6 rounded-lg", icon: "size-3.5" },
    sm: { box: "size-8 rounded-[10px]", icon: "size-4" },
    lg: { box: "size-12 rounded-panel", icon: "size-6" },
} as const;

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
    const style: CSSProperties | undefined = "css" in resolved ? { background: resolved.css, color: "white" } : undefined;
    return (
        <span
            aria-hidden
            style={style}
            className={cn(
                "flex shrink-0 items-center justify-center shadow-2xs ring-1 ring-inset ring-white/15",
                GLYPH_SIZE[size].box,
                "tone" in resolved && TILE_BG[resolved.tone],
            )}
        >
            {createElement(Icon, { className: cn(GLYPH_SIZE[size].icon, size === "lg" && "stroke-[2.2]"), "aria-hidden": true })}
        </span>
    );
}

// ============================================
// Skeleton and agency head
// ============================================

export function FolderHeaderSkeleton() {
    return (
        <Card className="gap-0 py-0" aria-busy="true" aria-label="Chargement du dossier">
            <div className="flex items-start gap-4 p-5 sm:p-6">
                <Skeleton className="size-12 rounded-panel" />
                <div className="flex-1 space-y-2.5">
                    <Skeleton className="h-3 w-24 rounded-md" />
                    <Skeleton className="h-6 w-56 rounded-lg" />
                    <div className="flex gap-1.5 pt-1">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-7 w-28 rounded-chip" />
                        ))}
                    </div>
                </div>
            </div>
            <div className="border-t border-line-subtle px-5 py-3.5 sm:px-6">
                <Skeleton className="h-4 w-64 rounded-md" />
            </div>
        </Card>
    );
}

/** Head of the agency view (no folder). */
export function AgencyHeader() {
    return (
        <Card className="flex-row items-center gap-4 p-5 motion-safe:animate-ds-enter sm:p-6">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-panel bg-primary-600 text-white shadow-2xs" aria-hidden>
                <Globe className="size-6" />
            </span>
            <div className="min-w-0">
                <p className={EYEBROW}>Captain AI</p>
                <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">Vue agence</h1>
                <p className="mt-0.5 text-sm text-ink-3">Conversations hors dossier et mémoire commune de l&apos;agence.</p>
            </div>
        </Card>
    );
}

// ============================================
// Header
// ============================================

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
    const isGeneral = detail.kind === "GENERAL";

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
                : `Dossier client · ${countLabel(detail.missions.length, "mission", "missions")}`
            : "Dossier";

    return (
        <Card className="gap-0 overflow-hidden py-0 motion-safe:animate-ds-enter">
            <div className="flex items-start gap-3.5 p-5 sm:gap-4 sm:p-6">
                <FolderGlyph kind={detail.kind} icon={detail.icon} color={detail.color} name={detail.name} size="lg" />
                <div className="min-w-0 flex-1">
                    <p className={EYEBROW}>{missionLabel}</p>
                    <FolderTitle
                        name={detail.name}
                        editable={isGeneral && !detail.archivedAt}
                        lockedHint={detail.kind === "CLIENT" ? "Le nom suit la fiche client." : undefined}
                        onSave={(name) => {
                            rename(name).catch((e: Error) => toast.error("Renommage impossible", e.message));
                        }}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {COUNTS.map(({ tab, key, icon: Icon, one, many }) => (
                            <Button key={key} variant="outline" size="xs" className="rounded-chip font-semibold" onClick={() => onTabChange(tab)}>
                                <Icon className="text-ink-4" aria-hidden />
                                <span className="tabular-nums">{countLabel(detail.counts[key] ?? 0, one, many)}</span>
                            </Button>
                        ))}
                        {detail.hasAgentActivity && (
                            <Badge asChild variant="ai" className="h-7 cursor-pointer gap-1.5 px-2.5 text-xs hover:border-accent-300">
                                <button type="button" onClick={() => onTabChange("agent")}>
                                    <PulseDot />
                                    Agent : à examiner
                                </button>
                            </Badge>
                        )}
                        {detail.lastActivityAt && <span className="ml-1 text-xs text-ink-4">Actif {relativeTime(detail.lastActivityAt)}</span>}
                    </div>
                </div>
                {isGeneral && !detail.archivedAt && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Archiver le dossier" onClick={() => setConfirmArchive(true)}>
                                <Archive aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Archiver le dossier</TooltipContent>
                    </Tooltip>
                )}
            </div>

            {detail.archivedAt && (
                <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-warning-line bg-warning-soft px-5 py-3 motion-safe:animate-in motion-safe:fade-in-0 sm:px-6"
                >
                    <p className="text-xs font-medium text-warning-ink">
                        Dossier archivé {relativeTime(detail.archivedAt)}. Il reste consultable, mais n&apos;apparaît plus dans la barre latérale.
                    </p>
                    <Button variant="outline" size="xs" onClick={() => void doUnarchive()}>
                        <ArchiveRestore aria-hidden />
                        Restaurer
                    </Button>
                </div>
            )}

            <InstructionsPanel key={detail.id} detail={detail} />

            <AlertDialog open={confirmArchive} onOpenChange={(open) => !archiving && setConfirmArchive(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archiver « {detail.name} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Le dossier quitte la barre latérale. Ses conversations, souvenirs et fichiers sont conservés et tu pourras le restaurer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={archiving}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={archiving}
                            onClick={(e) => {
                                e.preventDefault();
                                void doArchive();
                            }}
                        >
                            {archiving ? <Spinner /> : <Archive aria-hidden />}
                            Archiver
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

export function PulseDot({ className }: { className?: string }) {
    return (
        <span className={cn("relative flex size-1.5 shrink-0", className)} aria-hidden>
            <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
    );
}

// ============================================
// Title (inline rename)
// ============================================

function FolderTitle({ name, editable, lockedHint, onSave }: { name: string; editable: boolean; lockedHint?: string; onSave(name: string): void }) {
    const [editing, setEditing] = useState(false);
    const titleClass = "text-xl font-bold tracking-tight text-ink sm:text-2xl";

    if (editing) {
        return (
            <InlineTitleInput
                initial={name}
                maxLength={80}
                label="Nom du dossier"
                className={cn(titleClass, "-mx-2 mt-0.5 h-9 sm:h-10")}
                onSave={(value) => {
                    const next = value.trim().replace(/\s+/g, " ").slice(0, 80);
                    if (next && next !== name) onSave(next);
                }}
                onDone={() => setEditing(false)}
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
                onClick={() => setEditing(true)}
                className={cn(
                    titleClass,
                    "group -mx-2 inline-flex max-w-full items-center gap-2 rounded-[10px] px-2 text-left transition-colors duration-150 hover:bg-surface-3",
                    FOCUS_RING,
                )}
                aria-label={`Renommer le dossier « ${name} »`}
            >
                <span className="truncate">{name}</span>
                <Pencil
                    className="size-4 shrink-0 text-ink-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden
                />
            </button>
        </h1>
    );
}

// ============================================
// Instructions
// ============================================

/** Clock read outside render (event handlers, effects, timers). */
const nowMs = () => Date.now();

type SaveState = { kind: "idle" } | { kind: "dirty" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

function InstructionsPanel({ detail }: { detail: FolderDetail }) {
    const { saveInstructions } = useFolderMutations(detail.id);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(detail.instructions ?? "");
    const [state, setState] = useState<SaveState>({ kind: "idle" });
    const [now, setNow] = useState(() => Date.now());
    // Last text the server accepted, with its token count: state for the meter, ref for the async save.
    const [savedSnapshot, setSavedSnapshot] = useState<{ text: string; tokens: number }>(() => ({
        text: detail.instructions ?? "",
        tokens: detail.instructionsTokens,
    }));
    const saved = useRef(savedSnapshot);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seq = useRef(0);
    const latest = useRef(text);
    const textareaId = `instructions-${detail.id}`;

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

    const preview = instructionsPreview(text);
    const meterFill = meter.level === "over" ? "[&>*]:bg-danger" : meter.level === "warn" ? "[&>*]:bg-warning" : "[&>*]:bg-primary";
    const meterText = meter.level === "over" ? "text-danger-ink" : meter.level === "warn" ? "text-warning-ink" : "text-ink-3";

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border-t border-line-subtle">
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2 sm:px-6",
                        FOCUS_RING,
                        "focus-visible:ring-inset focus-visible:ring-offset-0",
                    )}
                >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-ink-3" aria-hidden>
                        <ScrollText className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">Instructions du dossier</span>
                        <span className="block truncate text-xs text-ink-3">
                            {preview || "Des consignes que Captain suit dans chaque conversation de ce dossier."}
                        </span>
                    </span>
                    <SaveStatus state={state} now={now} />
                    <ChevronDown
                        className="size-4 shrink-0 text-ink-4 transition-transform duration-200 ease-snappy group-data-[state=open]:rotate-180"
                        aria-hidden
                    />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className="space-y-3 px-5 pb-5 pt-1 sm:px-6">
                    <label htmlFor={textareaId} className="sr-only">
                        Instructions du dossier
                    </label>
                    <Textarea
                        id={textareaId}
                        value={text}
                        rows={5}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={() => {
                            if (timer.current) void save();
                        }}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
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
                        aria-describedby={`${textareaId}-meter`}
                        className="max-h-80 min-h-28"
                    />
                    <div id={`${textareaId}-meter`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Progress
                            value={meter.pct}
                            aria-label="Taille des instructions"
                            aria-valuetext={`${tokens} jetons sur ${max}`}
                            className={cn("h-1.5 min-w-24 flex-1 [&>*]:motion-safe:transition-[transform,background-color]", meterFill)}
                        />
                        <span className={cn("text-xs font-medium tabular-nums", meterText)}>
                            {tokens.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")} jetons
                        </span>
                        <span className="hidden items-center gap-1 text-xs text-ink-4 sm:inline-flex">
                            <Kbd>{"Ctrl"}</Kbd>
                            <Kbd>S</Kbd>
                            enregistrer
                        </span>
                    </div>
                    {meter.level === "over" && state.kind !== "error" && (
                        <p className="text-xs font-medium text-danger-ink">Au-delà de la limite : raccourcis les instructions pour qu&apos;elles soient enregistrées.</p>
                    )}
                    {state.kind === "error" && (
                        <p role="alert" className="flex flex-wrap items-center gap-2 text-xs font-medium text-danger-ink motion-safe:animate-ds-pop">
                            Non enregistré : {state.message}
                            <Button variant="link" size="xs" className="h-auto px-0 text-danger-ink" onClick={() => void save()}>
                                Réessayer
                            </Button>
                        </p>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function SaveStatus({ state, now }: { state: SaveState; now: number }) {
    const base = "hidden shrink-0 items-center gap-1.5 text-xs font-medium sm:inline-flex";
    if (state.kind === "saving")
        return (
            <span className={cn(base, "text-ink-3")} aria-live="polite">
                <Spinner className="size-3" />
                Enregistrement…
            </span>
        );
    if (state.kind === "dirty") return <span className={cn(base, "text-ink-4")}>Modifications…</span>;
    if (state.kind === "saved")
        return (
            <span className={cn(base, "text-success-ink motion-safe:animate-ds-pop")} aria-live="polite">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                {savedAgoLabel(state.at, now)}
            </span>
        );
    if (state.kind === "error")
        return (
            <span className={cn(base, "text-danger-ink")} aria-live="assertive">
                <span className="size-1.5 rounded-full bg-danger" aria-hidden />
                Non enregistré
            </span>
        );
    return null;
}
