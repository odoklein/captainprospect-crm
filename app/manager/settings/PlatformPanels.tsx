"use client";

// ============================================
// Manager settings — the "Plateforme" half: team call objective, transactional
// emails (sender + RDV template), Leexi, master password. Same settings and
// endpoints as before; each panel now loads only when its section is opened.
// ============================================

import { useEffect, useRef, useState } from "react";
import {
    AlertTriangle, Code2, Eye, Key, Link2, ListOrdered, Loader2, Mail, Megaphone, PhoneCall, RotateCcw, Send,
    ShieldCheck, Sparkles, Variable,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RDV_TEMPLATE_VARIABLES } from "@/lib/email/templates/rdv-notification";
import { PACE_DEFAULTS, PACE_LIMITS, PACE_THRESHOLDS } from "@/lib/sdr-pace/pace";
import { SegmentedControl, Shimmer, StatusPill } from "@/components/accueil/AccueilUI";
import {
    DANGER_BUTTON, Field, FormStatus, INPUT, Notice, PRIMARY_BUTTON, SaveBar, SettingsCard, SettingsLinkRow,
} from "@/components/settings/SettingsUI";

async function call<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new Error(json?.error || "Erreur lors de la sauvegarde");
    return json.data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : "Erreur de connexion");

// ════════════════════════════════════════════════════════════════════════════
// Équipe & objectifs
// ════════════════════════════════════════════════════════════════════════════

