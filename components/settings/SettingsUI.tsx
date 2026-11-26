"use client";

// ============================================
// SETTINGS UI — the shell and form primitives every role's settings page shares
// (manager, SDR/Booker/BD, client).
//
// One visual rule: colour is state, never decoration. Icons are drawn in ink,
// cards carry no coloured tiles, and tinted surfaces are kept for what they mean
// (a warning, an error, a toggle that is on). Two weights do the hierarchy:
// semibold titles, regular/medium text. Spacing sits on a 4/8 scale.
//
// Two layouts:
//   • SettingsShell — a section list beside the open section, for pages with many
//     destinations (the manager's agency settings). Sections are addressed by
//     ?section=<id>, so links and the back button walk between them.
//   • SettingsPage — one scrolling page with anchors, for the personal pages
//     (three sections or so do not need a navigation of their own).
// ============================================

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronRight, Loader2, Search, Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, FOCUS, type AccueilTone } from "@/components/accueil/AccueilUI";

export interface SettingsSectionDef {
    id: string;
    label: string;
    /** Short line shown as the item's tooltip and matched by the search. */
    hint: string;
    icon: LucideIcon;
    group: string;
    /** Words the search matches besides the label and hint: the settings inside the section. */
    keywords?: string;
    /** Small flag next to the label (« 2 », « Nouveau »). */
    badge?: string;
}

// ── Section routing ─────────────────────────────────────────────────────────

/**
 * Where an old or secondary ?section= id leads: `"integrations"` opens that
 * section, `"integrations#mcp"` also scrolls to the element with id `mcp`.
 */
export type SectionAliases = Record<string, string>;

function resolveSection(requested: string | null, ids: string[], aliases: SectionAliases): { id: string; anchor: string | null } {
    if (requested && ids.includes(requested)) return { id: requested, anchor: null };
    const target = requested ? aliases[requested] : undefined;
    if (target) {
        const [id, anchor] = target.split("#");
        if (ids.includes(id)) return { id, anchor: anchor || null };
    }
    return { id: ids[0], anchor: null };
}

/**
 * Scrolls to `#anchor` once it exists and the panels above it have stopped
 * growing (they render a placeholder, then their data), so it lands where it
 * stays. Gives up after a few seconds.
 */
function useScrollToAnchor(anchor: string | null) {
    const params = useSearchParams();
    const key = params.toString();
    useEffect(() => {
        if (!anchor) return;
        let tries = 0;
        let last: number | null = null;
        const t = setInterval(() => {
            const el = document.getElementById(anchor);
            const top = el ? Math.round(el.getBoundingClientRect().top + (el.closest(".cp-main")?.scrollTop ?? window.scrollY)) : null;
            // Still loading above it: placeholders (Shimmer) pulse until their panel has its data.
            const loading = !!document.querySelector("main .motion-safe\\:animate-pulse");
            const settled = !loading && top !== null && last !== null && Math.abs(top - last) < 2;
            last = top;
            if (settled || ++tries > 40) {
                clearInterval(t);
                // A jump, not an animation: this is where the page opens.
                el?.scrollIntoView({ block: "start" });
            }
        }, 200);
        return () => clearInterval(t);
    }, [anchor, key]);
}

