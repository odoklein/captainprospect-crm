"use client";

/**
 * ============================================================
 * COFFRE D'ACCÈS — manager page
 * ============================================================
 * Left: the credentials on file for the selected client, grouped by mission.
 * Right: the assistant, which does the same work from a French sentence.
 *
 * Both halves share one refresh: an action taken in either place refetches the
 * list, so the two views never disagree about what exists.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Badge, Button, Input, Modal, ModalFooter, PageHeader, Select, useToast } from "@/components/ui";
import AssistantProjetPanel from "@/components/assistant-projet/AssistantProjetPanel";
import VaultCredentialList, { type VaultCredential } from "@/components/vault/VaultCredentialList";

interface ScopeClient {
    id: string;
    name: string;
}

interface ScopeMission {
    id: string;
    name: string;
    status: string;
}

interface ScopeCommercial {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    hasPortalAccount: boolean;
    portalEmail: string | null;
}

interface ActivityEvent {
    id: string;
    action: string;
    summary: string;
    actor: { id: string; name: string } | null;
    createdAt: string;
}

const TYPE_OPTIONS = [
    { value: "PORTAL", label: "Portail Captain Prospect" },
    { value: "EMAIL", label: "Boîte email" },
    { value: "CALENDAR", label: "Agenda" },
    { value: "CRM_EXTERNAL", label: "CRM externe" },
    { value: "LINKEDIN", label: "LinkedIn" },
    { value: "PHONE_TOOL", label: "Téléphonie" },
    { value: "OTHER", label: "Autre" },
];

const EMPTY_FORM = {
    type: "EMAIL",
    label: "",
    login: "",
    password: "",
    url: "",
    notes: "",
    missionId: "",
    interlocuteurId: "",
};

export default function AccessVaultPage() {
    const { success, error: toastError } = useToast();

    const [clients, setClients] = useState<ScopeClient[]>([]);
    const [missions, setMissions] = useState<ScopeMission[]>([]);
    const [commerciaux, setCommerciaux] = useState<ScopeCommercial[]>([]);
    const [clientId, setClientId] = useState("");

    const [credentials, setCredentials] = useState<VaultCredential[]>([]);
    const [activity, setActivity] = useState<ActivityEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    // ---- scope (clients, then that client's missions + commerciaux) ----
    const loadScope = useCallback(async (targetClientId: string) => {
        const query = targetClientId ? `?clientId=${encodeURIComponent(targetClientId)}` : "";
        const response = await fetch(`/api/manager/vault/scope${query}`);
        const payload = await response.json();
        if (!response.ok) return;
        const data = payload.data ?? payload;
        setClients(data.clients ?? []);
        setMissions(data.missions ?? []);
        setCommerciaux(data.commerciaux ?? []);
    }, []);

    const loadCredentials = useCallback(async () => {
        if (!clientId) {
            setCredentials([]);
            setActivity([]);
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(
                `/api/manager/vault?clientId=${encodeURIComponent(clientId)}&withActivity=1`,
            );
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || "Chargement impossible");
            const data = payload.data ?? payload;
            setCredentials(data.credentials ?? []);
            setActivity(data.activity ?? []);
        } catch (error) {
            toastError("Chargement impossible", error instanceof Error ? error.message : undefined);
        } finally {
            setIsLoading(false);
        }
    }, [clientId, toastError]);

    // One effect for both: with no client selected this still runs and fills
    // the client dropdown, which is all the page needs to start.
    useEffect(() => {
        loadScope(clientId);
        loadCredentials();
    }, [clientId, loadScope, loadCredentials]);

    // ---- manual creation ----
    const submitForm = useCallback(async () => {
        if (!clientId || !form.login.trim()) return;
        setIsSaving(true);
        try {
            const response = await fetch("/api/manager/vault", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientId,
                    type: form.type,
                    label: form.label.trim() || undefined,
                    login: form.login.trim(),
                    password: form.password || undefined,
                    url: form.url.trim() || undefined,
                    notes: form.notes.trim() || undefined,
                    missionId: form.missionId || undefined,
                    interlocuteurId: form.interlocuteurId || undefined,
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || "Enregistrement impossible");

            success("Accès enregistré");
            setIsFormOpen(false);
            setForm(EMPTY_FORM);
            loadCredentials();
        } catch (error) {
            toastError(
                "Enregistrement impossible",
                error instanceof Error ? error.message : undefined,
            );
        } finally {
            setIsSaving(false);
        }
    }, [clientId, form, loadCredentials, success, toastError]);

    const missingPortalCount = commerciaux.filter((c) => !c.hasPortalAccount).length;

    return (
        <div className="space-y-5 p-6">
            <PageHeader
                title="Coffre d'accès"
                subtitle="Identifiants et mots de passe créés pour les clients et leurs commerciaux, par projet."
                icon={<ShieldCheck className="h-4 w-4" />}
                onRefresh={loadCredentials}
                isRefreshing={isLoading}
                actions={
                    <Button
                        onClick={() => setIsFormOpen(true)}
                        disabled={!clientId}
                        title={clientId ? undefined : "Choisis d'abord un client"}
                    >
                        <Plus className="h-4 w-4" />
                        Nouvel accès
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[260px]">
                    <Select
                        value={clientId}
                        onChange={(value) => setClientId(String(value))}
                        options={[
                            { value: "", label: "Choisir un client…" },
                            ...clients.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                    />
                </div>

                {clientId && (
                    <>
                        <Badge variant="default">
                            {credentials.length} accès enregistré{credentials.length > 1 ? "s" : ""}
                        </Badge>
                        <Badge variant={missingPortalCount > 0 ? "warning" : "success"}>
                            {missingPortalCount > 0
                                ? `${missingPortalCount} commercial${missingPortalCount > 1 ? "aux" : ""} sans accès portail`
                                : "Tous les commerciaux ont un accès portail"}
                        </Badge>
                    </>
                )}
            </div>

            {!clientId ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                    <KeyRound className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">
                        Choisis un client pour voir ses accès
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                        Le coffre est organisé par client, puis par projet (mission).
                    </p>
                </div>
            ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
                    <div className="space-y-5">
                        <VaultCredentialList
                            credentials={credentials}
                            isLoading={isLoading}
                            onChanged={loadCredentials}
                        />

                        {activity.length > 0 && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Journal d&apos;activité
                                </p>
                                <ul className="space-y-2">
                                    {activity.map((event) => (
                                        <li key={event.id} className="flex gap-2 text-xs">
                                            <span className="w-28 shrink-0 text-slate-400">
                                                {new Date(event.createdAt).toLocaleString("fr-FR", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                            <span className="flex-1 text-slate-700">
                                                {event.summary}
                                            </span>
                                            <span className="shrink-0 text-slate-400">
                                                {event.actor?.name ?? "—"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="h-[calc(100vh-260px)] min-h-[520px] lg:sticky lg:top-6">
                        {/* Same panel as /manager/assistant, locked to the client
                            selected above — one assistant, not two that drift apart. */}
                        <AssistantProjetPanel
                            fixedClientId={clientId}
                            onDataChanged={loadCredentials}
                        />
                    </div>
                </div>
            )}

            <Modal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                title="Enregistrer un accès"
                size="md"
            >
                <div className="space-y-3">
                    <Select
                        label="Type"
                        value={form.type}
                        onChange={(value) => setForm((f) => ({ ...f, type: String(value) }))}
                        options={TYPE_OPTIONS}
                    />
                    <Input
                        label="Identifiant"
                        value={form.login}
                        onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                        placeholder="marie.dupont@acme.fr"
                    />
                    <Input
                        label="Mot de passe"
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Laisser vide si l'accès n'en a pas (SSO)"
                    />
                    <Input
                        label="Libellé (optionnel)"
                        value={form.label}
                        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                        placeholder="Généré à partir du type et de l'identifiant"
                    />
                    <Input
                        label="URL de connexion (optionnel)"
                        value={form.url}
                        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    />
                    <Select
                        label="Projet / mission (optionnel)"
                        value={form.missionId}
                        onChange={(value) => setForm((f) => ({ ...f, missionId: String(value) }))}
                        options={[
                            { value: "", label: "Tous les projets du client" },
                            ...missions.map((m) => ({ value: m.id, label: m.name })),
                        ]}
                    />
                    <Select
                        label="Commercial concerné (optionnel)"
                        value={form.interlocuteurId}
                        onChange={(value) =>
                            setForm((f) => ({ ...f, interlocuteurId: String(value) }))
                        }
                        options={[
                            { value: "", label: "Aucun / accès partagé" },
                            ...commerciaux.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                    />
                </div>

                <ModalFooter>
                    <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                        Annuler
                    </Button>
                    <Button onClick={submitForm} disabled={!form.login.trim() || isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Enregistrer
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
