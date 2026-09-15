"use client";

/**
 * ============================================================
 * COFFRE D'ACCÈS — credential list
 * ============================================================
 * The manual half of the module: everything the assistant can do by chat is
 * also one click away here, for when you already know what you want.
 *
 * Grouped by mission ("projet") because that is how the work is organised —
 * a client's accesses are rarely thought about as one flat pile.
 */

import { useCallback, useMemo, useState } from "react";
import {
    Calendar,
    Globe,
    KeyRound,
    Linkedin,
    Mail,
    MoreHorizontal,
    Phone,
    RefreshCw,
    Send,
    ShieldQuestion,
    Trash2,
    Unlock,
} from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";
import { SecretCard, type RevealedSecret } from "./SecretCard";

export interface VaultCredential {
    id: string;
    type: string;
    label: string;
    login: string;
    url: string | null;
    notes: string | null;
    hasPassword: boolean;
    client: { id: string; name: string };
    mission: { id: string; name: string } | null;
    interlocuteur: { id: string; name: string } | null;
    portalUser: { id: string; email: string; role: string } | null;
    lastRevealedAt: string | null;
    lastRevealedBy: { id: string; name: string } | null;
    lastSentAt: string | null;
    lastSentTo: string | null;
    updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
    PORTAL: "Portail CP",
    EMAIL: "Email",
    CALENDAR: "Agenda",
    CRM_EXTERNAL: "CRM externe",
    LINKEDIN: "LinkedIn",
    PHONE_TOOL: "Téléphonie",
    OTHER: "Autre",
};

const TYPE_ICONS: Record<string, typeof KeyRound> = {
    PORTAL: KeyRound,
    EMAIL: Mail,
    CALENDAR: Calendar,
    CRM_EXTERNAL: Globe,
    LINKEDIN: Linkedin,
    PHONE_TOOL: Phone,
    OTHER: ShieldQuestion,
};