/** Active section from ?section=, falling back to the first one. Needs a <Suspense> above it. */
export function useSettingsSection(sections: SettingsSectionDef[], aliases: SectionAliases = {}): [string, (id: string) => void] {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { id: active, anchor } = resolveSection(params.get("section"), sections.map((s) => s.id), aliases);
    useScrollToAnchor(anchor);

    const select = useCallback(
        (id: string) => {
            const next = new URLSearchParams(params.toString());
            next.set("section", id);
            next.delete("tool");
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
 * Two columns: a quiet list of sections (title, search, groups) and the open
 * section. The open section has no visible title of its own: the highlighted
 * item already says where you are. Phones get a native section picker instead.
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
            <div className="grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)] gap-6 lg:gap-12 items-start">
                {/* Phones and tablets: the title and one native picker, nothing scrolls sideways */}
                <div className="lg:hidden space-y-3 pt-1">
                    <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                    <label className="sr-only" htmlFor="settings-section-picker">Section</label>
                    <div className="relative">
                        <CurrentIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
                        <select
                            id="settings-section-picker"
                            value={current.id}
                            onChange={(e) => pick(e.target.value)}
                            className={cn(INPUT, "pl-10 pr-10 appearance-none cursor-pointer")}
                        >
                            {allGroups.map((g) => (
                                <optgroup key={g} label={g}>
                                    {sections.filter((s) => s.group === g).map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
                    </div>
                </div>

                {/* Desktop section list */}
                <aside className="hidden lg:block sticky top-4 space-y-4 pt-1">
                    <div className="px-3">
                        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                        {subtitle && <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">{subtitle}</p>}
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
                            className="w-full h-9 pl-9 pr-9 rounded-lg bg-surface-2 border border-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:bg-surface focus:border-line-strong focus:ring-4 focus:ring-emerald-500/10 transition-colors [&::-webkit-search-cancel-button]:hidden"
                        />
                        {!query && (
                            <kbd aria-hidden className="absolute right-2 top-1/2 -translate-y-1/2 h-5 min-w-5 px-1 rounded border border-line bg-surface text-[11px] text-ink-3 flex items-center justify-center">
                                /
                            </kbd>
                        )}
                    </div>
                    <nav aria-label="Sections des paramètres" className="space-y-6">
                        {groups.map((g) => (
                            <div key={g.name}>
                                <p className="px-3 pb-1 text-xs font-medium text-ink-3">{g.name}</p>
                                <ul>
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
                                                        "w-full flex items-center gap-3 h-9 px-3 rounded-lg text-left text-[13px] transition-colors duration-150",
                                                        FOCUS,
                                                        on ? "bg-surface-3 text-ink font-semibold" : "text-ink-2 font-medium hover:bg-surface-2 hover:text-ink",
                                                    )}
                                                >
                                                    <s.icon className={cn("w-4 h-4 flex-shrink-0", on ? "text-ink" : "text-ink-3")} aria-hidden />
                                                    <span className="truncate">{s.label}</span>
                                                    {s.badge && (
                                                        <span className="ml-auto text-[11px] font-semibold px-1.5 rounded bg-amber-100 text-amber-900">{s.badge}</span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                        {!groups.length && <p className="px-3 text-[13px] text-ink-3">Aucun réglage ne correspond à « {query} ».</p>}
                    </nav>
                </aside>

                <main aria-labelledby="settings-section-title" className="min-w-0 space-y-6 lg:pt-1">
                    <h2 id="settings-section-title" className="sr-only">{current.label}</h2>
                    {children}
                </main>
            </div>
        </div>
    );
}

// ── Single page (personal settings) ─────────────────────────────────────────

export interface SettingsPageSection {
    id: string;
    label: string;
    /** One line under the section title, when the title alone is not enough. */
    description?: string;
    content: ReactNode;
}

/**
 * The personal settings as one page: a title, a row of jump links, and the
 * sections one under the other. ?section=<id> (or an alias) scrolls to one,
 * so the profile menu's links keep working.
 */
export function SettingsPage({
    title,
    subtitle,
    sections,
    aliases = {},
}: {
    title: string;
    subtitle?: string;
    sections: SettingsPageSection[];
    aliases?: SectionAliases;
}) {
    const params = useSearchParams();
    const requested = params.get("section");
    const { id } = resolveSection(requested, sections.map((s) => s.id), aliases);
    // The first section is where the page opens anyway: only scroll for the others.
    useScrollToAnchor(requested && id !== sections[0]?.id ? `section-${id}` : null);

    return (
        <div className="w-full max-w-[760px] mx-auto pb-16 antialiased text-ink">
            <header className="pt-1">
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">{subtitle}</p>}
                <nav aria-label="Sections de la page" className="mt-4 flex flex-wrap gap-1 -mx-3">
                    {sections.map((s) => (
                        <a
                            key={s.id}
                            href={`#section-${s.id}`}
                            className={cn("h-8 px-3 inline-flex items-center rounded-lg text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors", FOCUS)}
                        >
                            {s.label}
                        </a>
                    ))}
                </nav>
            </header>
            <div className="mt-8 space-y-12">
                {sections.map((s) => (
                    <section key={s.id} id={`section-${s.id}`} aria-labelledby={`section-${s.id}-title`} className="scroll-mt-6 space-y-4">
                        <div>
                            <h2 id={`section-${s.id}-title`} className="text-base font-semibold tracking-tight">{s.label}</h2>
                            {s.description && <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">{s.description}</p>}
                        </div>
                        {s.content}
                    </section>
                ))}
            </div>
        </div>
    );
}

// ── Cards ───────────────────────────────────────────────────────────────────

/**
 * A titled group of settings. The subtitle wraps (it is often the sentence that
 * explains the setting, so it is never cut); the icon is a quiet ink glyph.
 */
export function SettingsCard({
    icon: Icon,
    title,
    subtitle,
    right,
    children,
    className,
    id,
}: {
    icon?: LucideIcon;
    title: string;
    subtitle?: ReactNode;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
    /** Anchor, for links that open a section at this card. */
    id?: string;
}) {
    const titleId = useId();
    return (
        <section id={id} aria-labelledby={titleId} className={cn(CARD, "p-6 scroll-mt-6", className)}>
            <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1 flex gap-3">
                    {Icon && <Icon className="w-4 h-4 mt-[3px] text-ink-3 flex-shrink-0" aria-hidden />}
                    <div className="min-w-0">
                        <h3 id={titleId} className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
                        {subtitle && <div className="mt-1 text-[13px] text-ink-3 leading-relaxed max-w-prose">{subtitle}</div>}
                    </div>
                </div>
                {right && <div className="flex-shrink-0">{right}</div>}
            </header>
            <div className="pt-5">{children}</div>
        </section>
    );
}

/** Whole-row link to another page (statuts, mailboxes, audit…), or to a file
 *  such as a PDF guide (`external`: opens in a new tab). */
export function SettingsLinkRow({
    href,
    icon: Icon,
    title,
    description,
    badge,
    external,
}: {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
    badge?: string;
    external?: boolean;
}) {
    const className = cn(
        "group flex items-center gap-4 px-4 py-3 rounded-2xl border border-line bg-surface transition-colors duration-150 hover:border-line-strong hover:bg-surface-2/60",
        FOCUS,
    );
    const body = (
        <>
            <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-2 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-ink truncate">{title}</span>
                    {badge && <span className="text-[11px] font-medium px-1.5 rounded bg-surface-3 text-ink-2 whitespace-nowrap">{badge}</span>}
                </span>
                <span className="block text-[13px] text-ink-3 mt-0.5 line-clamp-2">{description}</span>
            </span>
            {external ? (
                <ArrowUpRight className="w-4 h-4 text-ink-3 group-hover:text-ink group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-[color,transform] flex-shrink-0" aria-hidden />
            ) : (
                <ChevronRight className="w-4 h-4 text-ink-3 group-hover:text-ink group-hover:translate-x-0.5 transition-[color,transform] flex-shrink-0" aria-hidden />
            )}
        </>
    );
    return external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
            {body}
            <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
        </a>
    ) : (
        <Link href={href} className={className}>
            {body}
        </Link>
    );
}

const NOTICE: Record<AccueilTone, { box: string; icon: string }> = {
    emerald: { box: "bg-emerald-50/70 border-emerald-200/80", icon: "text-emerald-700" },
    amber: { box: "bg-amber-50/70 border-amber-200/80", icon: "text-amber-700" },
    rose: { box: "bg-rose-50/70 border-rose-200/80", icon: "text-rose-700" },
    indigo: { box: "bg-surface-2 border-line", icon: "text-ink-2" },
    teal: { box: "bg-surface-2 border-line", icon: "text-ink-2" },
    violet: { box: "bg-surface-2 border-line", icon: "text-ink-2" },
    slate: { box: "bg-surface-2 border-line", icon: "text-ink-2" },
};

/** Inline message. Tinted only when it carries a state: emerald (done), amber (warning), rose (error). */
export function Notice({ tone, icon: Icon, children, className }: { tone: AccueilTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
    const look = NOTICE[tone];
    return (
        <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed", look.box, className)}>
            {Icon && <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", look.icon)} aria-hidden />}
            <div className="min-w-0 text-ink-2">{children}</div>
        </div>
    );
}

// ── Form controls ───────────────────────────────────────────────────────────

export const INPUT = cn(
    "w-full h-10 px-3 rounded-xl bg-surface border border-line text-sm text-ink",
    "placeholder:text-ink-3/80 hover:border-line-strong transition-colors",
    "disabled:bg-surface-2 disabled:text-ink-3 disabled:cursor-not-allowed disabled:hover:border-line",
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
            <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor={id} className="text-[13px] font-medium text-ink-2">{label}</label>
                {trailing}
            </div>
            <div className="relative">
                {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />}
                {children(id)}
            </div>
            {hint && <div className="text-xs text-ink-3 mt-2 leading-relaxed">{hint}</div>}
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
                checked ? "bg-emerald-500 shadow-[inset_0_1px_2px_rgba(4,120,87,0.35)]" : "bg-surface-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]",
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

/** Rows separated by hairlines, inside a card: the card is the group, the rows have no boxes of their own. */
export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("divide-y divide-line-subtle", className)}>{children}</div>;
}

/** One setting: title, the sentence that explains it, and its control on the right. */
export function SettingRow({
    icon: Icon,
    title,
    description,
    control,
}: {
    icon?: LucideIcon;
    title: string;
    description?: ReactNode;
    control: ReactNode;
}) {
    return (
        <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            {Icon && <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" aria-hidden />}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{title}</p>
                {description && <div className="text-[13px] text-ink-3 mt-0.5 leading-relaxed">{description}</div>}
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
                <span className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="relative flex w-2 h-2" aria-hidden>
                        <span className="absolute inset-0 rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                        <span className="relative w-2 h-2 rounded-full bg-amber-400" />
                    </span>
                    {message}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={saving}
                        className={cn(
                            "inline-flex items-center gap-2 h-9 px-3 rounded-xl text-[13px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50",
                            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                        )}
                    >
                        <Undo2 className="w-4 h-4" aria-hidden />
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className={cn(
                            "inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-zinc-950 text-[13px] font-semibold shadow-sm hover:bg-emerald-50 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-60",
                            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70",
                        )}
                    >
                        {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />}
                        {saving ? "Enregistrement…" : label}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Buttons ─────────────────────────────────────────────────────────────────
// One height (40px) and one radius (12px) for every button in settings, so a
// primary and a secondary action side by side read as one system.

const BUTTON = cn(
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-[13px] whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    FOCUS,
);

/** The section's one primary action. */
export const PRIMARY_BUTTON = cn(BUTTON, "bg-primary hover:bg-primary-hover active:bg-primary-active text-primary-fg font-semibold shadow-sm");

/** Quiet action (Tester, Écouter, Changer la photo…). */
export const SECONDARY_BUTTON = cn(BUTTON, "px-3.5 bg-surface border border-line text-ink-2 font-medium hover:border-line-strong hover:bg-surface-2 hover:text-ink");

/** Destructive quiet button (Désactiver, Réinitialiser…). */
export const DANGER_BUTTON = cn(BUTTON, "px-3.5 bg-surface border border-line text-ink-2 font-medium hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50");

/** Small inline result line under a form ("Enregistré", or the error). */
export function FormStatus({ error, success }: { error?: string | null; success?: string | null }) {
    if (!error && !success) return null;
    return (
        <p role={error ? "alert" : "status"} className={cn("text-[13px] font-medium", error ? "text-rose-700" : "text-emerald-700")}>
            {error || success}
        </p>
    );
}