export function TeamGoalsPanel() {
    const toast = useToast();
    const [loaded, setLoaded] = useState(false);
    const [quota, setQuota] = useState(String(PACE_DEFAULTS.dailyQuota));
    const [hours, setHours] = useState(String(PACE_DEFAULTS.targetHours));
    const [saved, setSaved] = useState<{ dailyQuota: number; targetHours: number } | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        call<{ dailyQuota: number; targetHours: number }>("/api/system-config/sdr-pace")
            .then((d) => {
                setQuota(String(d.dailyQuota));
                setHours(String(d.targetHours));
                setSaved({ dailyQuota: d.dailyQuota, targetHours: d.targetHours });
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const q = Number(quota);
    const h = Number(hours);
    const valid =
        quota.trim() !== "" && hours.trim() !== "" &&
        Number.isInteger(q) && q >= PACE_LIMITS.dailyQuota.min && q <= PACE_LIMITS.dailyQuota.max &&
        Number.isFinite(h) && h >= PACE_LIMITS.targetHours.min && h <= PACE_LIMITS.targetHours.max;
    const dirty = saved === null || saved.dailyQuota !== q || saved.targetHours !== h;

    // Cumulative checkpoints for the values being typed (same rounding as the SDR indicator)
    const checkpoints = valid
        ? Array.from({ length: Math.floor(h) }, (_, i) => i + 1).map((hh) => ({ hours: hh, calls: Math.ceil((q * hh) / h - 1e-9) }))
        : [];

    const save = async () => {
        if (!valid) {
            setError(
                `Quota : entier entre ${PACE_LIMITS.dailyQuota.min} et ${PACE_LIMITS.dailyQuota.max} — ` +
                `durée : entre ${PACE_LIMITS.targetHours.min} et ${PACE_LIMITS.targetHours.max} h`,
            );
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const d = await call<{ dailyQuota: number; targetHours: number }>("/api/system-config/sdr-pace", jsonInit("PUT", { dailyQuota: q, targetHours: h }));
            setSaved({ dailyQuota: d.dailyQuota, targetHours: d.targetHours });
            toast.success("Objectif enregistré", "Appliqué immédiatement à tous les SDR.");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <SettingsCard
                icon={PhoneCall}
                tone="emerald"
                title="Objectif d'appels quotidien (SDR)"
                subtitle="Appliqué à tous les SDR · pris en compte immédiatement"
                right={saved ? <StatusPill tone="emerald" pulse>{saved.dailyQuota} appels / {saved.targetHours} h</StatusPill> : undefined}
            >
                {!loaded ? (
                    <Shimmer className="h-40" />
                ) : (
                    <div className="space-y-5">
                        <p className="text-sm font-medium text-zinc-600 leading-relaxed max-w-2xl">
                            Il alimente le dashboard et les notifications de rythme des SDR (dans le rythme, à rattraper, en retard).
                            Le quota de paie des profils RH n&apos;est pas modifié.
                        </p>

                        <div className="flex flex-wrap items-end gap-3">
                            <Field label="Appels par jour" className="w-40">
                                {(id) => (
                                    <input
                                        id={id}
                                        type="number"
                                        inputMode="numeric"
                                        min={PACE_LIMITS.dailyQuota.min}
                                        max={PACE_LIMITS.dailyQuota.max}
                                        step={1}
                                        value={quota}
                                        onChange={(e) => { setQuota(e.target.value); setError(null); }}
                                        className={cn(INPUT, "tabular-nums")}
                                    />
                                )}
                            </Field>
                            <Field label="Heures d'appel effectif" className="w-44">
                                {(id) => (
                                    <input
                                        id={id}
                                        type="number"
                                        inputMode="decimal"
                                        min={PACE_LIMITS.targetHours.min}
                                        max={PACE_LIMITS.targetHours.max}
                                        step={0.5}
                                        value={hours}
                                        onChange={(e) => { setHours(e.target.value); setError(null); }}
                                        className={cn(INPUT, "tabular-nums")}
                                    />
                                )}
                            </Field>
                            <div className="pb-[3px]">
                                <SegmentedControl
                                    ariaLabel="Raccourcis de quota"
                                    value={[70, 80, 90].includes(q) ? String(q) : ""}
                                    onChange={(v) => { setQuota(v); setError(null); }}
                                    options={[70, 80, 90].map((n) => ({ value: String(n), label: `${n} appels` }))}
                                />
                            </div>
                            <button type="button" onClick={save} disabled={saving || !valid || !dirty} className={cn(PRIMARY_BUTTON, "ml-auto")}>
                                {saving ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : <PhoneCall className="w-4 h-4 text-emerald-400" aria-hidden />}
                                {saving ? "Enregistrement…" : "Enregistrer l'objectif"}
                            </button>
                        </div>

                        {valid && (
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                                <p className="text-xs font-semibold text-zinc-500">
                                    Rythme théorique :{" "}
                                    <strong className="text-zinc-900 font-black">
                                        {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(q / h)} appels/heure
                                    </strong>
                                    {" "}· objectif cumulé attendu :
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {checkpoints.map((c) => (
                                        <span key={c.hours} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-zinc-700 tabular-nums shadow-2xs">
                                            <span className="text-zinc-400">{c.hours} h</span> {c.calls}
                                        </span>
                                    ))}
                                    {!Number.isInteger(h) && (
                                        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-800 tabular-nums">
                                            <span className="text-emerald-600">{h} h</span> {q}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <StatusPill tone="emerald">Dans le rythme : &lt; {PACE_THRESHOLDS.behindFrom} appels de retard</StatusPill>
                                    <StatusPill tone="amber">À rattraper : {PACE_THRESHOLDS.behindFrom} à {PACE_THRESHOLDS.lateFrom - 1}</StatusPill>
                                    <StatusPill tone="rose">En retard : {PACE_THRESHOLDS.lateFrom} et plus</StatusPill>
                                </div>
                            </div>
                        )}
                        <FormStatus error={error} />
                    </div>
                )}
            </SettingsCard>

            <SettingsLinkRow
                href="/manager/settings/statuses"
                icon={ListOrdered}
                tone="indigo"
                title="Statuts et catégories de résultat"
                description="Gérer les catégories (RDV, Rappel, Intéressé…) et associer chaque statut d'action à une catégorie pour les rapports et l'Activité client."
            />
        </>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Emails & modèles
// ════════════════════════════════════════════════════════════════════════════

interface TemplateData {
    key: string;
    name: string;
    subject: string;
    bodyHtml: string;
    isCustomized: boolean;
    defaultSubject: string;
    defaultBodyHtml: string;
}

const PREVIEW_VALUES: Record<string, string> = {
    "{{contactName}}": "Marie Dupont",
    "{{companyName}}": "Acme Corp",
    "{{missionName}}": "Mission Prospection Q2",
    "{{meetingDate}}": "lundi 10 mars 2026",
    "{{meetingTime}}": "14:30 (Paris)",
    "{{meetingTypeLabel}}": "Visioconférence",
    "{{meetingJoinUrl}}": "https://meet.google.com/abc-defg-hij",
    "{{meetingAddress}}": "12 Rue de la Paix, 75001 Paris",
    "{{meetingPhone}}": "+33 6 12 34 56 78",
    "{{portalUrl}}": "#",
};

function fillPreview(text: string): string {
    return Object.entries(PREVIEW_VALUES).reduce((acc, [k, v]) => acc.replaceAll(k, v), text);
}

export function EmailsPanel() {
    const [sender, setSender] = useState<{ from: string; source: "settings" | "env" | "none" } | null>(null);

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <SettingsLinkRow
                    href="/manager/broadcasts"
                    icon={Megaphone}
                    tone="indigo"
                    title="Hub Broadcasts & Notifications"
                    badge="Sans code"
                    description="Notifications automatiques (RDV, sécurité) et campagnes, avec l'éditeur visuel et l'aperçu réel."
                />
                <SettingsLinkRow
                    href="/manager/broadcasts?tab=campaign"
                    icon={Send}
                    tone="teal"
                    title="Campagnes & annonces"
                    description="Messages ciblés aux clients, commerciaux ou équipes, avec historique et taux d'ouverture."
                />
                <SettingsLinkRow
                    href="/manager/settings/security-email"
                    icon={ShieldCheck}
                    tone="violet"
                    title="Emails de sécurité"
                    description="Templates de récupération de mot de passe (lien) et OTP."
                />
            </div>
            <SenderCard onLoaded={setSender} />
            <RdvTemplateCard senderFrom={sender?.from || null} />
        </>
    );
}

function SenderCard({ onLoaded }: { onLoaded: (v: { from: string; source: "settings" | "env" | "none" }) => void }) {
    const toast = useToast();
    const [from, setFrom] = useState("");
    const [source, setSource] = useState<"settings" | "env" | "none" | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        call<{ from: string; source: "settings" | "env" | "none" }>("/api/system-config/transactional-email")
            .then((d) => {
                setFrom(d.from || "");
                setSource(d.source);
                onLoaded(d);
            })
            .catch(() => setSource("none"));
    }, [onLoaded]);

    const save = async () => {
        if (!from.trim()) {
            setError("Renseignez une adresse expéditeur");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const d = await call<{ from: string }>("/api/system-config/transactional-email", jsonInit("PUT", { from }));
            setSource("settings");
            setFrom(d.from || from);
            onLoaded({ from: d.from || from, source: "settings" });
            toast.success("Expéditeur enregistré");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!window.confirm("Réinitialiser l'expéditeur personnalisé et revenir à la variable d'environnement ?")) return;
        setSaving(true);
        setError(null);
        try {
            const d = await call<{ from: string; source: "settings" | "env" | "none" }>("/api/system-config/transactional-email", { method: "DELETE" });
            setSource(d.source);
            setFrom(d.from || "");
            onLoaded(d);
            toast.success("Expéditeur réinitialisé");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsCard
            icon={Mail}
            tone="indigo"
            title="Expéditeur des emails transactionnels"
            subtitle="Champ « From » des emails automatiques, dont la confirmation de RDV"
            right={
                source === "settings" ? <StatusPill tone="emerald">Personnalisé</StatusPill>
                    : source === "env" ? <StatusPill tone="amber">Via ENV</StatusPill>
                    : source === "none" ? <StatusPill tone="slate">Non configuré</StatusPill>
                    : undefined
            }
        >
            {source === null ? (
                <Shimmer className="h-20" />
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                        <Field
                            label="Adresse expéditeur"
                            icon={Mail}
                            className="flex-1"
                            hint={<>Si vide, la plateforme utilise <code className="font-mono text-zinc-600">SYSTEM_SMTP_FROM</code>.</>}
                        >
                            {(id) => (
                                <input
                                    id={id}
                                    value={from}
                                    onChange={(e) => { setFrom(e.target.value); setError(null); }}
                                    placeholder='Ex : "Captain Prospect" <notifications@captainprospect.fr>'
                                    className={cn(INPUT, "pl-10")}
                                />
                            )}
                        </Field>
                        <div className="flex items-center gap-2 md:mb-[22px]">
                            <button type="button" onClick={reset} disabled={saving || source !== "settings"} className={cn(DANGER_BUTTON, "h-11 rounded-2xl")}>
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                                Réinitialiser
                            </button>
                            <button type="button" onClick={save} disabled={saving || !from.trim()} className={PRIMARY_BUTTON}>
                                {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                                Enregistrer
                            </button>
                        </div>
                    </div>
                    <FormStatus error={error} />
                </div>
            )}
        </SettingsCard>
    );
}

function VarChip({ variable, onInsert }: { variable: { name: string; description: string }; onInsert: (name: string) => void }) {
    const [inserted, setInserted] = useState(false);
    return (
        <button
            type="button"
            title={variable.description}
            onClick={() => {
                onInsert(variable.name);
                setInserted(true);
                setTimeout(() => setInserted(false), 1200);
            }}
            className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border font-mono text-[11.5px] font-semibold transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
                inserted ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-slate-50 border-slate-200 text-zinc-700 hover:border-indigo-200 hover:bg-indigo-50/60",
            )}
        >
            <span className={cn("w-1.5 h-1.5 rounded-full", inserted ? "bg-indigo-500" : "bg-zinc-300")} aria-hidden />
            {variable.name}
        </button>
    );
}

function RdvTemplateCard({ senderFrom }: { senderFrom: string | null }) {
    const toast = useToast();
    const [template, setTemplate] = useState<TemplateData | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [baseline, setBaseline] = useState({ subject: "", body: "" });
    const [tab, setTab] = useState<"editor" | "preview">("editor");
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        call<TemplateData>("/api/system-templates/rdv_notification")
            .then((d) => {
                setTemplate(d);
                setSubject(d.subject);
                setBody(d.bodyHtml);
                setBaseline({ subject: d.subject, body: d.bodyHtml });
            })
            .catch(() => setLoadError(true));
    }, []);

    const dirty = template !== null && (subject !== baseline.subject || body !== baseline.body);

    const insertVariable = (v: string) => {
        setTab("editor");
        const ta = textareaRef.current;
        if (!ta) {
            setBody((prev) => prev + v);
            return;
        }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setBody(body.slice(0, start) + v + body.slice(end));
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + v.length, start + v.length);
        }, 0);
    };

    const save = async () => {
        setSaving(true);
        try {
            await call("/api/system-templates/rdv_notification", jsonInit("PUT", { subject, bodyHtml: body }));
            setBaseline({ subject, body });
            setTemplate((t) => (t ? { ...t, isCustomized: true } : t));
            toast.success("Template sauvegardé", "Utilisé dès le prochain RDV confirmé.");
        } catch (e) {
            toast.error("Erreur", errorText(e));
        } finally {
            setSaving(false);
        }
    };

    const restoreDefault = async () => {
        if (!template) return;
        if (!window.confirm("Remettre le template par défaut ? Vos modifications seront perdues.")) return;
        setResetting(true);
        try {
            await fetch("/api/system-templates/rdv_notification", { method: "DELETE" });
            setSubject(template.defaultSubject);
            setBody(template.defaultBodyHtml);
            setBaseline({ subject: template.defaultSubject, body: template.defaultBodyHtml });
            setTemplate((t) => (t ? { ...t, isCustomized: false } : t));
            toast.success("Template par défaut restauré");
        } finally {
            setResetting(false);
        }
    };

    const lines = body.split("\n").length;

    return (
        <>
            <SettingsCard
                icon={Mail}
                tone="emerald"
                title="Email de confirmation de RDV"
                subtitle="Envoyé automatiquement au client à chaque nouveau rendez-vous confirmé"
                right={
                    template?.isCustomized ? <StatusPill tone="indigo" icon={Sparkles}>Personnalisé</StatusPill>
                        : template ? <StatusPill tone="slate">Par défaut</StatusPill>
                        : undefined
                }
            >
                {loadError ? (
                    <Notice tone="rose" icon={AlertTriangle}>Impossible de charger le template pour le moment.</Notice>
                ) : !template ? (
                    <div className="space-y-3"><Shimmer className="h-11" /><Shimmer className="h-64" /></div>
                ) : (
                    <div className="space-y-5">
                        <Field
                            label="Objet de l'email"
                            hint={<>Aperçu : <span className="font-semibold italic text-zinc-600">{fillPreview(subject) || "—"}</span></>}
                        >
                            {(id) => (
                                <input
                                    id={id}
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Ex : Votre RDV avec {{companyName}}…"
                                    className={cn(INPUT, "font-mono text-[13px]")}
                                />
                            )}
                        </Field>

                        <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    <Variable className="w-3.5 h-3.5" aria-hidden /> Variables
                                </span>
                                <span className="text-[11px] font-semibold text-zinc-400">Cliquez pour insérer au curseur</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {RDV_TEMPLATE_VARIABLES.map((v) => <VarChip key={v.name} variable={v} onInsert={insertVariable} />)}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
                                <SegmentedControl
                                    ariaLabel="Mode d'affichage"
                                    value={tab}
                                    onChange={setTab}
                                    options={[
                                        { value: "editor", label: <span className="inline-flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" aria-hidden />Éditeur</span> },
                                        { value: "preview", label: <span className="inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" aria-hidden />Aperçu</span> },
                                    ]}
                                />
                                <span className="text-[11px] font-semibold text-zinc-400 tabular-nums">{lines} ligne{lines > 1 ? "s" : ""} · HTML</span>
                            </div>

                            {tab === "editor" ? (
                                <div className="relative bg-zinc-950">
                                    <div
                                        ref={gutterRef}
                                        aria-hidden
                                        className="absolute left-0 top-0 bottom-0 w-12 overflow-hidden pt-3 pr-3 text-right font-mono text-[11px] leading-[1.6rem] text-zinc-600 select-none pointer-events-none border-r border-white/5"
                                    >
                                        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
                                    </div>
                                    <textarea
                                        ref={textareaRef}
                                        aria-label="Corps HTML de l'email"
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        onScroll={(e) => {
                                            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                                        }}
                                        rows={22}
                                        spellCheck={false}
                                        className="block w-full pl-16 pr-4 py-3 font-mono text-[12.5px] leading-[1.6rem] text-zinc-200 bg-transparent resize-y min-h-[380px] outline-none caret-emerald-400 selection:bg-emerald-500/25"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col min-h-[380px]">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-white border-b border-slate-100 text-xs">
                                        <span className="font-bold text-zinc-500">De :</span>
                                        <span className="font-semibold text-zinc-700">{senderFrom || "Expéditeur par défaut (SYSTEM_SMTP_FROM)"}</span>
                                        <span className="font-bold text-zinc-500 ml-2">Objet :</span>
                                        <span className="font-semibold italic text-zinc-800 truncate">{fillPreview(subject)}</span>
                                    </div>
                                    <iframe
                                        srcDoc={fillPreview(body)}
                                        title="Aperçu email"
                                        className="flex-1 w-full border-0 min-h-[380px] bg-slate-100"
                                        sandbox="allow-same-origin"
                                    />
                                </div>
                            )}
                        </div>

                        {template.isCustomized && (
                            <button
                                type="button"
                                onClick={restoreDefault}
                                disabled={resetting}
                                className="group inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-rose-600 transition-colors disabled:opacity-40 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
                            >
                                <RotateCcw className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-rotate-45" aria-hidden />
                                {resetting ? "Réinitialisation…" : "Restaurer le template par défaut"}
                            </button>
                        )}
                    </div>
                )}
            </SettingsCard>
            <SaveBar
                dirty={dirty}
                saving={saving}
                onSave={save}
                onReset={() => { setSubject(baseline.subject); setBody(baseline.body); }}
                message="Template modifié — non enregistré"
                label="Sauvegarder le template"
            />
        </>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Intégrations
// ════════════════════════════════════════════════════════════════════════════

export function IntegrationsPanel() {
    const toast = useToast();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [source, setSource] = useState<"settings" | "env" | "none" | null>(null);
    const [keyId, setKeyId] = useState("");
    const [keySecret, setKeySecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // We only care if Leexi is enabled; keys never leave the server
    useEffect(() => {
        call<{ enabled: boolean; source: "settings" | "env" | "none" }>("/api/system-config/leexi")
            .then((d) => {
                setEnabled(d.enabled);
                setSource(d.source);
            })
            .catch(() => setEnabled(false));
    }, []);

    const save = async () => {
        if (!keyId || !keySecret) {
            setError("Renseignez l'identifiant et le secret API Leexi");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await call("/api/system-config/leexi", jsonInit("PUT", { keyId, keySecret }));
            setEnabled(true);
            setSource("settings");
            setKeyId("");
            setKeySecret("");
            toast.success("Leexi connecté", "Paramètres Leexi enregistrés.");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    const disable = async () => {
        if (!window.confirm("Désactiver la connexion Leexi ? Les imports de sessions ne fonctionneront plus.")) return;
        setSaving(true);
        setError(null);
        try {
            const d = await call<{ enabled: boolean; source: "settings" | "env" | "none" }>("/api/system-config/leexi", { method: "DELETE" });
            setEnabled(d.enabled);
            setSource(d.source);
            toast.success("Leexi désactivé");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsCard
            icon={Link2}
            tone="teal"
            title="Leexi — CR & sessions"
            subtitle="Créez sessions et comptes-rendus directement depuis les transcriptions"
            right={
                enabled === true ? <StatusPill tone="emerald" icon={ShieldCheck} pulse>Active</StatusPill>
                    : enabled === false ? <StatusPill tone="slate">Inactive</StatusPill>
                    : undefined
            }
        >
            {enabled === null ? (
                <Shimmer className="h-28" />
            ) : (
                <div className="space-y-4">
                    <p className="text-sm font-medium text-zinc-600 leading-relaxed max-w-2xl">
                        Les clés sont stockées côté serveur dans la configuration système, jamais dans le navigateur.
                    </p>
                    {source === "env" && (
                        <Notice tone="amber" icon={AlertTriangle}>
                            <p className="font-bold text-amber-900">Leexi est actuellement configuré via les variables d&apos;environnement.</p>
                            <p>Vous pouvez surcharger cette configuration en enregistrant des clés ici.</p>
                        </Notice>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Identifiant API (KEY_ID)" icon={Key}>
                            {(id) => (
                                <input id={id} value={keyId} onChange={(e) => { setKeyId(e.target.value); setError(null); }} placeholder="leexi_xxx…" autoComplete="off" className={cn(INPUT, "pl-10 font-mono text-[13px]")} />
                            )}
                        </Field>
                        <Field label="Secret API (KEY_SECRET)" icon={ShieldCheck}>
                            {(id) => (
                                <input id={id} type="password" value={keySecret} onChange={(e) => { setKeySecret(e.target.value); setError(null); }} placeholder="••••••••" autoComplete="new-password" className={cn(INPUT, "pl-10")} />
                            )}
                        </Field>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <FormStatus error={error} />
                        <div className="flex items-center gap-2 ml-auto">
                            <button type="button" onClick={disable} disabled={saving || !enabled} className={cn(DANGER_BUTTON, "h-11 rounded-2xl")}>
                                Désactiver
                            </button>
                            <button type="button" onClick={save} disabled={saving || !keyId || !keySecret} className={PRIMARY_BUTTON}>
                                {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                                {enabled ? "Remplacer les clés" : "Connecter Leexi"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SettingsCard>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// Accès — mot de passe maître
// ════════════════════════════════════════════════════════════════════════════

export function MasterPasswordPanel() {
    const toast = useToast();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        call<{ enabled: boolean }>("/api/system-config/master-password")
            .then((d) => setEnabled(d.enabled))
            .catch(() => setEnabled(false));
    }, []);

    const save = async () => {
        if (value.length < 6) {
            setError("Le mot de passe doit faire au moins 6 caractères");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await call("/api/system-config/master-password", jsonInit("PUT", { password: value }));
            const wasEnabled = enabled;
            setEnabled(true);
            setValue("");
            toast.success(wasEnabled ? "Mot de passe maître mis à jour" : "Mot de passe maître activé");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    const disable = async () => {
        if (!window.confirm("Désactiver le mot de passe maître ? Vous ne pourrez plus vous connecter avec celui-ci.")) return;
        setSaving(true);
        setError(null);
        try {
            await call("/api/system-config/master-password", { method: "DELETE" });
            setEnabled(false);
            toast.success("Mot de passe maître désactivé");
        } catch (e) {
            setError(errorText(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsCard
            icon={Key}
            tone="amber"
            title="Mot de passe maître"
            subtitle="Connexion à n'importe quel compte avec son email et ce mot de passe"
            right={
                enabled === true ? <StatusPill tone="amber" icon={ShieldCheck} pulse>Activé</StatusPill>
                    : enabled === false ? <StatusPill tone="slate">Désactivé</StatusPill>
                    : undefined
            }
        >
            {enabled === null ? (
                <Shimmer className="h-24" />
            ) : (
                <div className="space-y-4">
                    <Notice tone="amber" icon={AlertTriangle}>
                        Utilisation interne uniquement. Chaque connexion par mot de passe maître est signalée dans l&apos;historique de connexion du compte concerné.
                    </Notice>
                    <div className="flex flex-col md:flex-row md:items-end gap-3">
                        <Field label={enabled ? "Changer le mot de passe" : "Mot de passe maître"} icon={Key} className="flex-1 md:max-w-md">
                            {(id) => (
                                <input
                                    id={id}
                                    type="password"
                                    value={value}
                                    onChange={(e) => { setValue(e.target.value); setError(null); }}
                                    placeholder={enabled ? "Nouveau mot de passe (6+ caractères)" : "6 caractères minimum"}
                                    autoComplete="new-password"
                                    className={cn(INPUT, "pl-10")}
                                />
                            )}
                        </Field>
                        <div className="flex items-center gap-2">
                            {enabled && (
                                <button type="button" onClick={disable} disabled={saving} className={cn(DANGER_BUTTON, "h-11 rounded-2xl")}>
                                    Désactiver
                                </button>
                            )}
                            <button type="button" onClick={save} disabled={saving || value.length < 6} className={PRIMARY_BUTTON}>
                                {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                                {saving ? "Enregistrement…" : enabled ? "Mettre à jour" : "Activer"}
                            </button>
                        </div>
                    </div>
                    <FormStatus error={error} />
                </div>
            )}
        </SettingsCard>
    );
}
