"use client";

// ============================================
// SETTINGS UI — the shell and form primitives every role's settings page shares
// (manager, SDR/Booker/BD, client). Drawn in the Accueil language
// (components/accueil/AccueilUI.tsx): white rounded-3xl cards, semantic tones,
// zinc-950 primary action, emerald focus rings.
//
// Sections are addressed by ?section=<id>, so the sidebar's profile menu (and any
// link) can open one directly, and the browser's back button walks between them.
// ============================================

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Search, Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    BADGE, CARD, CARD_HOVER, FOCUS, PRIMARY_BUTTON, ROW, SECONDARY_BUTTON, SectionHeader, TEXT, type AccueilTone,
} from "@/components/accueil/AccueilUI";

export interface SettingsSectionDef {
    id: string;
    label: string;
    hint: string;
    icon: LucideIcon;
    tone: AccueilTone;
    group: string;
    /** Longer sentence under the section title (defaults to the hint). */
    description?: string;
    /** Extra words the search matches (tool names, synonyms). */
    keywords?: string;
    /** Small flag next to the label (« 2 », « Nouveau »). */
    badge?: string;
}

// ── Section routing ─────────────────────────────────────────────────────────

/** Active section from ?section=, falling back to the first one. Needs a <Suspense> above it. */
export function useSettingsSection(sections: SettingsSectionDef[]): [string, (id: string) => void] {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const requested = params.get("section");
    const active = sections.some((s) => s.id === requested) ? requested! : sections[0].id;

    const select = useCallback(
        (id: string) => {
            const next = new URLSearchParams(params.toString());
            next.set("section", id);
            router.push(`${pathname}?${next.toString()}`, { scroll: false });
        },
        [params, pathname, router],
    );
    return [active, select];
}

// ── Shell ───────────────────────────────────────────────────────────────────

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Sections whose label, hint or keywords contain every word typed. */
export function filterSections(sections: SettingsSectionDef[], query: string): SettingsSectionDef[] {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return sections;
    return sections.filter((s) => {
        const hay = normalize(`${s.label} ${s.hint} ${s.group} ${s.keywords ?? ""}`);
        return words.every((w) => hay.includes(w));
    });
}

/**
 * Two columns: a quiet sidebar (title, search, grouped sections) and the open
 * section under its own big title. Phones get a native section picker instead.
 */
