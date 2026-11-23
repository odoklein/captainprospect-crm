"use client";

// ============================================
// One integration key: its state (StateDot) and the form to add, replace, test or
// remove it (KeyEditor). Used by the tiles' side panel (IntegrationKeysPanel) and the
// Onoff card (OnoffPanel). Values go in, never come back: only the source and the
// last four characters (lib/integrations/store).
// ============================================

import { useRef, useState } from "react";
import { ChevronDown, CircleCheck, CircleX, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
import { NotetakerKeyHelp } from "@/components/notetakers/NotetakerKeyHelp";
import { DANGER_BUTTON, FormStatus, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/settings/SettingsUI";
import { notetakerForKey } from "@/lib/notetakers/catalog";
import type { IntegrationKeyStatus } from "@/lib/integrations/store";

export async function callIntegrations<T>(init?: RequestInit): Promise<T> {
    const res = await fetch("/api/manager/integrations", init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur lors de la sauvegarde");
    return json.data as T;
}

export const putIntegrationKeys = (values: Record<string, string | null>) =>
    callIntegrations<{ changed: string[]; keys: IntegrationKeyStatus[] }>({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
    });

const shortDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : null;

export const isOn = (k: IntegrationKeyStatus | undefined) => !!k && k.source !== "none";

export function StateDot({ item }: { item: IntegrationKeyStatus }) {
    const look =
        item.source === "stored"
            ? { dot: "bg-emerald-500", text: "text-emerald-700", label: "Connecté" }
            : item.source === "env"
              ? { dot: "bg-amber-500", text: "text-amber-700", label: "Valeur serveur" }
              : { dot: "bg-slate-300", text: "text-ink-3", label: "À connecter" };
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold", look.text)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", look.dot)} aria-hidden />
            {look.label}
        </span>
    );
}

// ── Editor (side panel, or in place when embedded) ──────────────────────────

export function KeyEditor({
    item,
    keys,
    onSaved,
    autoEdit,
    compact,
}: {
    item: IntegrationKeyStatus;
    keys: IntegrationKeyStatus[];
    onSaved: (k: IntegrationKeyStatus[]) => void;
    /** Opens with the input showing (missing key, or reached from « Connecter »). */
    autoEdit?: boolean;
    /** No description block (inside another card). */
    compact?: boolean;
}) {
    const toast = useToast();
    const tool = notetakerForKey(item.name);
    // One « Tester » per tool, once all its keys are saved (Gong has two).
    const testable = !!tool && tool.keys.every((n) => isOn(keys.find((x) => x.name === n)));
    const [editing, setEditing] = useState(!!autoEdit);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const r = await putIntegrationKeys({ [item.name]: value });
            onSaved(r.keys);
            setEditing(false);
            setValue("");
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
            const r = await putIntegrationKeys({ [item.name]: null });
            onSaved(r.keys);
            const next = r.keys.find((k) => k.name === item.name);
            toast.success(`${item.label} retirée`, next?.source === "env" ? "La valeur d'origine du serveur reprend le relais." : "La fonction est désactivée.");
            if (next?.source === "none") setEditing(true);
        } catch (e) {
            toast.error("Échec", e instanceof Error ? e.message : "Erreur de connexion");
        } finally {
            setBusy(false);
        }
    };

    const when = shortDate(item.updatedAt);

    return (
        <div className="space-y-5">
            {!compact && <p className="text-sm font-medium text-ink-2 leading-relaxed">{item.usedFor}</p>}

            <div className="rounded-2xl bg-surface-2 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <StateDot item={item} />
                    <p className="text-xs font-medium text-ink-3 truncate">
                        {item.source === "stored" && <>Clé <code className="font-bold text-ink-2">{item.hint}</code>{(item.updatedBy || when) && ` · ${[item.updatedBy, when].filter(Boolean).join(" · ")}`}</>}
                        {item.source === "env" && <>Écrite dans le serveur à la création du CRM · <code className="font-bold text-ink-2">{item.hint}</code></>}
                        {item.source === "none" && "Sans clé, cette fonction est désactivée."}
                    </p>
                </div>
                {!editing && (
                    <button type="button" onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }} disabled={busy} className={SECONDARY_BUTTON}>
                        <KeyRound className="w-3.5 h-3.5" aria-hidden />
                        {item.source === "none" ? "Ajouter" : "Remplacer"}
                    </button>
                )}
            </div>

            {editing && (
                <form
                    className="space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (value.trim()) void save();
                    }}
                >
                    <label className="text-[11px] font-bold text-ink-3" htmlFor={`key-${item.name}`}>
                        {item.source === "none" ? "Collez la clé" : "Nouvelle clé"}
                    </label>
                    <input
                        ref={inputRef}
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
                        placeholder={item.placeholder ?? "Collez la clé"}
                        className={cn(INPUT, "font-mono text-[13px]")}
                    />
                    <FormStatus error={error} />
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        {item.docsUrl && !tool ? (
                            <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-ink-3 hover:text-ink">
                                Où trouver cette clé <ExternalLink className="w-3 h-3" aria-hidden />
                            </a>
                        ) : <span />}
                        <div className="flex gap-2">
                            {item.source !== "none" && (
                                <button type="button" onClick={() => { setEditing(false); setValue(""); setError(null); }} disabled={busy} className={SECONDARY_BUTTON}>Annuler</button>
                            )}
                            <button type="submit" disabled={busy || !value.trim()} className={cn(PRIMARY_BUTTON, "h-9 rounded-xl")}>
                                {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                                Enregistrer
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {tool && <NotetakerKeyHelp id={tool.id} />}

            {(testable || item.source === "stored") && (
                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-line">
                    {testable && (
                        <button type="button" onClick={runTest} disabled={busy || testing} className={SECONDARY_BUTTON}>
                            {testing && <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden />}
                            Tester la connexion
                        </button>
                    )}
                    {item.source === "stored" && (
                        <button type="button" onClick={remove} disabled={busy} className={cn(DANGER_BUTTON, "ml-auto")}>
                            Retirer la clé
                        </button>
                    )}
                    {tested && (
                        <p role="status" className={cn("w-full inline-flex items-start gap-1.5 text-xs font-semibold", tested.ok ? "text-emerald-700" : "text-rose-700")}>
                            {tested.ok ? <CircleCheck className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden /> : <CircleX className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />}
                            {tested.message}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/** The key's state on one line; « Gérer » opens the editor in place. */
export function KeyLine({ item, keys, onSaved, defaultOpen }: { item: IntegrationKeyStatus; keys: IntegrationKeyStatus[]; onSaved: (k: IntegrationKeyStatus[]) => void; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen ?? item.source === "none");
    return (
        <div className="rounded-xl border border-line">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("w-full flex items-center gap-2 px-3 h-11 text-left rounded-xl", FOCUS)}>
                <span className="text-xs font-bold text-ink flex-1 truncate">{item.label}</span>
                <StateDot item={item} />
                {item.source !== "none" && <code className="text-[11px] font-bold text-ink-3">{item.hint}</code>}
                <ChevronDown className={cn("w-4 h-4 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && (
                <div className="px-3 pb-3">
                    <KeyEditor item={item} keys={keys} onSaved={onSaved} autoEdit={item.source === "none"} compact />
                </div>
            )}
        </div>
    );
}