function formatDate(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

interface VaultCredentialListProps {
    credentials: VaultCredential[];
    isLoading?: boolean;
    onChanged: () => void;
}

export default function VaultCredentialList({
    credentials,
    isLoading,
    onChanged,
}: VaultCredentialListProps) {
    const { success, error: toastError } = useToast();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [secrets, setSecrets] = useState<Record<string, RevealedSecret>>({});

    // Grouped by mission, with the client-wide ones first.
    const groups = useMemo(() => {
        const map = new Map<string, { title: string; rows: VaultCredential[] }>();
        for (const credential of credentials) {
            const key = credential.mission?.id ?? "__client__";
            const title = credential.mission?.name ?? "Accès client (toutes missions)";
            const group = map.get(key) ?? { title, rows: [] };
            group.rows.push(credential);
            map.set(key, group);
        }
        return Array.from(map.entries())
            .sort(([a], [b]) => (a === "__client__" ? -1 : b === "__client__" ? 1 : 0))
            .map(([key, group]) => ({ key, ...group }));
    }, [credentials]);

    const callAction = useCallback(
        async (credential: VaultCredential, action: "reveal" | "rotate" | "send") => {
            setBusyId(credential.id);
            setOpenMenuId(null);
            try {
                const response = await fetch(`/api/manager/vault/${credential.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || "Action impossible");
                const data = payload.data ?? payload;

                if (action === "send") {
                    success("Identifiants envoyés", data.message);
                } else {
                    setSecrets((prev) => ({
                        ...prev,
                        [credential.id]: {
                            label: credential.label,
                            login: data.login ?? credential.login,
                            password: data.password,
                        },
                    }));
                    if (action === "rotate") {
                        success(
                            "Mot de passe régénéré",
                            data.portalSynced
                                ? "Le compte portail a été mis à jour."
                                : "Pense à le changer aussi chez le fournisseur.",
                        );
                    }
                }
                onChanged();
            } catch (error) {
                toastError(
                    "Action impossible",
                    error instanceof Error ? error.message : undefined,
                );
            } finally {
                setBusyId(null);
            }
        },
        [onChanged, success, toastError],
    );

    const remove = useCallback(
        async (credential: VaultCredential) => {
            const confirmed = window.confirm(
                `Supprimer « ${credential.label} » du coffre ?\n\nLe mot de passe stocké sera définitivement perdu. Le compte lui-même n'est pas supprimé.`,
            );
            if (!confirmed) return;

            setBusyId(credential.id);
            setOpenMenuId(null);
            try {
                const response = await fetch(`/api/manager/vault/${credential.id}`, {
                    method: "DELETE",
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw new Error(payload?.error || "Suppression impossible");
                }
                success("Accès supprimé");
                onChanged();
            } catch (error) {
                toastError(
                    "Suppression impossible",
                    error instanceof Error ? error.message : undefined,
                );
            } finally {
                setBusyId(null);
            }
        },
        [onChanged, success, toastError],
    );

    const clearSecret = useCallback((id: string) => {
        setSecrets((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                ))}
            </div>
        );
    }

    if (credentials.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <KeyRound className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">Aucun accès enregistré</p>
                <p className="mt-1 text-sm text-slate-500">
                    Demande à l&apos;assistant de créer les comptes portail manquants, ou enregistre
                    un accès existant.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {groups.map((group) => (
                <div key={group.key}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {group.title}
                    </p>

                    <div className="space-y-2">
                        {group.rows.map((credential) => {
                            const Icon = TYPE_ICONS[credential.type] ?? ShieldQuestion;
                            const secret = secrets[credential.id];

                            return (
                                <div
                                    key={credential.id}
                                    className="rounded-xl border border-slate-200 bg-white p-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                            <Icon className="h-4 w-4" />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-sm font-medium text-slate-900">
                                                    {credential.label}
                                                </p>
                                                <Badge variant="default">
                                                    {TYPE_LABELS[credential.type] ?? credential.type}
                                                </Badge>
                                                {!credential.hasPassword && (
                                                    <Badge variant="warning">
                                                        Sans mot de passe
                                                    </Badge>
                                                )}
                                            </div>

                                            <p className="mt-0.5 truncate text-xs text-slate-500">
                                                {credential.login}
                                                {credential.interlocuteur
                                                    ? ` · ${credential.interlocuteur.name}`
                                                    : ""}
                                            </p>

                                            <p className="mt-1 text-[11px] text-slate-400">
                                                {credential.lastRevealedAt
                                                    ? `Dernière consultation : ${formatDate(credential.lastRevealedAt)}${
                                                          credential.lastRevealedBy
                                                              ? ` par ${credential.lastRevealedBy.name}`
                                                              : ""
                                                      }`
                                                    : "Jamais consulté"}
                                                {credential.lastSentAt
                                                    ? ` · Envoyé le ${formatDate(credential.lastSentAt)}`
                                                    : ""}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={!credential.hasPassword || busyId === credential.id}
                                                isLoading={busyId === credential.id}
                                                onClick={() => callAction(credential, "reveal")}
                                            >
                                                <Unlock className="h-3.5 w-3.5" />
                                                Afficher
                                            </Button>

                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setOpenMenuId((id) =>
                                                            id === credential.id ? null : credential.id,
                                                        )
                                                    }
                                                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                                    aria-label="Autres actions"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>

                                                {openMenuId === credential.id && (
                                                    <>
                                                        <div
                                                            className="fixed inset-0 z-10"
                                                            onClick={() => setOpenMenuId(null)}
                                                        />
                                                        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    callAction(credential, "rotate")
                                                                }
                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                            >
                                                                <RefreshCw className="h-3.5 w-3.5" />
                                                                Régénérer le mot de passe
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!credential.hasPassword}
                                                                onClick={() =>
                                                                    callAction(credential, "send")
                                                                }
                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                                            >
                                                                <Send className="h-3.5 w-3.5" />
                                                                Envoyer par email
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => remove(credential)}
                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                Supprimer du coffre
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {secret && (
                                        <SecretCard
                                            secret={secret}
                                            onExpire={() => clearSecret(credential.id)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

export { TYPE_LABELS as VAULT_TYPE_SHORT_LABELS };
