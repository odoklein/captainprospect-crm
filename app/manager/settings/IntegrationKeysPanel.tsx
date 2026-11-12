"use client";

// ============================================
// Paramètres → Intégrations: the agency's own keys (OpenAI, Allo, Serper…),
// one card per group, one row per key. A value goes in once and never comes
// back to the browser: rows show where the key comes from and its last four
// characters. Same store as the Console (lib/integrations/store).
// ============================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck, CircleX, Cpu, Database, ExternalLink, KeyRound, Loader2, Lock, Mic, PhoneCall, ShieldCheck, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BADGE, Shimmer, StatusPill, type AccueilTone } from "@/components/accueil/AccueilUI";
import { NotetakerKeyHelp } from "@/components/notetakers/NotetakerKeyHelp";
import { NotetakerLogo, NotetakerLogoStack } from "@/components/notetakers/NotetakerLogo";
import { DANGER_BUTTON, FormStatus, INPUT, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, SettingsCard } from "@/components/settings/SettingsUI";
import type { IntegrationGroup } from "@/lib/integrations/catalog";
import { NOTETAKER_IDS, notetakerForKey, type NotetakerDef } from "@/lib/notetakers/catalog";
import { LEEXI_SETTINGS_ANCHOR, NOTETAKER_GUIDES, NOTETAKER_HOW_IT_WORKS } from "@/lib/notetakers/guide";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";

const GROUP_LOOK: Record<IntegrationGroup, { icon: LucideIcon; tone: AccueilTone; subtitle: string }> = {
    ai: { icon: Cpu, tone: "violet", subtitle: "Assistant, fiches, analyses et rédaction" },
    telephony: { icon: PhoneCall, tone: "emerald", subtitle: "Statistiques d'appels et enregistrements" },
    data: { icon: Database, tone: "indigo", subtitle: "Sourcing, enrichissement, recherche d'entreprises" },
    meetings: { icon: Mic, tone: "amber", subtitle: "Créer un client à partir de son appel de closing" },
};

const GROUP_ORDER: IntegrationGroup[] = ["ai", "telephony", "meetings", "data"];

