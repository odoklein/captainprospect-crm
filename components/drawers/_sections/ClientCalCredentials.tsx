"use client";

/**
 * Credentials of the calendar account (Cal.com, Calendly…) created for a client
 * during onboarding.
 *
 * The password never travels with the rest of the client payload: this card only
 * learns whether one is on file, and asks for it explicitly when a manager clicks
 * "Afficher". That reveal is recorded server-side and shown at the bottom of the
 * card, so it stays obvious who looked at what.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    Copy,
    Eye,
    EyeOff,
    ExternalLink,
    KeyRound,
    Loader2,
    Pencil,
    Trash2,
    X,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { InlineText } from "../_inline/InlineField";

// Plain text is wiped from React state after this long, so a revealed password
// doesn't linger on screen behind someone's back.
const REVEAL_TTL_MS = 60_000;

export interface CalCredentialDTO {
    login: string;
    loginUrl: string | null;
    notes: string | null;
    hasPassword: boolean;
    updatedAt: string;
    updatedBy: { id: string; name: string } | null;
    lastRevealedAt: string | null;
    lastRevealedBy: { id: string; name: string } | null;
}

export function calCredentialQueryKey(clientId: string) {
    return ["client-cal-credential", clientId] as const;
}

function formatStamp(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function ClientCalCredentials({ clientId }: { clientId: string }) {
    const { success, error: showError } = useToast();
    const queryClient = useQueryClient();
    const queryKey = calCredentialQueryKey(clientId);

    const [revealed, setRevealed] = useState<string | null>(null);
    const [editingPassword, setEditingPassword] = useState(false);
    const [passwordDraft, setPasswordDraft] = useState("");
    const [creating, setCreating] = useState(false);
    const [newLogin, setNewLogin] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const hideTimer = useRef<number | null>(null);

    const { data: credential, isLoading } = useQuery<CalCredentialDTO | null>({
        queryKey,
        queryFn: async () => {
            const res = await fetch(`/api/clients/${clientId}/cal-credentials`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Chargement impossible");
            return json.data as CalCredentialDTO | null;
        },
    });

    const hideRevealed = useCallback(() => {
        setRevealed(null);
        if (hideTimer.current) {
            window.clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    }, []);

    useEffect(() => () => {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
    }, []);

    const save = useMutation({
        mutationFn: async (patch: Record<string, unknown>) => {
            const res = await fetch(`/api/clients/${clientId}/cal-credentials`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Enregistrement impossible");
            return json.data as CalCredentialDTO;
        },
        onSuccess: (data) => {
            queryClient.setQueryData(queryKey, data);
            success("Enregistré", "Accès agenda mis à jour");
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const reveal = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/clients/${clientId}/cal-credentials`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reveal" }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Affichage impossible");
            return json.data.password as string;
        },
        onSuccess: (password) => {
            setRevealed(password);
            queryClient.invalidateQueries({ queryKey });
            hideTimer.current = window.setTimeout(hideRevealed, REVEAL_TTL_MS);
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const remove = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/clients/${clientId}/cal-credentials`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Suppression impossible");
        },
        onSuccess: () => {
            hideRevealed();
            setConfirmDelete(false);
            queryClient.setQueryData(queryKey, null);
            success("Supprimé", "Accès agenda retiré");
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const copy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        success("Copié", `${label} copié dans le presse-papier`);
    };

    // ── Loading ──────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
            </div>
        );
    }

    // ── Empty state ──────────────────────────────────────────────────────────
    if (!credential) {
        if (!creating) {
            return (
                <div className="text-center py-6">
                    <KeyRound className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">
                        Aucun accès agenda enregistré pour ce client.
                    </p>
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold uppercase tracking-wider transition-colors"
                    >
                        Enregistrer les identifiants
                    </button>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Identifiant
                    </p>
                    <input
                        autoFocus
                        value={newLogin}
                        onChange={(e) => setNewLogin(e.target.value)}
                        placeholder="agenda@client.com"
                        className="w-full px-2.5 py-1.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Mot de passe
                    </p>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-2.5 py-1.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <div className="flex items-center gap-2 pt-1">
                    <button
                        type="button"
                        disabled={!newLogin.trim() || save.isPending}
                        onClick={() =>
                            save.mutate(
                                { login: newLogin.trim(), password: newPassword },
                                {
                                    onSuccess: () => {
                                        setCreating(false);
                                        setNewLogin("");
                                        setNewPassword("");
                                    },
                                },
                            )
                        }
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {save.isPending ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCreating(false);
                            setNewLogin("");
                            setNewPassword("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors"
                    >
                        Annuler
                    </button>
                </div>
            </div>
        );
    }

    // ── Filled state ─────────────────────────────────────────────────────────
    return (
        <div className="space-y-3">
            <InlineText
                label="Identifiant"
                value={credential.login}
                onSave={(v) => save.mutateAsync({ login: v })}
                trailing={
                    credential.login ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                copy(credential.login, "Identifiant");
                            }}
                            className="text-slate-300 hover:text-slate-500"
                            aria-label="Copier l'identifiant"
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    ) : null
                }
            />

            {/* Password — masked by default, revealed only on demand */}
            <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Mot de passe
                </p>

                {editingPassword ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            autoFocus
                            type="text"
                            value={passwordDraft}
                            onChange={(e) => setPasswordDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    setEditingPassword(false);
                                    setPasswordDraft("");
                                }
                            }}
                            placeholder="Nouveau mot de passe"
                            className="flex-1 px-2.5 py-1.5 text-sm font-mono text-slate-900 bg-white border border-indigo-400 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                            type="button"
                            disabled={save.isPending}
                            onClick={() =>
                                save.mutate(
                                    { password: passwordDraft },
                                    {
                                        onSuccess: () => {
                                            setEditingPassword(false);
                                            setPasswordDraft("");
                                            hideRevealed();
                                        },
                                    },
                                )
                            }
                            className="w-6 h-6 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors"
                            aria-label="Enregistrer le mot de passe"
                        >
                            <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingPassword(false);
                                setPasswordDraft("");
                            }}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                            aria-label="Annuler"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 -mx-2.5 rounded-lg">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span
                            className={
                                "flex-1 text-sm truncate " +
                                (credential.hasPassword
                                    ? "text-slate-900 font-medium font-mono"
                                    : "text-slate-400 italic")
                            }
                        >
                            {!credential.hasPassword
                                ? "Non renseigné"
                                : revealed ?? "••••••••••••"}
                        </span>

                        {credential.hasPassword && (
                            <>
                                <button
                                    type="button"
                                    disabled={reveal.isPending}
                                    onClick={() => (revealed ? hideRevealed() : reveal.mutate())}
                                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                                    aria-label={revealed ? "Masquer" : "Afficher le mot de passe"}
                                    title={revealed ? "Masquer" : "Afficher le mot de passe"}
                                >
                                    {reveal.isPending ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : revealed ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                    )}
                                </button>
                                {revealed && (
                                    <button
                                        type="button"
                                        onClick={() => copy(revealed, "Mot de passe")}
                                        className="text-slate-400 hover:text-slate-600 transition-colors"
                                        aria-label="Copier le mot de passe"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                setPasswordDraft(revealed ?? "");
                                setEditingPassword(true);
                            }}
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                            aria-label="Modifier le mot de passe"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {revealed && (
                    <p className="text-[11px] text-amber-600 mt-1">
                        Masqué automatiquement dans {Math.round(REVEAL_TTL_MS / 1000)} s.
                    </p>
                )}
            </div>

            <InlineText
                label="URL de connexion"
                value={credential.loginUrl || ""}
                type="url"
                placeholder="https://app.cal.com/auth/login"
                onSave={(v) => save.mutateAsync({ loginUrl: v })}
                trailing={
                    credential.loginUrl ? (
                        <a
                            href={credential.loginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-300 hover:text-indigo-600"
                            aria-label="Ouvrir la page de connexion"
                        >
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    ) : null
                }
            />

            <InlineText
                label="Notes"
                value={credential.notes || ""}
                placeholder="2FA, email de récupération…"
                multiline
                onSave={(v) => save.mutateAsync({ notes: v })}
            />

            <div className="pt-3 mt-1 border-t border-slate-100 flex items-end justify-between gap-3">
                <div className="text-[11px] text-slate-400 leading-relaxed">
                    <p>
                        Modifié le {formatStamp(credential.updatedAt)}
                        {credential.updatedBy ? ` par ${credential.updatedBy.name}` : ""}
                    </p>
                    <p>
                        Dernier affichage&nbsp;:{" "}
                        {credential.lastRevealedAt
                            ? `${formatStamp(credential.lastRevealedAt)}${
                                credential.lastRevealedBy
                                    ? ` par ${credential.lastRevealedBy.name}`
                                    : ""
                            }`
                            : "jamais"}
                    </p>
                </div>

                {confirmDelete ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate()}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                            {remove.isPending ? "Suppression…" : "Confirmer"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
                        >
                            Annuler
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                        <Trash2 className="w-3 h-3" /> Supprimer
                    </button>
                )}
            </div>
        </div>
    );
}
