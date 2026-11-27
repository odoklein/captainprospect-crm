"use client";

// ============================================
// The agency's own keys (OpenAI, Onoff, Allo, Serper…): the telephony group is shown
// in Paramètres → Téléphonie, the others in Paramètres → Intégrations.
// One tile per tool, with its state at a glance; a tile opens a side panel to
// connect, replace, test or remove the key. A value goes in once and never comes
// back to the browser: only where it comes from and its last four characters.
// Same store as the Console (lib/integrations/store).
//
// Embedded (onlyGroup, e.g. the « Nouveau client » wizard's « Connecter »): no side
// panel, the focused tool's form opens in place.
// ============================================

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Cpu, Database, Layers, Lock, Mic, PhoneCall, type LucideIcon } from "lucide-react";
import { Drawer } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FOCUS, Shimmer } from "@/components/accueil/AccueilUI";
import { NotetakerLogo } from "@/components/notetakers/NotetakerLogo";
import { Notice } from "@/components/settings/SettingsUI";
import type { IntegrationGroup } from "@/lib/integrations/catalog";
import { notetakerForKey, type NotetakerDef } from "@/lib/notetakers/catalog";
import { LEEXI_SETTINGS_ANCHOR, NOTETAKER_GUIDES } from "@/lib/notetakers/guide";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";
import { OnoffPanel } from "./OnoffPanel";
import { KavkomPanel } from "./KavkomPanel";
import { KeyEditor, KeyLine, StateDot, callIntegrations, isOn } from "./KeyEditor";

const GROUP_LOOK: Record<IntegrationGroup, { icon: LucideIcon; label: string }> = {
    telephony: { icon: PhoneCall, label: "Téléphonie" },
    ai: { icon: Cpu, label: "IA" },
    meetings: { icon: Mic, label: "Enregistreurs" },
    data: { icon: Database, label: "Données" },
};

const GROUP_ORDER: IntegrationGroup[] = ["telephony", "ai", "meetings", "data"];
type Filter = IntegrationGroup | "all";

/** Onoff has its own card above the tiles. */
const ONOFF_KEYS = new Set(["ONOFF_WEBHOOK_KEY", "ONOFF_API_KEY"]);
/** Shown in their own card (KavkomPanel), like Onoff's. */
const KAVKOM_KEYS = new Set(["KAVKOM_API_TOKEN", "KAVKOM_DOMAIN_UUID", "KAVKOM_WEBHOOK_SECRET", "KAVKOM_SIP_WSS_URL", "KAVKOM_SIP_DOMAIN"]);

/** One tool = the keys that share a name before « — » (Twilio has six, Allo two) or one note-taker. */
interface Tool {
    id: string;
    name: string;
    group: IntegrationGroup;
    keys: IntegrationKeyStatus[];
    notetaker: NotetakerDef | null;
}

function toTools(keys: IntegrationKeyStatus[]): Tool[] {
    const tools: Tool[] = [];
    for (const k of keys) {
        const notetaker = notetakerForKey(k.name);
        const name = notetaker ? notetaker.label : k.label.split(" — ")[0].trim();
        const id = notetaker ? `nt:${notetaker.id}` : `${k.group}:${name}`;
        const t = tools.find((x) => x.id === id);
        if (t) t.keys.push(k);
        else tools.push({ id, name, group: k.group, keys: [k], notetaker });
    }
    return tools;
}

const toolOn = (t: Pick<Tool, "keys">) => t.keys.filter(isOn).length;

/**
 * `groups`: the settings page splits the catalog — telephony lives with the rest of
 * the phone settings (Paramètres → Téléphonie), the other groups in Intégrations.
 * `title` names the block when a single group is shown.
 */