export function SettingsShell({
    title,
    subtitle,
    sections,
    active,
    onSelect,
    children,
}: {
    title: string;
    subtitle?: string;
    sections: SettingsSectionDef[];
    active: string;
    onSelect: (id: string) => void;
    children: ReactNode;
}) {
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const visible = useMemo(() => filterSections(sections, query), [sections, query]);
    const groups = useMemo(
        () =>
            visible.reduce<{ name: string; items: SettingsSectionDef[] }[]>((acc, s) => {
                const g = acc.find((x) => x.name === s.group);
                if (g) g.items.push(s);
                else acc.push({ name: s.group, items: [s] });
                return acc;
            }, []),
        [visible],
    );
    const allGroups = useMemo(() => [...new Set(sections.map((s) => s.group))], [sections]);
    const current = sections.find((s) => s.id === active) ?? sections[0];
    const CurrentIcon = current.icon;

    // « / » jumps to the search.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const pick = (id: string) => {
        onSelect(id);
        setQuery("");
    };

    return (
        <div className="w-full max-w-[1200px] mx-auto pb-16 antialiased text-ink">
            <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] gap-6 lg:gap-10 items-start">
                {/* Phones and tablets: the title and one native picker, nothing scrolls sideways */}
                <div className="lg:hidden space-y-3 pt-1">
                    <h1 className="text-2xl font-black tracking-tight">{title}</h1>
                    <label className="sr-only" htmlFor="settings-section-picker">Section</label>
                    <div className="relative">
                        <CurrentIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
                        <select
                            id="settings-section-picker"
                            value={current.id}
                            onChange={(e) => pick(e.target.value)}
                            className={cn(INPUT, "pl-10 pr-10 appearance-none font-bold cursor-pointer")}
                        >
                            {allGroups.map((g) => (
                                <optgroup key={g} label={g}>
                                    {sections.filter((s) => s.group === g).map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
                    </div>
                </div>

                {/* Desktop sidebar */}
                <aside className="hidden lg:block sticky top-4 space-y-4 pt-1">
                    <div className="px-1">
                        <h1 className="text-[22px] font-black tracking-tight">{title}</h1>
                        {subtitle && <p className="text-xs font-medium text-ink-3 mt-0.5 leading-relaxed">{subtitle}</p>}
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
                        <input
                            ref={searchRef}
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && visible[0]) pick(visible[0].id);
                                if (e.key === "Escape") setQuery("");
                            }}
                            placeholder="Rechercher un réglage"
                            aria-label="Rechercher un réglage"
                            className="w-full h-10 pl-9 pr-9 rounded-xl bg-surface-2 border border-transparent text-[13px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium focus:outline-none focus:bg-surface focus:border-line-strong focus:ring-4 focus:ring-emerald-500/10 transition-colors [&::-webkit-search-cancel-button]:hidden"
                        />
                        {!query && (
                            <kbd aria-hidden className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 min-w-5 px-1 rounded-md border border-line bg-surface text-[10px] font-bold text-ink-3 flex items-center justify-center">
                                /
                            </kbd>
                        )}
                    </div>
                    <nav aria-label="Sections des paramètres" className="space-y-4">
                        {groups.map((g) => (
                            <div key={g.name}>
                                <p className="px-3 pb-1 text-[11px] font-bold text-ink-3">{g.name}</p>
                                <ul className="space-y-px">
                                    {g.items.map((s) => {
                                        const on = s.id === active;
                                        return (
                                            <li key={s.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => pick(s.id)}
                                                    aria-current={on ? "page" : undefined}
                                                    title={s.hint}
                                                    className={cn(
                                                        "relative w-full flex items-center gap-2.5 h-9 px-3 rounded-xl text-left text-[13px] transition-colors duration-150",
                                                        FOCUS,
                                                        on
                                                            ? "bg-surface text-ink font-extrabold shadow-[0_1px_2px_rgba(15,23,42,0.06),inset_0_0_0_1px_var(--ds-line)]"
                                                            : "text-ink-2 font-semibold hover:bg-surface-2 hover:text-ink",
                                                    )}
                                                >
                                                    {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-500" aria-hidden />}
                                                    <s.icon className={cn("w-4 h-4 flex-shrink-0", on ? TEXT[s.tone] : "text-ink-3")} aria-hidden />
                                                    <span className="truncate">{s.label}</span>
                                                    {s.badge && (
                                                        <span className="ml-auto text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900">{s.badge}</span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                        {!groups.length && <p className="px-3 text-xs font-medium text-ink-3">Aucun réglage ne correspond à « {query} ».</p>}
                    </nav>
                </aside>

                <main aria-labelledby="settings-section-title" className="min-w-0 space-y-6">
                    <header className="flex items-start gap-3.5 pt-1">
                        <span className={cn("hidden sm:flex w-11 h-11 rounded-2xl items-center justify-center flex-shrink-0", BADGE[current.tone])}>
                            <CurrentIcon className="w-5 h-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-ink-3">{current.group}</p>
                            <h2 id="settings-section-title" className="text-xl sm:text-[26px] font-black tracking-tight leading-tight">{current.label}</h2>
                            <p className="text-sm font-medium text-ink-3 mt-0.5">{current.description ?? current.hint}</p>
                        </div>
                    </header>
                    {children}
                </main>
            </div>
        </div>
    );
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function SettingsCard({
    icon,
    tone,
    title,
    subtitle,
    right,
    children,
    className,
}: {
    icon: LucideIcon;
    tone: AccueilTone;
    title: string;
    subtitle?: ReactNode;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn(CARD, "p-6", className)}>
            <SectionHeader icon={icon} tone={tone} title={title} subtitle={subtitle} right={right} />
            <div className="pt-5">{children}</div>
        </section>
    );
}

/** Whole-row link to another settings page (statuts, templates, broadcasts…). */
export function SettingsLinkRow({
    href,
    icon: Icon,
    tone,
    title,
    description,
    badge,
}: {
    href: string;
    icon: LucideIcon;
    tone: AccueilTone;
    title: string;
    description: string;
    badge?: string;
}) {
    return (
        <Link href={href} className={cn("group flex items-center gap-3.5 p-3.5 rounded-2xl border bg-white", ROW.slate, CARD_HOVER, FOCUS)}>
            <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", BADGE[tone])}>
                <Icon className="w-[18px] h-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-extrabold text-zinc-900 truncate">{title}</span>
                    {badge && <span className={cn("text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap", BADGE[tone])}>{badge}</span>}
                </span>
                <span className="block text-xs font-medium text-zinc-500 mt-0.5 line-clamp-2">{description}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-[color,transform] flex-shrink-0" aria-hidden />
        </Link>
    );
}

const NOTICE: Record<AccueilTone, string> = {
    emerald: "bg-emerald-50/70 border-emerald-200/80",
    amber: "bg-amber-50/70 border-amber-200/80",
    rose: "bg-rose-50/70 border-rose-200/80",
    indigo: "bg-primary-50/60 border-primary-200/80",
    teal: "bg-teal-50/60 border-teal-200/80",
    violet: "bg-accent-50/60 border-accent-200/80",
    slate: "bg-slate-50 border-slate-200",
};

/** Tinted inline message (info, warning, error, success). */
export function Notice({ tone, icon: Icon, children, className }: { tone: AccueilTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-xs font-medium leading-relaxed", NOTICE[tone], className)}>
            {Icon && <Icon className={cn("w-4 h-4 mt-px flex-shrink-0", TEXT[tone])} aria-hidden />}
            <div className="min-w-0 text-zinc-700">{children}</div>
        </div>
    );
}

// ── Form controls ───────────────────────────────────────────────────────────

export const INPUT = cn(
    "w-full h-11 px-3.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-zinc-900 shadow-2xs",
    "placeholder:text-zinc-400 placeholder:font-medium hover:border-slate-300 transition-colors",
    "disabled:bg-slate-50 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:hover:border-slate-200",
    "focus:outline-none focus-visible:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15",
);

export function Field({
    label,
    hint,
    icon: Icon,
    children,
    className,
    trailing,
}: {
    label: string;
    hint?: ReactNode;
    icon?: LucideIcon;
    /** Render-prop gets the id to put on the control. */
    children: (id: string) => ReactNode;
    className?: string;
    trailing?: ReactNode;
}) {
    const id = useId();
    return (
        <div className={cn("min-w-0", className)}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</label>
                {trailing}
            </div>
            <div className="relative">
                {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" aria-hidden />}
                {children(id)}
            </div>
            {hint && <div className="text-[11px] font-medium text-zinc-400 mt-1.5 leading-relaxed">{hint}</div>}
        </div>
    );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
                FOCUS,
                checked ? "bg-emerald-500 shadow-[inset_0_1px_2px_rgba(4,120,87,0.35)]" : "bg-slate-200 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]",
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.25)] transition-transform duration-200",
                    checked && "translate-x-5",
                )}
            />
        </button>
    );
}

/** Row with a tone tile, title, description and a control on the right. */
export function SettingRow({
    icon: Icon,
    tone,
    title,
    description,
    control,
    active,
}: {
    icon: LucideIcon;
    tone: AccueilTone;
    title: string;
    description: ReactNode;
    control: ReactNode;
    active?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3.5 p-3.5 rounded-2xl border transition-colors duration-200",
                active ? "bg-slate-50/80 border-slate-200" : "bg-white border-slate-200/80",
            )}
        >
            <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", BADGE[tone])}>
                <Icon className="w-4 h-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-zinc-900">{title}</p>
                <div className="text-xs font-medium text-zinc-500 mt-0.5 leading-relaxed">{description}</div>
            </div>
            <div className="flex-shrink-0">{control}</div>
        </div>
    );
}

/**
 * Sticky bar that appears while a form has unsaved changes. Sits at the bottom
 * of the content column so it never covers the sidebar.
 */
export function SaveBar({
    dirty,
    saving,
    onSave,
    onReset,
    label = "Enregistrer",
    message = "Modifications non enregistrées",
}: {
    dirty: boolean;
    saving: boolean;
    onSave: () => void;
    onReset: () => void;
    label?: string;
    message?: string;
}) {
    if (!dirty && !saving) return null;
    return (
        <div className="sticky bottom-4 z-20 motion-safe:animate-[settingsBarIn_180ms_ease-out_both]">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-950 text-white pl-4 pr-2 py-2 shadow-[0_12px_32px_rgba(9,9,11,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]">
                <span className="flex items-center gap-2 text-xs font-bold">
                    <span className="relative flex w-2 h-2" aria-hidden>
                        <span className="absolute inset-0 rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                        <span className="relative w-2 h-2 rounded-full bg-amber-400" />
                    </span>
                    {message}
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={saving}
                        className={cn(
                            "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50",
                            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                        )}
                    >
                        <Undo2 className="w-3.5 h-3.5" aria-hidden />
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className={cn(
                            "inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-zinc-950 text-xs font-black shadow-sm hover:bg-emerald-50 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-60",
                            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70",
                        )}
                    >
                        {saving && <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden />}
                        {saving ? "Enregistrement…" : label}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Primary/secondary buttons re-exported so pages import one module. */
export { PRIMARY_BUTTON, SECONDARY_BUTTON };

/** Destructive quiet button (Désactiver, Réinitialiser…). */
export const DANGER_BUTTON = cn(
    "inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-zinc-600 shadow-2xs whitespace-nowrap",
    "hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    FOCUS,
);

/** Small inline result line under a form ("Enregistré", or the error). */
export function FormStatus({ error, success }: { error?: string | null; success?: string | null }) {
    if (!error && !success) return null;
    return (
        <p role={error ? "alert" : "status"} className={cn("text-xs font-bold", error ? "text-rose-600" : "text-emerald-600")}>
            {error || success}
        </p>
    );
}
