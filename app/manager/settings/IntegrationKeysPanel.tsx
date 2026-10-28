"use client";

// ============================================
// Paramètres → Intégrations: the agency's own keys (OpenAI, Allo, Serper…),
// one card per group, one row per key. A value goes in once and never comes
// back to the browser: rows show where the key comes from and its last four
// characters. Same store as the Console (lib/integrations/store).
// ============================================

import { useEffect, useMemo, useState } from "react";
import { Cpu, Database, ExternalLink, KeyRound, Loader2, Lock, PhoneCall, ShieldCheck, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BADGE, Shimmer, StatusPill, type AccueilTone } from "@/components/accueil/AccueilUI";
import { DANGER_BUTTON, FormStatus, INPUT, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, SettingsCard } from "@/components/settings/SettingsUI";
import type { IntegrationGroup } from "@/lib/integrations/catalog";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";

const GROUP_LOOK: Record<IntegrationGroup, { icon: LucideIcon; tone: AccueilTone; subtitle: string }> = {
    ai: { icon: Cpu, tone: "violet", subtitle: "Assistant, fiches, analyses et rédaction" },
    telephony: { icon: PhoneCall, tone: "emerald", subtitle: "Statistiques d'appels et enregistrements" },
    data: { icon: Database, tone: "indigo", subtitle: "Sourcing, enrichissement, recherche d'entreprises" },
};

const GROUP_ORDER: IntegrationGroup[] = ["ai", "telephony", "data"];

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

    useEffect(() => {
        call<IntegrationKeyStatus[]>()
            .then(setKeys)
            .catch((e) => setLoadError(e instanceof Error ? e.message : "Erreur de connexion"));
    }, []);

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
                        <ul className="divide-y divide-slate-100 -my-2">
                            {items.map((k) => (
                                <KeyRow key={k.name} item={k} tone={look.tone} onSaved={setKeys} />
                            ))}
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

function KeyRow({ item, tone, onSaved }: { item: IntegrationKeyStatus; tone: AccueilTone; onSaved: (k: IntegrationKeyStatus[]) => void }) {
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        <li className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", BADGE[tone])}>
                    <KeyRound className="w-4 h-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="text-sm font-extrabold text-zinc-900">{item.label}</p>
                        <SourceLine item={item} />
                    </div>
                    <p className="text-xs font-medium text-zinc-500 leading-relaxed">{item.usedFor}</p>
                </div>
                {!editing && (
                    <div className="flex items-center gap-2 sm:pl-2 flex-shrink-0">
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
                        {item.docsUrl && (
                            <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-zinc-900">
                                Où trouver cette clé <ExternalLink className="w-3 h-3" aria-hidden />
                            </a>
                        )}
                    </div>
                </form>
            )}
        </li>
    );
}
