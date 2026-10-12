"use client";

// ============================================
// Manager settings — "Connexion IA (MCP)": generate the key an AI agent (ChatGPT,
// Claude, Cursor…) uses to read the CRM through /api/mcp. Same ApiKey model and
// endpoints as /api/manager/api-keys; here we only create keys that carry read
// scopes (the public API / MCP kind) and show the ready-to-paste connection.
// ============================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Plug, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { READ_SCOPES, V1_ENDPOINT_MARKER, hasAllClientsFlag, scopesFromAllowedEndpoints, type ReadScope } from "@/lib/api-v1/scopes";
import { SegmentedControl, Shimmer, StatusPill } from "@/components/accueil/AccueilUI";
import {
    DANGER_BUTTON, Field, FormStatus, INPUT, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, SettingsCard,
} from "@/components/settings/SettingsUI";

interface McpKey {
    id: string;
    name: string;
    keyPrefix: string;
    client: { id: string; name: string } | null;
    allowedEndpoints: string[];
    isActive: boolean;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    usageCount: number;
}

interface CreatedKey {
    id: string;
    name: string;
    apiKey: string;
    expiresAt: string | null;
}

const SCOPE_LABEL: Record<ReadScope, string> = {
    "contacts:read": "Contacts, transcriptions, exclusions, qualité des données",
    "companies:read": "Entreprises",
    "leads:read": "Prospects travaillés",
    "calls:read": "Appels et transcriptions",
    "activities:read": "Activités (appels, emails, LinkedIn)",
    "appointments:read": "Rendez-vous et bilan RDV",
    "reports:read": "Rapports de chiffres et retours terrain",
    "users:read": "Utilisateurs et équipes",
    "missions:read": "Missions, campagnes, scripts",
    "lists:read": "Listes de prospection",
};

async function call<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur serveur");
    return json.data as T;
}

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : "Erreur de connexion");
const dayMs = 86_400_000;
const fmt = (iso: string | null, empty: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : empty);

function CopyButton({ text, label }: { text: string; label: string }) {
    const toast = useToast();
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => {
                navigator.clipboard.writeText(text).then(
                    () => {
                        setDone(true);
                        toast.success(`${label} copié`);
                        setTimeout(() => setDone(false), 2000);
                    },
                    () => toast.error("Copie impossible"),
                );
            }}
        >
            {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {done ? "Copié" : "Copier"}
        </button>
    );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{title}</span>
                <CopyButton text={code} label={title} />
            </div>
            <pre className="rounded-xl bg-zinc-950 text-zinc-100 text-xs font-mono p-3.5 overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
        </div>
    );
}

