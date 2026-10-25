"use client";

// ============================================
// Manager settings — "Identité": this instance's white-label brand (names,
// URLs and senders, locale, colours, font, logos). Stored in BrandSettings
// through /api/manager/brand; every change is audited. Saving refreshes the
// router so the root layout re-renders with the new brand at once.
// The preview runs the same resolver as the server (lib/brand/resolve), so
// what is shown here is exactly what the app will render.
// ============================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle, Building2, Globe, ImageIcon, Languages, Loader2, Palette, RotateCcw, Trash2, Type, Upload,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Shimmer, StatusPill } from "@/components/accueil/AccueilUI";
import {
    DANGER_BUTTON, Field, INPUT, Notice, SECONDARY_BUTTON, SaveBar, SettingsCard,
} from "@/components/settings/SettingsUI";
import { resolveBrand, type Brand } from "@/lib/brand";
import { SHADES, contrast, type Ramp } from "@/lib/brand/color";
import { isHexColor } from "@/lib/brand/resolve";
import {
    BRAND_ASSET_COLUMNS, BRAND_ASSET_LABELS, BRAND_ASSET_SLOTS, BRAND_EDITABLE_FIELDS, FONT_PRESETS,
    type BrandAssetSlot, type BrandEditableField, type BrandSettingsValues, type FontPresetId,
} from "@/lib/brand/types";

type Form = Omit<Pick<BrandSettingsValues, BrandEditableField>, "emailDomains"> & { emailDomains: string };
type FieldErrors = Record<string, string>;

type BrandPayload = { settings: BrandSettingsValues; brand: Brand; storageConfigured?: boolean };

class ApiError extends Error {
    constructor(message: string, public errors?: FieldErrors) {
        super(message);
    }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!json?.success) throw new ApiError(json?.error || "Erreur lors de la sauvegarde", json?.errors);
    return json.data as T;
}

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : "Erreur de connexion");

function toForm(s: BrandSettingsValues): Form {
    const f = {} as Record<string, unknown>;
    for (const k of BRAND_EDITABLE_FIELDS) f[k] = s[k];
    f.emailDomains = s.emailDomains.join(", ");
    return f as Form;
}

function toPayload(f: Form) {
    return {
        ...f,
        emailDomains: f.emailDomains.split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean),
    };
}

const LANGS = [
    { value: "fr", label: "Français" },
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "de", label: "Deutsch" },
    { value: "it", label: "Italiano" },
    { value: "nl", label: "Nederlands" },
    { value: "pt", label: "Português" },
];

const SLOT_HINTS: Record<BrandAssetSlot, string> = {
    full: "Connexion, PDF, emails · PNG, WebP ou SVG, fond transparent",
    fullInverse: "Barre latérale, emails sombres · même format que le logo complet",
    mark: "Carré 512×512, fond transparent",
    markInverse: "Carré 512×512, sur la couleur principale",
    favicon: "Onglet du navigateur · carré 512×512",
    appleTouchIcon: "Écran d'accueil iOS · 180×180, fond opaque",
};

const INVERSE_SLOTS = new Set<BrandAssetSlot>(["fullInverse", "markInverse"]);

function timeZones(): string[] {
    try {
        const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
        return intl.supportedValuesOf?.("timeZone") ?? [];
    } catch {
        return [];
    }
}

// ════════════════════════════════════════════════════════════════════════════