export function IntegrationKeysPanel({ onlyGroup, initialTool, groups: shownGroups, title }: {
    onlyGroup?: IntegrationGroup;
    initialTool?: string;
    groups?: IntegrationGroup[];
    title?: string;
} = {}) {
    const [keys, setKeys] = useState<IntegrationKeyStatus[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>(onlyGroup ?? "all");
    const [openTool, setOpenTool] = useState<string | null>(null);
    // ?tool=fireflies (the « Nouveau client » wizard's « Connecter »): that tool opens.
    const queryTool = useSearchParams().get("tool");
    const focusTool = initialTool ?? queryTool;
    const embedded = !!onlyGroup;
    const shown = shownGroups ?? GROUP_ORDER;

    useEffect(() => {
        callIntegrations<IntegrationKeyStatus[]>()
            .then(setKeys)
            .catch((e) => setLoadError(e instanceof Error ? e.message : "Erreur de connexion"));
    }, []);

    // A tool asked by the URL: Leexi scrolls to its own card, the others open their panel.
    useEffect(() => {
        if (!keys || !focusTool) return;
        if (focusTool === "leexi") {
            document.getElementById(LEEXI_SETTINGS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        const k = keys.find((x) => notetakerForKey(x.name)?.id === focusTool);
        if (k) {
            if (!shown.includes(k.group)) return;
            setFilter((f) => (f === "all" || f === k.group ? f : k.group));
            setOpenTool(`nt:${focusTool}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keys === null, focusTool]);

    const tools = useMemo(() => toTools((keys ?? []).filter((k) => !ONOFF_KEYS.has(k.name) && !KAVKOM_KEYS.has(k.name))), [keys]);
    // Counted in tools, Onoff included: « 3/9 connectés », not 28 keys.
    const counts = useMemo(() => {
        const c: Record<Filter, { on: number; all: number }> = {
            all: { on: 0, all: 0 }, telephony: { on: 0, all: 0 }, ai: { on: 0, all: 0 }, meetings: { on: 0, all: 0 }, data: { on: 0, all: 0 },
        };
        const onoff = (keys ?? []).filter((k) => ONOFF_KEYS.has(k.name));
        const kavkom = (keys ?? []).filter((k) => KAVKOM_KEYS.has(k.name));
        const all = [
            ...tools,
            ...(onoff.length ? [{ group: "telephony" as IntegrationGroup, keys: onoff }] : []),
            ...(kavkom.length ? [{ group: "telephony" as IntegrationGroup, keys: kavkom }] : []),
        ];
        for (const t of all) {
            for (const f of ["all", t.group] as Filter[]) {
                c[f].all++;
                if (toolOn(t) > 0) c[f].on++;
            }
        }
        return c;
    }, [keys, tools]);

    if (loadError) return <Notice tone="rose">{loadError}</Notice>;
    if (!keys) {
        return (
            <div className="space-y-4">
                <Shimmer className="h-12 rounded-2xl" />
                <Shimmer className="h-56 rounded-3xl" />
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => <Shimmer key={i} className="h-36 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    const groups = GROUP_ORDER.filter((g) => shown.includes(g) && (filter === "all" || g === filter))
        .map((g) => ({ group: g, items: tools.filter((t) => t.group === g) }))
        .filter((g) => g.items.length || g.group === "meetings");
    const opened = tools.find((t) => t.id === openTool) ?? null;
    const showOnoff = !embedded && shown.includes("telephony") && (filter === "all" || filter === "telephony");
    const single = shown.length === 1;
    const total = shown.reduce((t, g) => ({ on: t.on + counts[g].on, all: t.all + counts[g].all }), { on: 0, all: 0 });

    return (
        <div className="space-y-6">
            {!embedded && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {single ? (
                        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title ?? GROUP_LOOK[shown[0]].label}</h3>
                    ) : (
                    <div role="tablist" aria-label="Catégories" className="flex gap-1 p-1 rounded-2xl bg-surface-2 overflow-x-auto max-w-full">
                        {(["all", ...shown] as Filter[]).map((f) => {
                            const on = filter === f;
                            const Icon = f === "all" ? Layers : GROUP_LOOK[f].icon;
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    role="tab"
                                    aria-selected={on}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors",
                                        FOCUS,
                                        on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]" : "text-ink-3 hover:text-ink",
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" aria-hidden />
                                    {f === "all" ? "Tout" : GROUP_LOOK[f].label}
                                    <span className={cn("tabular-nums text-[11px]", on ? "text-ink-3" : "text-ink-3/70")}>
                                        {counts[f].on}/{counts[f].all}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-ink-3">
                        <Lock className="w-3.5 h-3.5" aria-hidden />
                        Clés chiffrées, actives en quelques secondes · {total.on}/{total.all} outils connectés
                    </p>
                </div>
            )}

            {showOnoff && <KavkomPanel keys={keys} onKeysChanged={setKeys} />}
            {showOnoff && <OnoffPanel keys={keys} onKeysChanged={setKeys} />}

            {groups.map(({ group, items }) => {
                const look = GROUP_LOOK[group];
                return (
                    <section key={group} aria-label={look.label} className="space-y-3">
                        {!embedded && !single && (filter === "all" || group === "meetings") && (
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-0.5">
                                <h3 className="text-[15px] font-semibold tracking-tight text-ink">{look.label}</h3>
                                {group === "meetings" && (
                                    <p className="text-xs text-ink-3">L&apos;IA pré-remplit la fiche client depuis votre appel de closing</p>
                                )}
                            </div>
                        )}
                        <div className={cn("grid gap-3", embedded ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
                            {items.map((t) => (
                                <ToolTile key={t.id} tool={t} onOpen={() => setOpenTool(t.id)} active={openTool === t.id} />
                            ))}
                            {group === "meetings" && !embedded && <LeexiTile />}
                        </div>
                        {embedded && opened && opened.group === group && (
                            <div className="rounded-2xl border border-line bg-surface p-4">
                                <ToolEditor tool={opened} keys={keys} onSaved={setKeys} />
                            </div>
                        )}
                    </section>
                );
            })}

            {!embedded && (
                <Drawer
                    isOpen={!!opened}
                    onClose={() => setOpenTool(null)}
                    size="md"
                    title={opened?.name}
                    description={opened ? GROUP_LOOK[opened.group].label : undefined}
                >
                    {opened && <ToolEditor key={opened.id} tool={opened} keys={keys} onSaved={setKeys} />}
                </Drawer>
            )}
        </div>
    );
}

// ── Tiles ───────────────────────────────────────────────────────────────────

function monogram(label: string) {
    const word = label.split(/[\s—–-]+/)[0] ?? label;
    return word.slice(0, 2).toUpperCase();
}

function ToolLogo({ tool }: { tool: Tool }) {
    if (tool.notetaker) return <NotetakerLogo id={tool.notetaker.id} size="md" />;
    return (
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-semibold tracking-tight bg-surface-2 text-ink-2" aria-hidden>
            {monogram(tool.name)}
        </span>
    );
}

function ToolState({ tool }: { tool: Tool }) {
    const on = toolOn(tool);
    const all = tool.keys.length;
    if (all === 1) return <StateDot item={tool.keys[0]} />;
    const look =
        on === all ? { dot: "bg-emerald-500", text: "text-emerald-700", label: "Connecté" }
        : on > 0 ? { dot: "bg-amber-500", text: "text-amber-700", label: `Incomplet ${on}/${all}` }
        : { dot: "bg-slate-300", text: "text-ink-3", label: "À connecter" };
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", look.text)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", look.dot)} aria-hidden />
            {look.label}
        </span>
    );
}

/** One key: its editor. Several (Twilio, Allo): one collapsible line each, the first missing one open. */
function ToolEditor({ tool, keys, onSaved }: { tool: Tool; keys: IntegrationKeyStatus[]; onSaved: (k: IntegrationKeyStatus[]) => void }) {
    const fresh = tool.keys.map((k) => keys.find((x) => x.name === k.name) ?? k);
    if (fresh.length === 1) return <KeyEditor item={fresh[0]} keys={keys} onSaved={onSaved} autoEdit={fresh[0].source === "none"} />;
    const firstMissing = fresh.find((k) => !isOn(k))?.name;
    return (
        <div className="space-y-4">
            <p className="text-sm font-medium text-ink-2 leading-relaxed">{fresh[0].usedFor}</p>
            <div className="space-y-2">
                {fresh.map((k) => (
                    <KeyLine key={`${k.name}:${k.source}`} item={k} keys={keys} onSaved={onSaved} defaultOpen={k.name === firstMissing} />
                ))}
            </div>
        </div>
    );
}

function ToolTile({ tool, onOpen, active }: { tool: Tool; onOpen: () => void; active: boolean }) {
    const on = toolOn(tool);
    const connected = on > 0;
    const single = tool.keys.length === 1 ? tool.keys[0] : null;
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className={cn(
                "group text-left rounded-2xl border bg-surface p-4 flex flex-col gap-3 min-h-[148px] transition-[border-color,box-shadow,transform] duration-150",
                "hover:border-line-strong hover:shadow-raised active:scale-[0.995]",
                FOCUS,
                active ? "border-emerald-400 ring-4 ring-emerald-500/10" : "border-line",
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <ToolLogo tool={tool} />
                <ToolState tool={tool} />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-ink leading-snug">{tool.name}</p>
                <p className="text-[13px] text-ink-3 leading-relaxed line-clamp-2 mt-0.5">{tool.keys[0].usedFor}</p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 text-xs">
                <code className="text-xs text-ink-3 truncate">
                    {single ? (connected ? single.hint : "") : `${on}/${tool.keys.length} clés`}
                </code>
                <span className={cn("inline-flex items-center gap-1 font-medium", connected ? "text-ink-2" : "text-emerald-700")}>
                    {connected ? "Gérer" : "Connecter"}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
            </div>
        </button>
    );
}

/** Leexi takes an identifier and a secret: its card is below this panel. */
function LeexiTile() {
    return (
        <button
            type="button"
            onClick={() => document.getElementById(LEEXI_SETTINGS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn("group text-left rounded-2xl border border-dashed border-line bg-surface p-4 flex flex-col gap-3 min-h-[148px] hover:border-line-strong transition-colors", FOCUS)}
        >
            <NotetakerLogo id="leexi" size="md" />
            <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Leexi</p>
                <p className="text-[13px] text-ink-3 leading-relaxed line-clamp-2 mt-0.5">{NOTETAKER_GUIDES.leexi.tagline}. Identifiant + secret, plus bas.</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-ink-2">
                Configurer Leexi
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
        </button>
    );
}