export function McpPanel() {
    const toast = useToast();
    const [keys, setKeys] = useState<McpKey[] | null>(null);
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
    const [origin, setOrigin] = useState("");
    const [vault, setVault] = useState<{ configured: boolean; reachable: boolean; message: string } | null>(null);

    const [name, setName] = useState("");
    const [access, setAccess] = useState<"all" | "client">("all");
    const [clientId, setClientId] = useState("");
    const [days, setDays] = useState("90");
    const [scopes, setScopes] = useState<ReadScope[]>([...READ_SCOPES]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedKey | null>(null);

    const load = useCallback(async () => {
        try {
            const all = await call<McpKey[]>("/api/manager/api-keys");
            setKeys(all.filter((k) => k.allowedEndpoints.includes(V1_ENDPOINT_MARKER)));
        } catch {
            setKeys([]);
        }
    }, []);

    useEffect(() => {
        setOrigin(window.location.origin);
        load();
        call<{ configured: boolean; reachable: boolean; message: string }>("/api/manager/mcp/vault-status")
            .then(setVault)
            .catch(() => setVault({ configured: false, reachable: false, message: "Statut du call-vault indisponible" }));
        call<Array<{ id: string; name: string }>>("/api/manager/clients").then(setClients).catch(() => {});
    }, [load]);

    const mcpUrl = `${origin}/api/mcp`;
    const claudeCmd = useMemo(
        () => (created ? `claude mcp add --transport http captain-prospect ${mcpUrl} --header "Authorization: Bearer ${created.apiKey}"` : ""),
        [created, mcpUrl],
    );
    const jsonConfig = useMemo(
        () => (created
            ? JSON.stringify({ mcpServers: { "captain-prospect": { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${created.apiKey}` } } } }, null, 2)
            : ""),
        [created, mcpUrl],
    );

    const toggleScope = (s: ReadScope) =>
        setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

    const generate = async () => {
        setError(null);
        if (!name.trim()) return setError("Donnez un nom à la clé (ex. « ChatGPT — Odo »)");
        if (access === "client" && !clientId) return setError("Choisissez le client visible par cette clé");
        if (scopes.length === 0) return setError("Cochez au moins une permission");
        setCreating(true);
        try {
            const nDays = Number(days);
            const data = await call<CreatedKey>("/api/manager/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    role: "CLIENT",
                    scopes,
                    clientId: access === "client" ? clientId : null,
                    allClients: access === "all",
                    expiresAt: nDays > 0 ? new Date(Date.now() + nDays * dayMs - 60_000).toISOString() : null,
                    rateLimitPerMinute: 120,
                    rateLimitPerHour: 7200,
                }),
            });
            setCreated(data);
            setName("");
            load();
        } catch (e) {
            setError(errorText(e));
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (k: McpKey) => {
        if (!window.confirm(`Révoquer la clé « ${k.name} » ? L'agent connecté perdra l'accès immédiatement.`)) return;
        try {
            await call(`/api/manager/api-keys/${k.id}`, { method: "DELETE" });
            toast.success("Clé révoquée");
            load();
        } catch (e) {
            toast.error(errorText(e));
        }
    };

    return (
        <div className="space-y-6">
            <SettingsCard
                icon={Plug}
                tone="violet"
                title="Connexion IA (MCP)"
                subtitle="Laissez ChatGPT, Claude ou Cursor lire le CRM en lecture seule"
                right={<StatusPill tone="emerald" icon={ShieldCheck}>Lecture seule</StatusPill>}
            >
                <div className="space-y-5">
                    <Field label="Adresse du serveur MCP" trailing={origin ? <CopyButton text={mcpUrl} label="Adresse MCP" /> : undefined}>
                        {(id) => <input id={id} readOnly value={mcpUrl} className={cn(INPUT, "font-mono text-xs")} />}
                    </Field>

                    {vault && (
                        <Notice tone={vault.reachable ? "emerald" : "amber"} icon={vault.reachable ? ShieldCheck : TriangleAlert}>
                            <strong>Call-vault :</strong> {vault.message}.{" "}
                            {vault.reachable
                                ? "Les clés avec la permission « calls:read » lisent aussi les transcriptions et la couverture des appels."
                                : "Les outils de transcription (search_transcripts, get_transcript) répondront « vault_unavailable » tant que ce n'est pas réglé."}
                        </Notice>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Nom de la clé">
                            {(id) => (
                                <input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
                                    placeholder="ChatGPT — Odo" className={INPUT} />
                            )}
                        </Field>
                        <Field label="Validité" hint={access === "all" ? "Une clé « tous les clients » vit 90 jours maximum." : undefined}>
                            {(id) => (
                                <select id={id} value={days} onChange={(e) => setDays(e.target.value)} className={INPUT}>
                                    <option value="30">30 jours</option>
                                    <option value="90">90 jours</option>
                                    {access === "client" && <option value="365">1 an</option>}
                                    {access === "client" && <option value="0">Sans expiration</option>}
                                </select>
                            )}
                        </Field>
                    </div>

                    <div>
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Données visibles</span>
                        <SegmentedControl
                            ariaLabel="Données visibles"
                            value={access}
                            onChange={(v) => {
                                setAccess(v as "all" | "client");
                                if (v === "all" && !["30", "90"].includes(days)) setDays("90");
                            }}
                            options={[
                                { value: "all", label: "Tous les clients (interne)" },
                                { value: "client", label: "Un seul client" },
                            ]}
                        />
                        {access === "client" ? (
                            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={cn(INPUT, "mt-3")} aria-label="Client">
                                <option value="">Choisir un client…</option>
                                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        ) : (
                            <Notice tone="amber" icon={TriangleAlert} className="mt-3">
                                Cette clé donne accès aux données de tous les clients, y compris les outils d&apos;administration
                                (SQL en lecture, couverture des appels). Réservez-la à un usage interne.
                            </Notice>
                        )}
                    </div>

                    <details className="group rounded-xl border border-slate-200 px-4 py-3">
                        <summary className="cursor-pointer text-xs font-bold text-zinc-700">
                            Permissions ({scopes.length}/{READ_SCOPES.length})
                        </summary>
                        <div className="grid gap-2 pt-3 sm:grid-cols-2">
                            {READ_SCOPES.map((s) => (
                                <label key={s} className="flex items-start gap-2 text-xs font-medium text-zinc-600">
                                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} className="mt-0.5" />
                                    <span><code className="font-mono text-zinc-800">{s}</code> — {SCOPE_LABEL[s]}</span>
                                </label>
                            ))}
                        </div>
                    </details>

                    <div className="flex items-center gap-3">
                        <button type="button" className={PRIMARY_BUTTON} onClick={generate} disabled={creating}>
                            <Plus className="w-4 h-4" />
                            {creating ? "Génération…" : "Générer la clé de connexion"}
                        </button>
                        <FormStatus error={error} />
                    </div>
                </div>
            </SettingsCard>

            {created && (
                <SettingsCard icon={Check} tone="emerald" title={`Clé « ${created.name} » créée`} subtitle="Ce secret ne sera plus jamais affiché">
                    <div className="space-y-4">
                        <Notice tone="amber" icon={TriangleAlert}>
                            Copiez-la maintenant et gardez-la dans un gestionnaire de mots de passe. Ne la collez jamais dans un dépôt Git.
                            Valable jusqu&apos;au {fmt(created.expiresAt, "—")}{created.expiresAt ? "" : " (sans expiration)"}.
                        </Notice>
                        <Field label="Clé API" trailing={<CopyButton text={created.apiKey} label="Clé API" />}>
                            {(id) => <input id={id} readOnly value={created.apiKey} className={cn(INPUT, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />}
                        </Field>
                        <CodeBlock title="Claude Code (terminal)" code={claudeCmd} />
                        <CodeBlock title="Config JSON (Cursor, Claude Desktop…)" code={jsonConfig} />
                        <CodeBlock title="Adresse avec clé (connecteur ChatGPT / Claude.ai)" code={`${mcpUrl}?key=${created.apiKey}`} />
                        <button type="button" className={SECONDARY_BUTTON} onClick={() => setCreated(null)}>
                            J&apos;ai enregistré la clé
                        </button>
                    </div>
                </SettingsCard>
            )}

            <SettingsCard icon={Plug} tone="slate" title="Clés existantes" subtitle="Les clés de connexion IA que vous avez créées">
                {keys === null ? (
                    <Shimmer className="h-20" />
                ) : keys.length === 0 ? (
                    <p className="text-sm font-medium text-zinc-500">Aucune clé pour le moment.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {keys.map((k) => {
                            const expired = !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
                            const live = k.isActive && !expired;
                            return (
                                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-zinc-900 truncate">{k.name}</p>
                                        <p className="text-xs font-medium text-zinc-500">
                                            <code className="font-mono">{k.keyPrefix}••••</code>
                                            {" · "}{hasAllClientsFlag(k.allowedEndpoints) ? "Tous les clients" : k.client?.name ?? "—"}
                                            {" · "}{scopesFromAllowedEndpoints(k.allowedEndpoints).length} permissions
                                            {" · "}utilisée {k.usageCount} fois (dernière : {fmt(k.lastUsedAt, "jamais")})
                                            {" · "}expire : {fmt(k.expiresAt, "jamais")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusPill tone={live ? "emerald" : "slate"}>{!k.isActive ? "Révoquée" : expired ? "Expirée" : "Active"}</StatusPill>
                                        {live && (
                                            <button type="button" className={DANGER_BUTTON} onClick={() => revoke(k)}>
                                                <Trash2 className="w-3.5 h-3.5" /> Révoquer
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SettingsCard>
        </div>
    );
}
