"use client";

/**
 * The only component in the app that renders a vault password.
 *
 * Masked until asked for, copyable, and self-destructing: after SECRET_TTL_MS
 * it calls `onExpire` so the holder drops it from state. Shared by the vault
 * list and the assistant panel so that behaviour cannot drift between them.
 */

import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";

export const SECRET_TTL_MS = 120_000;

export interface RevealedSecret {
    label: string;
    login: string;
    password: string;
}

export function SecretCard({
    secret,
    onExpire,
}: {
    secret: RevealedSecret;
    onExpire: () => void;
}) {
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState<"login" | "password" | null>(null);
    const [remaining, setRemaining] = useState(Math.round(SECRET_TTL_MS / 1000));

    useEffect(() => {
        const tick = setInterval(() => {
            setRemaining((r) => {
                if (r <= 1) {
                    clearInterval(tick);
                    onExpire();
                    return 0;
                }
                return r - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [onExpire]);

    const copy = async (value: string, which: "login" | "password") => {
        await navigator.clipboard.writeText(value);
        setCopied(which);
        setTimeout(() => setCopied(null), 1500);
    };

    return (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{secret.label}</span>
                <span className="ml-auto shrink-0 font-normal text-emerald-700">
                    masqué dans {remaining}s
                </span>
            </div>

            <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-slate-500">Identifiant</span>
                    <code className="flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs text-slate-800">
                        {secret.login}
                    </code>
                    <button
                        type="button"
                        onClick={() => copy(secret.login, "login")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        title="Copier l'identifiant"
                    >
                        {copied === "login" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                            <Copy className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-slate-500">Mot de passe</span>
                    <code className="flex-1 truncate rounded-lg bg-white px-2 py-1 font-mono text-xs text-slate-800">
                        {visible ? secret.password : "••••••••••••••••"}
                    </code>
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        title={visible ? "Masquer" : "Afficher"}
                    >
                        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => copy(secret.password, "password")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                        title="Copier le mot de passe"
                    >
                        {copied === "password" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                            <Copy className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
