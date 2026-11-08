"use client";

// ============================================
// Paramètres → Téléphonie: which number each person calls with.
//
// The numbers come from the agency's Twilio account (bought there, or existing
// numbers verified as Caller ID). A person with a number calls from the
// browser through Twilio; without one, their phone links keep opening Allo.
// A number belongs to one person at a time: giving it to someone else takes
// it from its current holder.
// ============================================

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Phone, PhoneCall, RefreshCw, Users } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer, StatusPill } from "@/components/accueil/AccueilUI";
import { Notice, SECONDARY_BUTTON, SettingsCard } from "@/components/settings/SettingsUI";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import type { AccountNumber, PhoneUserRow } from "@/lib/telephony/numbers";

type Payload = { configured: boolean; numbers: AccountNumber[]; users: PhoneUserRow[]; error: string | null };

const ROLE_LABEL: Record<string, string> = { SDR: "SDR", BOOKER: "Booker", BUSINESS_DEVELOPER: "Business developer", MANAGER: "Manager" };
const TWILIO_BUY_URL = "https://console.twilio.com/us1/develop/phone-numbers/manage/search";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur de connexion");
    return json.data as T;
}

function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export function TelephonyPanel() {
    const { success, error: showError } = useToast();
    const [data, setData] = useState<Payload | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [savingFor, setSavingFor] = useState<string | null>(null);

    const load = useCallback(async (fresh = false) => {
        setRefreshing(true);
        try {
            setData(await api<Payload>(`/api/manager/telephony/numbers${fresh ? "?fresh=1" : ""}`));
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setRefreshing(false);
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    if (loadError) return <Notice tone="rose">{loadError}</Notice>;
    if (!data) return <Shimmer className="h-64 rounded-3xl" />;

    const holderOf = new Map(data.users.filter((u) => u.number).map((u) => [u.number!, u]));
    const withNumber = data.users.filter((u) => u.number).length;

    const assign = async (user: PhoneUserRow, number: string | null) => {
        const holder = number ? holderOf.get(number) : undefined;
        if (holder && holder.id !== user.id && !window.confirm(`${formatPhone(number!)} est utilisé par ${holder.name}. Le lui retirer et le donner à ${user.name} ?`)) return;
        setSavingFor(user.id);
        try {
            const res = await api<{ users: PhoneUserRow[]; previousHolder: { name: string } | null }>("/api/manager/telephony/numbers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, number }),
            });
            setData((d) => (d ? { ...d, users: res.users } : d));
            success(
                number ? "Numéro attribué" : "Numéro retiré",
                number
                    ? `${user.name} appelle avec ${formatPhone(number)} via Twilio.${res.previousHolder ? ` ${res.previousHolder.name} repasse sur Allo.` : ""}`
                    : `${user.name} repasse sur Allo.`,
            );
        } catch (e) {
            showError("Attribution impossible", e instanceof Error ? e.message : "Erreur");
        } finally {
            setSavingFor(null);
        }
    };

    if (!data.configured) {
        return (
            <Notice tone="amber" icon={PhoneCall}>
                <p className="font-bold text-zinc-900">Twilio n&apos;est pas configuré.</p>
                <p>Ajoutez les clés Twilio dans Paramètres → Intégrations : vos numéros apparaîtront ici pour être attribués à l&apos;équipe.</p>
            </Notice>
        );
    }

    return (
        <div className="space-y-6">
            <Notice tone="slate" icon={PhoneCall}>
                <p className="font-bold text-zinc-900">Un numéro par personne.</p>
                <p>
                    Une personne avec un numéro appelle depuis le CRM via Twilio, et le prospect voit toujours ce numéro. Sans numéro, ses liens
                    d&apos;appel ouvrent Allo comme avant. Vous pouvez donc équiper l&apos;équipe une personne à la fois.
                </p>
            </Notice>

            <SettingsCard
                icon={Phone}
                tone="indigo"
                title="Numéros du compte Twilio"
                subtitle={`${data.numbers.length} numéro${data.numbers.length > 1 ? "s" : ""} · ${withNumber} attribué${withNumber > 1 ? "s" : ""}`}
                right={
                    <div className="flex items-center gap-2">
                        <a href={TWILIO_BUY_URL} target="_blank" rel="noopener noreferrer" className={cn(SECONDARY_BUTTON, "gap-1.5")}>
                            Acheter un numéro <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={cn(SECONDARY_BUTTON, "gap-1.5")} aria-label="Actualiser depuis Twilio">
                            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Actualiser
                        </button>
                    </div>
                }
            >
                {data.error && <Notice tone="rose" className="mb-3">{data.error}</Notice>}
                {!data.error && data.numbers.length === 0 && (
                    <p className="text-sm text-zinc-500">Aucun numéro sur ce compte Twilio. Achetez un numéro français (ou vérifiez un numéro existant), puis « Actualiser ».</p>
                )}
                {data.numbers.length > 0 && (
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {data.numbers.map((n) => {
                            const holder = holderOf.get(n.number);
                            return (
                                <li key={n.number} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                    <span className="font-mono text-[15px] font-semibold tabular-nums text-zinc-900">{formatPhone(n.number)}</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
                                        {n.source === "twilio" ? "Acheté sur Twilio" : "Vérifié (Caller ID)"}
                                    </span>
                                    {n.label && n.label !== n.number && <span className="truncate text-xs text-zinc-500">{n.label}</span>}
                                    <span className="ml-auto">
                                        {!n.voice ? (
                                            <StatusPill tone="amber">Sans voix</StatusPill>
                                        ) : holder ? (
                                            <StatusPill tone="emerald">{holder.name}</StatusPill>
                                        ) : (
                                            <StatusPill tone="slate">Libre</StatusPill>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SettingsCard>

            <SettingsCard icon={Users} tone="emerald" title="Qui appelle avec quel numéro" subtitle="Le choix s'applique au prochain chargement de page de la personne.">
                {data.users.length === 0 ? (
                    <p className="text-sm text-zinc-500">Aucun utilisateur actif ne peut appeler.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                        {data.users.map((u) => {
                            const unknown = u.number && !data.numbers.some((n) => n.number === u.number);
                            return (
                                <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-zinc-600">{initials(u.name)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-zinc-900">{u.name}</span>
                                        <span className="block truncate text-xs text-zinc-500">
                                            {ROLE_LABEL[u.role] ?? u.role} · {u.email}
                                        </span>
                                    </span>
                                    {u.number ? <StatusPill tone="emerald">Twilio</StatusPill> : <StatusPill tone="slate">Allo</StatusPill>}
                                    <label className="relative flex items-center">
                                        <span className="sr-only">Numéro de {u.name}</span>
                                        <select
                                            value={u.number ?? ""}
                                            disabled={savingFor === u.id || (data.numbers.length === 0 && !u.number)}
                                            onChange={(e) => void assign(u, e.target.value || null)}
                                            className="h-10 min-w-[230px] cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-zinc-900 hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50"
                                        >
                                            <option value="">Pas de numéro (Allo)</option>
                                            {unknown && (
                                                <option value={u.number!}>
                                                    {formatPhone(u.number!)}
                                                    {data.error ? "" : " · hors compte"}
                                                </option>
                                            )}
                                            {data.numbers
                                                .filter((n) => n.voice)
                                                .map((n) => {
                                                    const holder = holderOf.get(n.number);
                                                    return (
                                                        <option key={n.number} value={n.number}>
                                                            {formatPhone(n.number)}
                                                            {holder && holder.id !== u.id ? ` · utilisé par ${holder.name}` : holder ? "" : " · libre"}
                                                        </option>
                                                    );
                                                })}
                                        </select>
                                        <span className="pointer-events-none absolute right-3 text-[10px] text-zinc-400">
                                            {savingFor === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "▾"}
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SettingsCard>
        </div>
    );
}