export function BrandingPanel() {
    const toast = useToast();
    const router = useRouter();
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saved, setSaved] = useState<BrandSettingsValues | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [effectiveAppUrl, setEffectiveAppUrl] = useState<string | null>(null);
    const [storageConfigured, setStorageConfigured] = useState(true);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [uploading, setUploading] = useState<BrandAssetSlot | null>(null);

    useEffect(() => {
        call<BrandPayload>("/api/manager/brand")
            .then((d) => {
                setSaved(d.settings);
                setForm(toForm(d.settings));
                setEffectiveAppUrl(d.brand.appUrl);
                setStorageConfigured(d.storageConfigured !== false);
            })
            .catch((e) => setLoadError(errorText(e)))
            .finally(() => setLoaded(true));
    }, []);

    const applied = (d: BrandPayload) => {
        setSaved(d.settings);
        setForm(toForm(d.settings));
        setEffectiveAppUrl(d.brand.appUrl);
        setErrors({});
        router.refresh();
    };

    const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(toForm(saved));

    // Same resolver as the server: invalid values fall back exactly as they would there.
    const preview = useMemo(
        () => (form && saved ? resolveBrand({ ...saved, ...toPayload(form) }) : null),
        [form, saved],
    );
    const savedBrand = useMemo(() => (saved ? resolveBrand(saved) : null), [saved]);
    const zones = useMemo(timeZones, []);

    const set = <K extends keyof Form>(key: K, value: Form[K]) => {
        setForm((f) => (f ? { ...f, [key]: value } : f));
        setErrors((e) => {
            if (!e[key as string]) return e;
            const next = { ...e };
            delete next[key as string];
            return next;
        });
    };

    const save = async () => {
        if (!form) return;
        setSaving(true);
        try {
            const d = await call<BrandPayload>("/api/manager/brand", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toPayload(form)),
            });
            applied(d);
            toast.success("Identité enregistrée", "Appliquée à toute la plateforme.");
        } catch (e) {
            if (e instanceof ApiError && e.errors) setErrors(e.errors);
            toast.error("Enregistrement impossible", errorText(e));
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!window.confirm("Revenir à l'identité par défaut ? Noms, couleurs, police et logos seront réinitialisés.")) return;
        setResetting(true);
        try {
            applied(await call<BrandPayload>("/api/manager/brand/reset", { method: "POST" }));
            toast.success("Identité réinitialisée");
        } catch (e) {
            toast.error("Réinitialisation impossible", errorText(e));
        } finally {
            setResetting(false);
        }
    };

    const upload = async (slot: BrandAssetSlot, file: File) => {
        setUploading(slot);
        try {
            const body = new FormData();
            body.append("slot", slot);
            body.append("file", file);
            applied(await call<BrandPayload>("/api/manager/brand/assets", { method: "POST", body }));
            toast.success("Logo mis à jour", BRAND_ASSET_LABELS[slot]);
        } catch (e) {
            toast.error("Envoi impossible", errorText(e));
        } finally {
            setUploading(null);
        }
    };

    const removeAsset = async (slot: BrandAssetSlot) => {
        if (!window.confirm(`Retirer « ${BRAND_ASSET_LABELS[slot]} » et revenir au fichier par défaut ?`)) return;
        setUploading(slot);
        try {
            applied(await call<BrandPayload>(`/api/manager/brand/assets?slot=${slot}`, { method: "DELETE" }));
            toast.success("Logo retiré", BRAND_ASSET_LABELS[slot]);
        } catch (e) {
            toast.error("Suppression impossible", errorText(e));
        } finally {
            setUploading(null);
        }
    };

    if (!loaded) return <Shimmer className="h-96" />;
    if (loadError || !form || !saved || !preview || !savedBrand) {
        return (
            <Notice tone="rose" icon={AlertTriangle}>
                Impossible de charger l&apos;identité : {loadError ?? "réponse vide"}
            </Notice>
        );
    }

    const text = (field: keyof Form, label: string, opts: { hint?: ReactNode; placeholder?: string; type?: string; className?: string } = {}) => (
        <Field
            label={label}
            className={opts.className}
            hint={errors[field] ? <span className="text-rose-600 font-bold">{errors[field]}</span> : opts.hint}
        >
            {(id) => (
                <input
                    id={id}
                    type={opts.type ?? "text"}
                    value={String(form[field] ?? "")}
                    placeholder={opts.placeholder}
                    onChange={(e) => set(field, e.target.value as Form[typeof field])}
                    aria-invalid={!!errors[field] || undefined}
                    className={cn(INPUT, errors[field] && "border-rose-300")}
                />
            )}
        </Field>
    );

    const p = preview.palette;
    const warnings: string[] = [];
    if (contrast(p.primarySeed, p.onPrimary) < 4.5) warnings.push("Le texte sur la couleur principale (barre latérale, boutons) manque de contraste.");
    if (contrast(p.accentSeed, p.onAccent) < 4.5) warnings.push("Le texte sur la couleur d'accent (élément actif) manque de contraste.");
    if (contrast(p.primarySeed, "#FFFFFF") < 3) warnings.push("La couleur principale est trop claire pour la barre latérale sur fond blanc.");
    if (contrast(p.accentSeed, "#FFFFFF") < 3) warnings.push("La couleur d'accent est peu visible sur fond blanc (liens, sélection, focus).");
    const badHex = (["primaryColor", "accentColor"] as const).filter((k) => !isHexColor(form[k]));

    return (
        <>
            <SettingsCard
                icon={Building2}
                tone="indigo"
                title="Identité"
                subtitle="Les noms affichés dans l'application, les emails, les PDF et les prompts IA"
                right={saved.updatedAt ? <StatusPill tone="slate">Modifiée le {new Date(saved.updatedAt).toLocaleDateString("fr-FR")}</StatusPill> : undefined}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {text("name", "Nom de la marque", { hint: "Barre latérale, connexion, emails" })}
                    {text("productName", "Nom du produit", { hint: "Titre des onglets, calendrier" })}
                    {text("tagline", "Accroche", { className: "sm:col-span-2", hint: "Sous le logo et dans la description des pages" })}
                    {text("description", "Activité (pour l'IA)", { className: "sm:col-span-2", hint: "Comment les prompts IA décrivent l'agence" })}
                    {text("companyName", "Raison sociale", { hint: "Factures, mentions légales" })}
                    {text("companyShortName", "Nom court", { hint: "Libellé des listes enrichies par l'agence" })}
                </div>
            </SettingsCard>

            <SettingsCard icon={Globe} tone="teal" title="Web & emails" subtitle="Adresses publiques et expéditeur des emails automatiques">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {text("appUrl", "URL de l'application", {
                        type: "url",
                        hint: (
                            <>
                                Utilisée seulement si APP_URL / NEXTAUTH_URL ne sont pas définies sur le serveur.
                                {effectiveAppUrl && <> Adresse effective : <span className="font-bold text-zinc-600">{effectiveAppUrl}</span></>}
                            </>
                        ),
                    })}
                    {text("website", "Site web", { type: "url" })}
                    {text("senderName", "Nom de l'expéditeur", { hint: "« Nom » <adresse> des emails automatiques" })}
                    {text("notificationsAddress", "Adresse des notifications", { type: "email" })}
                    {text("supportAddress", "Adresse du support", { type: "email", hint: "Affichée aux utilisateurs bloqués" })}
                    {text("emailDomains", "Domaines email", { hint: "Séparés par des virgules, proposés en premier", placeholder: "agence.fr, agence.com" })}
                </div>
            </SettingsCard>

            <SettingsCard icon={Languages} tone="amber" title="Langue & région" subtitle="Formats de date, de nombre et de devise">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Langue" hint={errors.lang ? <span className="text-rose-600 font-bold">{errors.lang}</span> : undefined}>
                        {(id) => (
                            <select id={id} value={form.lang} onChange={(e) => set("lang", e.target.value)} className={INPUT}>
                                {!LANGS.some((l) => l.value === form.lang) && <option value={form.lang}>{form.lang}</option>}
                                {LANGS.map((l) => (
                                    <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                            </select>
                        )}
                    </Field>
                    {text("locale", "Locale", { placeholder: "fr-FR", hint: "Format des dates et nombres (BCP 47)" })}
                    {text("currency", "Devise", { placeholder: "EUR", hint: "Code ISO à 3 lettres" })}
                    <Field label="Fuseau horaire" hint={errors.timeZone ? <span className="text-rose-600 font-bold">{errors.timeZone}</span> : "Fuseau IANA"}>
                        {(id) => (
                            <>
                                <input
                                    id={id}
                                    list={`${id}-zones`}
                                    value={form.timeZone}
                                    onChange={(e) => set("timeZone", e.target.value)}
                                    className={cn(INPUT, errors.timeZone && "border-rose-300")}
                                />
                                <datalist id={`${id}-zones`}>
                                    {zones.map((z) => (
                                        <option key={z} value={z} />
                                    ))}
                                </datalist>
                            </>
                        )}
                    </Field>
                </div>
            </SettingsCard>

            <SettingsCard icon={Palette} tone="violet" title="Couleurs" subtitle="Deux couleurs suffisent : toutes les nuances sont calculées">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <ColorField
                                label="Principale"
                                hint="La couleur la plus foncée du logo : barre latérale, boutons"
                                value={form.primaryColor}
                                error={errors.primaryColor}
                                onChange={(v) => set("primaryColor", v)}
                            />
                            <ColorField
                                label="Accent"
                                hint="La couleur vive du logo : élément actif, sélection"
                                value={form.accentColor}
                                error={errors.accentColor}
                                onChange={(v) => set("accentColor", v)}
                            />
                        </div>
                        <Field label={`Teinte des gris · ${Math.round(form.neutralTint * 100)} %`} hint="0 % = gris neutre, 100 % = gris teintés de la couleur principale">
                            {(id) => (
                                <input
                                    id={id}
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={form.neutralTint}
                                    onChange={(e) => set("neutralTint", Number(e.target.value))}
                                    className="w-full accent-primary"
                                />
                            )}
                        </Field>
                        <div className="space-y-2">
                            <RampRow label="Principale" ramp={p.primary} />
                            <RampRow label="Accent" ramp={p.accent} />
                            <RampRow label="Gris" ramp={p.neutral} />
                        </div>
                        {badHex.length > 0 && (
                            <Notice tone="rose" icon={AlertTriangle}>
                                Couleur invalide : l&apos;aperçu utilise la valeur par défaut. Format attendu : #RRGGBB.
                            </Notice>
                        )}
                        {warnings.length > 0 && (
                            <Notice tone="amber" icon={AlertTriangle}>
                                <ul className="space-y-0.5">
                                    {warnings.map((w) => (
                                        <li key={w}>{w}</li>
                                    ))}
                                </ul>
                            </Notice>
                        )}
                    </div>
                    <BrandPreview brand={preview} />
                </div>
            </SettingsCard>

            <SettingsCard icon={Type} tone="slate" title="Police" subtitle="Familles déjà intégrées à l'application">
                <div role="radiogroup" aria-label="Police" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(Object.keys(FONT_PRESETS) as FontPresetId[]).map((id) => {
                        const preset = FONT_PRESETS[id];
                        const on = form.fontPreset === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => set("fontPreset", id)}
                                className={cn(
                                    "text-left p-4 rounded-2xl border transition-colors",
                                    on ? "border-zinc-950 bg-slate-50 shadow-[inset_0_0_0_1px_rgba(9,9,11,1)]" : "border-slate-200 bg-white hover:border-slate-300",
                                )}
                            >
                                <span className="block text-xl font-bold text-zinc-900" style={{ fontFamily: `var(${preset.display})` }}>
                                    Prospection
                                </span>
                                <span className="block text-xs text-zinc-500 mt-1" style={{ fontFamily: `var(${preset.body})` }}>
                                    Rendez-vous confirmé avec le décideur.
                                </span>
                                <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mt-3">{preset.label}</span>
                            </button>
                        );
                    })}
                </div>
                {errors.fontPreset && <p className="text-xs font-bold text-rose-600 mt-2">{errors.fontPreset}</p>}
            </SettingsCard>

            <SettingsCard icon={ImageIcon} tone="emerald" title="Logos" subtitle="Envoyés immédiatement · PNG, WebP ou SVG, 2 Mo maximum">
                {!storageConfigured && (
                    <Notice tone="amber" icon={AlertTriangle} className="mb-4">
                        Le stockage des fichiers (MinIO) n&apos;est pas configuré sur ce serveur : les logos par défaut restent affichés.
                    </Notice>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {BRAND_ASSET_SLOTS.map((slot) => (
                        <LogoSlot
                            key={slot}
                            slot={slot}
                            src={savedBrand.logos[slot]}
                            uploaded={!!saved[BRAND_ASSET_COLUMNS[slot]]}
                            inverseBg={INVERSE_SLOTS.has(slot) ? savedBrand.palette.primarySeed : null}
                            busy={uploading === slot}
                            disabled={!storageConfigured || uploading !== null}
                            removeDisabled={uploading !== null}
                            onUpload={(f) => upload(slot, f)}
                            onRemove={() => removeAsset(slot)}
                        />
                    ))}
                </div>
            </SettingsCard>

            <SettingsCard icon={RotateCcw} tone="rose" title="Réinitialiser" subtitle="Revenir à l'identité livrée avec l'application">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-600 max-w-xl">
                        Noms, adresses, couleurs, police et logos reprennent leurs valeurs par défaut. Les fichiers envoyés sont conservés dans le stockage.
                    </p>
                    <button type="button" onClick={reset} disabled={resetting || saving} className={DANGER_BUTTON}>
                        {resetting ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                        Réinitialiser l&apos;identité
                    </button>
                </div>
            </SettingsCard>

            <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => { setForm(toForm(saved)); setErrors({}); }} />
        </>
    );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ColorField({ label, hint, value, error, onChange }: {
    label: string;
    hint: string;
    value: string;
    error?: string;
    onChange: (v: string) => void;
}) {
    const valid = isHexColor(value);
    return (
        <Field label={label} hint={error ? <span className="text-rose-600 font-bold">{error}</span> : hint}>
            {(id) => (
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        aria-label={`${label} (sélecteur)`}
                        value={valid ? normalizeHex(value) : "#000000"}
                        onChange={(e) => onChange(e.target.value.toUpperCase())}
                        className="h-11 w-14 flex-shrink-0 rounded-xl border border-slate-200 bg-white p-1 cursor-pointer"
                    />
                    <input
                        id={id}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        spellCheck={false}
                        aria-invalid={!valid || undefined}
                        className={cn(INPUT, "font-mono uppercase", (!valid || error) && "border-rose-300")}
                    />
                </div>
            )}
        </Field>
    );
}

function normalizeHex(v: string): string {
    const h = v.trim().replace(/^#/, "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return `#${full.toLowerCase()}`;
}

function RampRow({ label, ramp }: { label: string; ramp: Ramp }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-20 flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
            <div className="flex flex-1 min-w-0 rounded-lg overflow-hidden border border-slate-200">
                {SHADES.map((s) => (
                    <span key={s} title={`${s} · ${ramp[s]}`} className="h-7 flex-1" style={{ backgroundColor: ramp[s] }} />
                ))}
            </div>
        </div>
    );
}

/** Miniature of the app shell in the previewed brand: sidebar, active item, a card and the main action. */
function BrandPreview({ brand }: { brand: Brand }) {
    const p = brand.palette;
    const font = FONT_PRESETS[brand.fontPreset];
    return (
        <div className="rounded-2xl overflow-hidden border border-slate-200 flex h-[260px] select-none" aria-label="Aperçu" role="img">
            <div className="w-[118px] flex-shrink-0 p-3 flex flex-col gap-1.5" style={{ backgroundColor: p.primarySeed, color: p.onPrimary }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- preview of the brand's own logo URL */}
                <img src={brand.logos.markInverse} alt="" className="w-7 h-7 object-contain mb-2" />
                {["Accueil", "Missions", "Agenda", "Stats"].map((item, i) => (
                    <span
                        key={item}
                        className="text-[11px] font-bold rounded-lg px-2 py-1.5 truncate"
                        style={i === 0 ? { backgroundColor: p.accentSeed, color: p.onAccent } : { opacity: 0.75 }}
                    >
                        {item}
                    </span>
                ))}
            </div>
            <div className="flex-1 min-w-0 p-3 flex flex-col gap-2.5" style={{ backgroundColor: p.neutral[50] }}>
                <span className="text-sm font-bold truncate" style={{ color: p.neutral[900], fontFamily: `var(${font.display})` }}>
                    {brand.name}
                </span>
                <div className="rounded-xl bg-white p-2.5 space-y-1.5" style={{ border: `1px solid ${p.neutral[200]}` }}>
                    <span className="block h-1.5 w-3/4 rounded-full" style={{ backgroundColor: p.neutral[200] }} />
                    <span className="block h-1.5 w-1/2 rounded-full" style={{ backgroundColor: p.accent[200] }} />
                    <span className="block text-[10px] font-semibold" style={{ color: p.neutral[500], fontFamily: `var(${font.body})` }}>
                        {brand.tagline}
                    </span>
                </div>
                <span
                    className="mt-auto self-start text-[11px] font-black rounded-xl px-3 py-2"
                    style={{ backgroundColor: p.primarySeed, color: p.onPrimary }}
                >
                    Démarrer les appels
                </span>
            </div>
        </div>
    );
}

function LogoSlot({ slot, src, uploaded, inverseBg, busy, disabled, removeDisabled, onUpload, onRemove }: {
    slot: BrandAssetSlot;
    src: string;
    uploaded: boolean;
    inverseBg: string | null;
    busy: boolean;
    /** Upload disabled (no storage, or another slot busy). */
    disabled: boolean;
    /** Removal only needs the database, not the storage. */
    removeDisabled: boolean;
    onUpload: (f: File) => void;
    onRemove: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-col gap-3">
            <div
                className={cn("h-24 rounded-xl flex items-center justify-center p-3", !inverseBg && "bg-slate-50")}
                style={inverseBg ? { backgroundColor: inverseBg } : undefined}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded brand file or /public default, any format */}
                <img src={src} alt={BRAND_ASSET_LABELS[slot]} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                    <span className="truncate">{BRAND_ASSET_LABELS[slot]}</span>
                    {uploaded && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Personnalisé</span>}
                </p>
                <p className="text-[11px] font-medium text-zinc-500 mt-0.5">{SLOT_HINTS[slot]}</p>
            </div>
            <div className="flex items-center gap-2 mt-auto">
                <input
                    ref={input}
                    type="file"
                    accept="image/png,image/webp,image/svg+xml,.png,.webp,.svg"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onUpload(f);
                    }}
                />
                <button type="button" onClick={() => input.current?.click()} disabled={disabled} className={SECONDARY_BUTTON}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <Upload className="w-3.5 h-3.5" aria-hidden />}
                    {uploaded ? "Remplacer" : "Envoyer"}
                </button>
                {uploaded && (
                    <button type="button" onClick={onRemove} disabled={busy || removeDisabled} className={DANGER_BUTTON} aria-label={`Retirer ${BRAND_ASSET_LABELS[slot]}`}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                )}
            </div>
        </div>
    );
}