async function call<T>(init?: RequestInit): Promise<T> {
    const res = await fetch("/api/manager/integrations", init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur lors de la sauvegarde");
    return json.data as T;
}

const put = (values: Record<string, string | null>) =>
    call<{ changed: string[]; keys: IntegrationKeyStatus[] }>({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
    });

const shortDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : null;

export function IntegrationKeysPanel() {
    const [keys, setKeys] = useState<IntegrationKeyStatus[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // ?tool=fireflies (the « Nouveau client » wizard's « Connecter »): that row opens, scrolled into view.
    const focusTool = useSearchParams().get("tool");

    useEffect(() => {
        call<IntegrationKeyStatus[]>()
            .then(setKeys)
            .catch((e) => setLoadError(e instanceof Error ? e.message : "Erreur de connexion"));
    }, []);

    // Leexi has its own card (identifier + secret), below this panel.
    useEffect(() => {
        if (keys && focusTool === "leexi") document.getElementById(LEEXI_SETTINGS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [keys, focusTool]);

    const groups = useMemo(
        () => GROUP_ORDER.map((g) => ({ group: g, items: (keys ?? []).filter((k) => k.group === g) })).filter((g) => g.items.length),
        [keys],
    );
    const active = keys?.filter((k) => k.source !== "none").length ?? 0;

    if (loadError) return <Notice tone="rose">{loadError}</Notice>;
    if (!keys) return <Shimmer className="h-64 rounded-3xl" />;

    return (
        <div className="space-y-6">
            <Notice tone="slate" icon={Lock}>
                <p className="font-bold text-zinc-900">Vos clés, chiffrées dans votre base.</p>
                <p>
                    Une clé enregistrée ici s&apos;applique en quelques secondes, sans redémarrage, et n&apos;est plus jamais
                    affichée. Sans clé, la fonction correspondante est désactivée. {active}/{keys.length} configurées.
                </p>
            </Notice>
            {groups.map(({ group, items }) => {
                const look = GROUP_LOOK[group];
                const on = items.filter((k) => k.source !== "none").length;
                return (
                    <SettingsCard
                        key={group}
                        icon={look.icon}
                        tone={look.tone}
                        title={items[0].groupLabel}
                        subtitle={look.subtitle}
                        right={<StatusPill tone={on === items.length ? "emerald" : on ? "amber" : "slate"}>{on}/{items.length}</StatusPill>}
                    >
                        {group === "meetings" && <MeetingsIntro />}
                        <ul className="divide-y divide-slate-100 -my-2">
                            {group === "meetings" && <LeexiPointer />}
                            {items.map((k) => {
                                const tool = notetakerForKey(k.name);
                                // One « Tester » per tool, on its last key (Gong has two).
                                const last = !!tool && tool.keys[tool.keys.length - 1] === k.name;
                                const ready = last && tool.keys.every((n) => keys.find((x) => x.name === n)?.source !== "none");
                                return (
                                    <KeyRow
                                        key={k.name}
                                        item={k}
                                        tone={look.tone}
                                        onSaved={setKeys}
                                        tool={tool}
                                        testable={ready}
                                        focused={!!tool && tool.id === focusTool && tool.keys[0] === k.name}
                                    />
                                );
                            })}
                        </ul>
                    </SettingsCard>
                );
            })}
        </div>
    );
}

function SourceLine({ item }: { item: IntegrationKeyStatus }) {
    if (item.source === "stored") {
        const when = shortDate(item.updatedAt);
        return (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusPill tone="emerald" icon={ShieldCheck}>Clé de l&apos;agence</StatusPill>
                <code className="text-[11px] font-bold text-zinc-500">{item.hint}</code>
                {(item.updatedBy || when) && (
                    <span className="text-[11px] font-medium text-zinc-400">
                        {[item.updatedBy, when].filter(Boolean).join(" · ")}
                    </span>
                )}
            </span>
        );
    }
    if (item.source === "env") {
        return (
            <span className="inline-flex flex-wrap items-center gap-2">
                <StatusPill tone="amber" title="Écrite dans le serveur à la création du CRM">Valeur d&apos;origine</StatusPill>
                <code className="text-[11px] font-bold text-zinc-500">{item.hint}</code>
            </span>
        );
    }
    return <StatusPill tone="slate">Non configurée</StatusPill>;
}

/** Above the note-taker rows: what connecting one gives the team. */
function MeetingsIntro() {
    return (
        <div className="mb-4 space-y-3 rounded-2xl bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <NotetakerLogoStack ids={NOTETAKER_IDS} max={NOTETAKER_IDS.length} />
                <p className="text-xs font-medium leading-relaxed text-zinc-600">
                    Connectez l&apos;outil qui enregistre vos appels de closing. Dans Clients › Nouveau client › « Appel enregistré », vous
                    choisissez l&apos;appel et l&apos;IA pré-remplit la fiche client, la cible et le discours. Une clé suffit pour toute l&apos;agence.
                </p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-3">
                {NOTETAKER_HOW_IT_WORKS.map((step, i) => (
                    <li key={step} className="flex items-start gap-2 text-xs font-medium leading-relaxed text-zinc-600">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-zinc-900 ring-1 ring-zinc-200">
                            {i + 1}
                        </span>
                        {step}
                    </li>
                ))}
            </ol>
        </div>
    );
}

/** Leexi takes an identifier and a secret: its card is below this panel. */
function LeexiPointer() {
    return (
        <li className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <NotetakerLogo id="leexi" size="md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-extrabold text-zinc-900">Leexi</p>
                    <p className="text-xs font-medium text-zinc-500 leading-relaxed">
                        {NOTETAKER_GUIDES.leexi.tagline}. Se connecte avec un identifiant et un secret API, dans la carte Leexi ci-dessous.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => document.getElementById(LEEXI_SETTINGS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className={cn(SECONDARY_BUTTON, "h-9 rounded-xl text-xs sm:ml-2 flex-shrink-0")}
                >
                    Configurer Leexi
                </button>
            </div>
        </li>
    );
}

function KeyRow({
    item,
    tone,
    onSaved,
    tool,
    testable,
    focused,
}: {
    item: IntegrationKeyStatus;
    tone: AccueilTone;
    onSaved: (k: IntegrationKeyStatus[]) => void;
    /** Note-taker this key belongs to: its logo, its « Où trouver la clé ». */
    tool: NotetakerDef | null;
    /** The tool's key(s) are saved and can be tried against its API. */
    testable: boolean;
    /** Reached from the wizard's « Connecter »: scrolled into view, form open if the key is missing. */
    focused?: boolean;
}) {
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
    const rowRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
        if (!focused) return;
        rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (item.source === "none") setEditing(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focused]);

    const runTest = async () => {
        if (!tool) return;
        setTesting(true);
        setTested(null);
        try {
            const res = await fetch(`/api/notetakers/${tool.id}/test`, { method: "POST" });
            const json = await res.json().catch(() => null);
            setTested(json?.success ? json.data : { ok: false, message: json?.error || "Test impossible" });
        } catch {
            setTested({ ok: false, message: "Erreur de connexion" });
        } finally {
            setTesting(false);
        }
    };

    const close = () => {
        setEditing(false);
        setValue("");
        setError(null);
    };

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const r = await put({ [item.name]: value });
            onSaved(r.keys);
            close();
            setTested(null);
            toast.success(`${item.label} enregistrée`, "Active dans quelques secondes.");
        } catch (e) {
            setError(e instanceof Error ? e.message.replace(`${item.name} : `, "") : "Erreur de connexion");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Retirer la clé ${item.label} ? Sans autre clé, la fonction sera désactivée.`)) return;
        setBusy(true);
        try {
            const r = await put({ [item.name]: null });
            onSaved(r.keys);
            const next = r.keys.find((k) => k.name === item.name);
            toast.success(
                `${item.label} retirée`,
                next?.source === "env" ? "La valeur d'origine du serveur reprend le relais." : "La fonction est désactivée.",
            );
        } catch (e) {
            toast.error("Échec", e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(false);
        }
    };

    return (
        <li ref={rowRef} className="py-4 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {tool ? (
                    <NotetakerLogo id={tool.id} size="md" />
                ) : (
                    <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", BADGE[tone])}>
                        <KeyRound className="w-4 h-4" aria-hidden />
                    </span>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="text-sm font-extrabold text-zinc-900">{item.label}</p>
                        <SourceLine item={item} />
                    </div>
                    <p className="text-xs font-medium text-zinc-500 leading-relaxed">{item.usedFor}</p>
                </div>
                {!editing && (
                    <div className="flex items-center gap-2 sm:pl-2 flex-shrink-0">
                        {testable && (
                            <button type="button" onClick={runTest} disabled={busy || testing} className={cn(SECONDARY_BUTTON, "h-9 rounded-xl text-xs")}>
                                {testing && <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden />}
                                Tester
                            </button>
                        )}
                        {item.source === "stored" && (
                            <button type="button" onClick={remove} disabled={busy} className={DANGER_BUTTON}>
                                Retirer
                            </button>
                        )}
                        <button type="button" onClick={() => setEditing(true)} disabled={busy} className={cn(SECONDARY_BUTTON, "h-9 rounded-xl text-xs")}>
                            {item.source === "none" ? "Ajouter" : "Remplacer"}
                        </button>
                    </div>
                )}
            </div>

            {tested && !editing && (
                <p
                    role="status"
                    className={cn(
                        "mt-2 sm:ml-12 inline-flex items-start gap-1.5 text-xs font-semibold",
                        tested.ok ? "text-emerald-700" : "text-rose-700",
                    )}
                >
                    {tested.ok ? <CircleCheck className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden /> : <CircleX className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />}
                    {tested.message}
                </p>
            )}

            {editing && (
                <form
                    className="mt-3 sm:ml-12 space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (value.trim()) void save();
                    }}
                >
                    <div className="flex flex-col sm:flex-row gap-2">
                        <label className="sr-only" htmlFor={`key-${item.name}`}>{item.label}</label>
                        <input
                            id={`key-${item.name}`}
                            type="password"
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                setError(null);
                            }}
                            onKeyDown={(e) => e.key === "Escape" && close()}
                            placeholder={item.placeholder ?? "Collez la clé"}
                            className={cn(INPUT, "font-mono text-[13px] flex-1")}
                        />
                        <div className="flex gap-2">
                            <button type="button" onClick={close} disabled={busy} className={SECONDARY_BUTTON}>Annuler</button>
                            <button type="submit" disabled={busy || !value.trim()} className={PRIMARY_BUTTON}>
                                {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                                Enregistrer
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <FormStatus error={error} />
                        {item.docsUrl && !tool && (
                            <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-zinc-900">
                                Où trouver cette clé <ExternalLink className="w-3 h-3" aria-hidden />
                            </a>
                        )}
                    </div>
                    {tool && <NotetakerKeyHelp id={tool.id} />}
                </form>
            )}
        </li>
    );
}
