"use client";

import { useState, type ReactNode } from "react";
import {
    ArrowRight,
    Bell,
    CalendarCheck,
    Check,
    Download,
    Filter,
    Headphones,
    Home,
    LayoutGrid,
    List,
    Mail,
    Phone,
    Plus,
    Search,
    Settings,
    Target,
    Trash2,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, ModalFooter, ConfirmModal } from "@/components/ui/Modal";
import { Drawer, DrawerSection } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, TextSkeleton } from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { Field } from "@/components/ui/Field";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Kbd } from "@/components/ui/Kbd";
import { StatusDot, StatusText } from "@/components/ui/StatusDot";
import { KpiCard } from "@/components/ui/KpiCard";
import { Section, SectionHeader } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import { AiMark } from "@/components/ui/AiMark";
import { EYEBROW, SURFACE } from "@/components/ui/recipes";

export type RampInfo = {
    name: string;
    role: string;
    swatches: { shade: number; hex: string; isSeed: boolean; onWhite: number; textOn: "white" | "ink" }[];
};

type Identity = {
    name: string;
    productName: string;
    tagline: string;
    primarySeed: string;
    accentSeed: string;
    onPrimary: string;
};

const NAV = [
    { id: "brand", label: "Marque" },
    { id: "color", label: "Couleurs" },
    { id: "roles", label: "Rôles" },
    { id: "type", label: "Typographie" },
    { id: "shape", label: "Formes & ombres" },
    { id: "buttons", label: "Boutons" },
    { id: "forms", label: "Formulaires" },
    { id: "feedback", label: "Statuts & messages" },
    { id: "data", label: "Données" },
    { id: "overlays", label: "Fenêtres" },
    { id: "patterns", label: "Modèles" },
];

function Block({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-8">
            <div className="mb-5">
                <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
                {intro && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-3">{intro}</p>}
            </div>
            <div className="space-y-5">{children}</div>
        </section>
    );
}

function Specimen({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn(SURFACE.card, "p-5 sm:p-6", className)}>
            {label && <p className={cn(EYEBROW, "mb-4")}>{label}</p>}
            {children}
        </div>
    );
}

function Swatch({ name, varName, className, dark }: { name: string; varName: string; className: string; dark?: boolean }) {
    return (
        <div className="min-w-0">
            <div className={cn("h-14 rounded-panel border border-line", className)} />
            <p className={cn("mt-2 truncate text-xs font-semibold", dark ? "text-ink" : "text-ink")}>{name}</p>
            <p className="truncate font-mono text-3xs text-ink-3">{varName}</p>
        </div>
    );
}

export function DesignSystemGallery({ ramps, identity }: { ramps: RampInfo[]; identity: Identity }) {
    const toast = useToast();
    const [segment, setSegment] = useState<"day" | "week" | "month">("week");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [tab, setTab] = useState("all");
    const [notify, setNotify] = useState(true);
    const [compact, setCompact] = useState(false);
    const [checked, setChecked] = useState(true);
    const [chips, setChips] = useState<string[]>(["rappel"]);
    const [selectValue, setSelectValue] = useState("sdr");
    const [note, setNote] = useState("Rappeler mardi, la décision passe par la DAF.");
    const [modalOpen, setModalOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [loadingBtn, setLoadingBtn] = useState(false);

    const toggleChip = (c: string) => setChips((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

    return (
        <div className="min-h-screen bg-canvas">
            {/* Masthead on the brand surface */}
            <header className="bg-inverse text-inverse-ink">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 sm:px-10 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <BrandLogo tone="inverse" height={34} priority />
                        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">Design system</h1>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-inverse-ink-2">
                            {identity.productName} — {identity.tagline}. Tout ce qui est ici est généré depuis{" "}
                            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">brand/brand.config.ts</code>.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {[
                            { label: "Primary", hex: identity.primarySeed },
                            { label: "Accent", hex: identity.accentSeed },
                        ].map((s) => (
                            <div key={s.label} className="flex items-center gap-3 rounded-panel border border-inverse-line bg-inverse-raised px-3 py-2.5">
                                <span className="size-8 rounded-lg ring-1 ring-white/20" style={{ background: s.hex }} />
                                <div>
                                    <p className="text-2xs font-semibold uppercase tracking-wider text-inverse-ink-3">{s.label}</p>
                                    <p className="font-mono text-xs text-inverse-ink">{s.hex}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            <div className="mx-auto flex max-w-7xl gap-10 px-6 py-10 sm:px-10">
                <nav aria-label="Sections" className="sticky top-8 hidden h-fit w-44 shrink-0 lg:block">
                    <ul className="space-y-0.5">
                        {NAV.map((n) => (
                            <li key={n.id}>
                                <a
                                    href={`#${n.id}`}
                                    className="block rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                                >
                                    {n.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <main className="min-w-0 flex-1 space-y-16">
                    {/* ── Brand ─────────────────────────────────────────── */}
                    <Block id="brand" title="Marque" intro="Le logo passe toujours par <BrandLogo />. Un clone remplace les fichiers de public/brand/ sans toucher au code.">
                        <div className="grid gap-5 md:grid-cols-2">
                            <Specimen label="Sur fond clair">
                                <div className="flex h-28 items-center justify-center rounded-panel bg-surface-2">
                                    <BrandLogo height={40} />
                                </div>
                            </Specimen>
                            <Specimen label="Sur la couleur de marque">
                                <div className="flex h-28 items-center justify-center rounded-panel bg-inverse">
                                    <BrandLogo tone="inverse" height={40} />
                                </div>
                            </Specimen>
                            <Specimen label="Symbole">
                                <div className="flex h-24 items-center justify-center gap-6 rounded-panel bg-surface-2">
                                    <BrandLogo variant="mark" height={48} />
                                    <span className="flex size-16 items-center justify-center rounded-2xl bg-inverse">
                                        <BrandLogo variant="mark" tone="inverse" height={40} />
                                    </span>
                                </div>
                            </Specimen>
                            <Specimen label="Nom">
                                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                                    <dt className="text-ink-3">Marque</dt>
                                    <dd className="font-semibold text-ink">{identity.name}</dd>
                                    <dt className="text-ink-3">Produit</dt>
                                    <dd className="font-semibold text-ink">{identity.productName}</dd>
                                    <dt className="text-ink-3">Signature</dt>
                                    <dd className="text-ink-2">{identity.tagline}</dd>
                                </dl>
                            </Specimen>
                        </div>
                    </Block>

                    {/* ── Colour ramps ──────────────────────────────────── */}
                    <Block
                        id="color"
                        title="Couleurs"
                        intro="Deux couleurs d'origine, onze nuances chacune, calculées en OKLCH. La pastille marque l'endroit où tombe la couleur d'origine. Le ratio indique le contraste du texte blanc."
                    >
                        {ramps.map((r) => (
                            <Specimen key={r.name}>
                                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="font-mono text-sm font-semibold text-ink">{r.name}</p>
                                    <p className="text-xs text-ink-3">{r.role}</p>
                                </div>
                                <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                                    {r.swatches.map((s) => (
                                        <div key={s.shade} className="min-w-0">
                                            <div
                                                className="relative flex h-16 items-end rounded-xl p-1.5 ring-1 ring-black/5 ring-inset"
                                                style={{ background: s.hex }}
                                            >
                                                {s.isSeed && (
                                                    <span
                                                        className="absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-white"
                                                        style={{ background: s.textOn === "white" ? "#fff" : "#000" }}
                                                        title="Couleur d'origine"
                                                    />
                                                )}
                                                <span className={cn("text-3xs font-bold tabular-nums", s.textOn === "white" ? "text-white" : "text-black/70")}>
                                                    {s.onWhite}
                                                </span>
                                            </div>
                                            <p className="mt-1.5 text-2xs font-semibold text-ink">{s.shade}</p>
                                            <p className="font-mono text-3xs uppercase text-ink-3">{s.hex.slice(1)}</p>
                                        </div>
                                    ))}
                                </div>
                            </Specimen>
                        ))}
                    </Block>

                    {/* ── Roles ─────────────────────────────────────────── */}
                    <Block id="roles" title="Rôles" intro="Les composants parlent en rôles, jamais en nuances : bg-surface, text-ink-2, border-line, bg-primary…">
                        <Specimen label="Surfaces">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                                <Swatch name="Canvas" varName="bg-canvas" className="bg-canvas" />
                                <Swatch name="Surface" varName="bg-surface" className="bg-surface" />
                                <Swatch name="Surface 2" varName="bg-surface-2" className="bg-surface-2" />
                                <Swatch name="Surface 3" varName="bg-surface-3" className="bg-surface-3" />
                                <Swatch name="Inverse" varName="bg-inverse" className="bg-inverse" />
                            </div>
                        </Specimen>
                        <div className="grid gap-5 md:grid-cols-2">
                            <Specimen label="Encre">
                                <ul className="space-y-2.5">
                                    {[
                                        ["text-ink", "Titres et valeurs", "text-ink"],
                                        ["text-ink-2", "Corps de texte, libellés", "text-ink-2"],
                                        ["text-ink-3", "Méta, secondaire", "text-ink-3"],
                                        ["text-ink-4", "Placeholder, désactivé", "text-ink-4"],
                                    ].map(([cls, label, c]) => (
                                        <li key={cls} className="flex items-baseline justify-between gap-4">
                                            <span className={cn("text-sm font-medium", c)}>{label}</span>
                                            <code className="font-mono text-2xs text-ink-3">{cls}</code>
                                        </li>
                                    ))}
                                </ul>
                            </Specimen>
                            <Specimen label="Traits">
                                <ul className="space-y-4">
                                    {[
                                        ["border-line-subtle", "Séparateur dans une carte", "border-line-subtle"],
                                        ["border-line", "Bord de carte et de champ", "border-line"],
                                        ["border-line-strong", "Survol, séparation marquée", "border-line-strong"],
                                    ].map(([cls, label, c]) => (
                                        <li key={cls}>
                                            <div className={cn("border-t-2", c)} />
                                            <div className="mt-1.5 flex justify-between text-xs">
                                                <span className="text-ink-2">{label}</span>
                                                <code className="font-mono text-2xs text-ink-3">{cls}</code>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Specimen>
                        </div>
                        <Specimen label="Statuts — même sens pour toutes les agences">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {(
                                    [
                                        ["success", "RDV, fait, à jour"],
                                        ["warning", "Rappels, à traiter"],
                                        ["danger", "Retard, erreur"],
                                        ["info", "Information"],
                                    ] as const
                                ).map(([tone, label]) => (
                                    <Callout key={tone} tone={tone} title={tone}>
                                        {label}
                                    </Callout>
                                ))}
                            </div>
                        </Specimen>
                    </Block>

                    {/* ── Typography ────────────────────────────────────── */}
                    <Block id="type" title="Typographie" intro="Titres en police d'affichage (font-display), tout le reste en police de texte. Les deux se changent dans brand/fonts.ts.">
                        <Specimen>
                            <div className="space-y-5">
                                <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-4">
                                    <p className="font-display text-5xl font-bold tracking-tight text-ink">128 RDV</p>
                                    <code className="font-mono text-2xs text-ink-3">display · 48 · bold</code>
                                </div>
                                <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-4">
                                    <h1 className="text-3xl font-bold tracking-tight text-ink">Tableau de bord</h1>
                                    <code className="font-mono text-2xs text-ink-3">h1 · 30 · bold</code>
                                </div>
                                <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-4">
                                    <h2 className="text-xl font-semibold tracking-tight text-ink">Missions en cours</h2>
                                    <code className="font-mono text-2xs text-ink-3">h2 · 20 · semibold</code>
                                </div>
                                <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-4">
                                    <p className="max-w-xl text-sm leading-relaxed text-ink-2">
                                        Le corps de texte reste sobre et dense : 14 px, interlignage confortable, encre secondaire. Il porte
                                        l&apos;information, la marque porte les titres.
                                    </p>
                                    <code className="shrink-0 font-mono text-2xs text-ink-3">body · 14</code>
                                </div>
                                <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle pb-4">
                                    <p className={EYEBROW}>Rendez-vous du mois</p>
                                    <code className="font-mono text-2xs text-ink-3">eyebrow · 11 · caps</code>
                                </div>
                                <div className="flex items-baseline justify-between gap-4">
                                    <p className="font-mono text-sm text-ink-2">MIS-2026-0042 · +33 6 12 34 56 78</p>
                                    <code className="font-mono text-2xs text-ink-3">mono · 14</code>
                                </div>
                            </div>
                        </Specimen>
                    </Block>

                    {/* ── Shape & elevation ─────────────────────────────── */}
                    <Block id="shape" title="Formes & ombres" intro="Rayons concentriques : un enfant inséré de p dans un parent de rayon R prend R − p. Les ombres sont teintées de l'encre de marque, jamais noires.">
                        <div className="grid gap-5 md:grid-cols-2">
                            <Specimen label="Rayons">
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        ["rounded-card", "24"],
                                        ["rounded-panel", "16"],
                                        ["rounded-control", "12"],
                                        ["rounded-chip", "∞"],
                                    ].map(([cls, px]) => (
                                        <div key={cls} className="text-center">
                                            <div className={cn("mx-auto h-16 w-full border-2 border-primary-300 bg-primary-50", cls)} />
                                            <p className="mt-2 font-mono text-3xs text-ink-3">{cls}</p>
                                            <p className="text-2xs font-semibold text-ink-2">{px}px</p>
                                        </div>
                                    ))}
                                </div>
                            </Specimen>
                            <Specimen label="Élévation" className="bg-surface-2">
                                <div className="grid grid-cols-5 gap-3">
                                    {["shadow-xs", "shadow-card", "shadow-md", "shadow-raised", "shadow-overlay"].map((s) => (
                                        <div key={s} className="text-center">
                                            <div className={cn("h-16 rounded-panel bg-surface", s)} />
                                            <p className="mt-2 font-mono text-3xs text-ink-3">{s}</p>
                                        </div>
                                    ))}
                                </div>
                            </Specimen>
                        </div>
                    </Block>

                    {/* ── Buttons ───────────────────────────────────────── */}
                    <Block id="buttons" title="Boutons" intro="Une seule action principale par vue (primary). Accent pour les actions de marque ou d'IA, soft et secondary pour le reste.">
                        <Specimen label="Variantes">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button variant="primary">Démarrer les appels</Button>
                                <Button variant="accent" leftIcon={<AiMark className="size-4" />}>Analyser</Button>
                                <Button variant="secondary">Exporter</Button>
                                <Button variant="soft">Filtrer</Button>
                                <Button variant="ghost">Annuler</Button>
                                <Button variant="success" leftIcon={<Check className="size-4" />}>Valider le RDV</Button>
                                <Button variant="danger" leftIcon={<Trash2 className="size-4" />}>Supprimer</Button>
                                <Button variant="link">Voir tout</Button>
                            </div>
                        </Specimen>
                        <Specimen label="Tailles, icônes et états">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button size="xs">Très petit</Button>
                                <Button size="sm">Petit</Button>
                                <Button size="md" rightIcon={<ArrowRight className="size-4" />}>Moyen</Button>
                                <Button size="lg" leftIcon={<Phone className="size-4" />}>Grand</Button>
                                <Button
                                    isLoading={loadingBtn}
                                    onClick={() => {
                                        setLoadingBtn(true);
                                        setTimeout(() => setLoadingBtn(false), 1600);
                                    }}
                                >
                                    {loadingBtn ? "Enregistrement…" : "Cliquer pour charger"}
                                </Button>
                                <Button disabled>Désactivé</Button>
                            </div>
                            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-5">
                                <IconButton icon={Search} label="Rechercher" />
                                <IconButton icon={Filter} label="Filtrer" variant="outline" />
                                <IconButton icon={Bell} label="Notifications" variant="soft" />
                                <IconButton icon={Plus} label="Ajouter" variant="primary" />
                                <IconButton icon={Trash2} label="Supprimer" variant="danger" />
                                <IconButton icon={Download} label="Télécharger" variant="outline" isLoading />
                                <span className="mx-2 h-6 w-px bg-line" />
                                <IconButton icon={LayoutGrid} label="Grille" variant="outline" active={view === "grid"} onClick={() => setView("grid")} />
                                <IconButton icon={List} label="Liste" variant="outline" active={view === "list"} onClick={() => setView("list")} />
                            </div>
                        </Specimen>
                    </Block>

                    {/* ── Forms ─────────────────────────────────────────── */}
                    <Block id="forms" title="Formulaires">
                        <Specimen>
                            <div className="grid gap-5 md:grid-cols-2">
                                <Input label="Société" placeholder="Ex : Acme SAS" icon={<Search className="size-4 text-ink-4" />} />
                                <Input label="Email" defaultValue="contact@acme" error="Adresse email incomplète" />
                                <Select
                                    label="Rôle"
                                    value={selectValue}
                                    onChange={setSelectValue}
                                    options={[
                                        { value: "sdr", label: "SDR" },
                                        { value: "manager", label: "Manager" },
                                        { value: "client", label: "Client" },
                                    ]}
                                />
                                <Field label="Canal" hint="Un clic active ou retire un filtre.">
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            ["appel", "Appel", Phone],
                                            ["email", "Email", Mail],
                                            ["rappel", "Rappel", CalendarCheck],
                                        ].map(([key, label, Icon]) => (
                                            <Chip
                                                key={key as string}
                                                icon={Icon as typeof Phone}
                                                selected={chips.includes(key as string)}
                                                onClick={() => toggleChip(key as string)}
                                            >
                                                {label as string}
                                            </Chip>
                                        ))}
                                    </div>
                                </Field>
                                <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} showCount hint="Visible par le client." />
                                <div className="space-y-4">
                                    <Switch checked={notify} onChange={setNotify} label="Notifications du bureau" description="Une alerte quand un RDV est validé." />
                                    <Switch checked={compact} onChange={setCompact} label="Affichage compact" />
                                    <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} label="Inclure les contacts exclus" description="Ils restent grisés dans la liste." />
                                    <Checkbox indeterminate label="Sélection partielle" readOnly />
                                </div>
                            </div>
                        </Specimen>
                    </Block>

                    {/* ── Feedback ──────────────────────────────────────── */}
                    <Block id="feedback" title="Statuts & messages">
                        <Specimen label="Badges">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>Brouillon</Badge>
                                <Badge variant="primary">Qualifié</Badge>
                                <Badge variant="accent">IA</Badge>
                                <Badge variant="success">RDV pris</Badge>
                                <Badge variant="warning">À rappeler</Badge>
                                <Badge variant="danger">En retard</Badge>
                                <Badge variant="info">Nouveau</Badge>
                                <Badge variant="outline">Archivé</Badge>
                                <Badge status="ACTIONABLE">Actionnable</Badge>
                                <Badge status="PARTIAL">Partiel</Badge>
                                <Badge status="INCOMPLETE">Incomplet</Badge>
                            </div>
                            <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-line-subtle pt-5">
                                <StatusText tone="success" pulse>En appel</StatusText>
                                <StatusText tone="warning">En pause</StatusText>
                                <StatusText tone="neutral">Hors ligne</StatusText>
                                <span className="inline-flex items-center gap-2 text-xs text-ink-2">
                                    <StatusDot tone="accent" /> Non lu
                                </span>
                                <span className="inline-flex items-center gap-2 text-sm text-ink-2">
                                    <Spinner className="text-primary-600" /> Synchronisation
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                                    <Kbd>Ctrl</Kbd>
                                    <Kbd>K</Kbd>
                                    recherche
                                </span>
                            </div>
                        </Specimen>
                        <div className="grid gap-5 md:grid-cols-2">
                            <Specimen label="Messages">
                                <div className="space-y-3">
                                    <Callout tone="accent" title="Suggestion de l'assistant">
                                        3 contacts de cette liste ont déjà été appelés par une autre mission.
                                    </Callout>
                                    <Callout tone="warning" title="Quota de la semaine" action={<Button size="xs" variant="secondary">Voir</Button>}>
                                        Il reste 2 jours pour 14 appels.
                                    </Callout>
                                </div>
                            </Specimen>
                            <Specimen label="Notifications (toasts)">
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => toast.success("RDV validé", "Envoyé au client à 14:32.")}>Succès</Button>
                                    <Button size="sm" variant="secondary" onClick={() => toast.error("Envoi impossible", "La boîte mail est déconnectée.")}>Erreur</Button>
                                    <Button size="sm" variant="secondary" onClick={() => toast.warning("Doublon probable", "Ce contact existe dans 2 listes.")}>Alerte</Button>
                                    <Button size="sm" variant="secondary" onClick={() => toast.info("Import en cours", "1 240 lignes, environ 30 s.")}>Info</Button>
                                </div>
                                <div className="mt-5 space-y-3 border-t border-line-subtle pt-5">
                                    <ProgressBar value={62} max={100} showLabel />
                                    <TextSkeleton lines={2} />
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="size-9 rounded-xl" />
                                        <Skeleton className="h-4 w-40" />
                                    </div>
                                </div>
                            </Specimen>
                        </div>
                    </Block>

                    {/* ── Data display ──────────────────────────────────── */}
                    <Block id="data" title="Données">
                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                            <KpiCard label="RDV du mois" value="42" target="60" delta={12.5} deltaLabel="vs sept." icon={CalendarCheck} tone="success" />
                            <KpiCard label="Appels" value="1 284" delta={-4} deltaLabel="vs sept." icon={Phone} tone="primary" />
                            <KpiCard label="Taux de conversion" value="3,3 %" delta={0.4} deltaUnit="pt" icon={Target} tone="accent" />
                            <KpiCard label="Absences RDV" value="2" delta={-50} invertDelta hint="sur 42 RDV" icon={Users} tone="warning" />
                        </div>

                        <Section
                            title="Missions en cours"
                            icon={Target}
                            count={3}
                            subtitle="Triées par priorité"
                            flush
                            actions={
                                <SegmentedControl
                                    ariaLabel="Période"
                                    value={segment}
                                    onChange={setSegment}
                                    options={[
                                        { value: "day", label: "Jour" },
                                        { value: "week", label: "Semaine", count: 12 },
                                        { value: "month", label: "Mois" },
                                    ]}
                                />
                            }
                        >
                            <ul className="divide-y divide-line-subtle">
                                {[
                                    { name: "Acme Industries", sdr: "Léa Martin", rdv: 12, goal: 20, tone: "success" as const, state: "Dans les temps" },
                                    { name: "Nordia Conseil", sdr: "Hugo Bernard", rdv: 4, goal: 15, tone: "warning" as const, state: "À accélérer" },
                                    { name: "Vélia Santé", sdr: "Inès Robert", rdv: 1, goal: 10, tone: "danger" as const, state: "En retard" },
                                ].map((m) => (
                                    <li key={m.name} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6">
                                        <Avatar name={m.name} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                                            <p className="truncate text-xs text-ink-3">{m.sdr}</p>
                                        </div>
                                        <div className="hidden w-40 sm:block">
                                            <ProgressBar value={m.rdv} max={m.goal} height="sm" />
                                        </div>
                                        <span className="w-16 text-right text-sm font-semibold tabular-nums text-ink">
                                            {m.rdv}
                                            <span className="font-normal text-ink-4">/{m.goal}</span>
                                        </span>
                                        <Badge variant={m.tone} className="hidden md:inline-flex">
                                            {m.state}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        </Section>

                        <div className="grid gap-5 md:grid-cols-2">
                            <Specimen label="Onglets">
                                <Tabs
                                    activeTab={tab}
                                    onTabChange={setTab}
                                    tabs={[
                                        { id: "all", label: "Tous", badge: 128 },
                                        { id: "hot", label: "Chauds", badge: 9 },
                                        { id: "callback", label: "Rappels" },
                                    ]}
                                />
                                <div className="mt-5">
                                    <Tabs
                                        variant="pills"
                                        activeTab={tab}
                                        onTabChange={setTab}
                                        tabs={[
                                            { id: "all", label: "Tous" },
                                            { id: "hot", label: "Chauds" },
                                            { id: "callback", label: "Rappels" },
                                        ]}
                                    />
                                </div>
                            </Specimen>
                            <Specimen label="Personnes">
                                <div className="flex flex-wrap items-center gap-3">
                                    <Avatar name="Léa Martin" size="xl" presence="online" />
                                    <Avatar name="Hugo Bernard" size="lg" presence="busy" />
                                    <Avatar name="Inès Robert" size="md" shape="circle" presence="away" />
                                    <Avatar name="Tom Petit" size="sm" />
                                    <Avatar name="Zoé Durand" size="xs" />
                                </div>
                                <div className="mt-5 border-t border-line-subtle pt-5">
                                    <AvatarGroup
                                        people={[{ name: "Léa Martin" }, { name: "Hugo Bernard" }, { name: "Inès Robert" }, { name: "Tom Petit" }, { name: "Zoé Durand" }, { name: "Max Leroy" }]}
                                    />
                                </div>
                            </Specimen>
                        </div>

                        <EmptyState
                            icon={CalendarCheck}
                            title="Aucun rappel aujourd'hui"
                            description="Les rappels programmés par l'équipe apparaîtront ici."
                            action={<Button size="sm" leftIcon={<Plus className="size-4" />}>Programmer un rappel</Button>}
                        />
                    </Block>

                    {/* ── Overlays ──────────────────────────────────────── */}
                    <Block id="overlays" title="Fenêtres">
                        <Specimen>
                            <div className="flex flex-wrap gap-3">
                                <Button variant="secondary" onClick={() => setModalOpen(true)}>Ouvrir une fenêtre</Button>
                                <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Confirmer une suppression</Button>
                                <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Ouvrir un panneau</Button>
                            </div>
                        </Specimen>
                    </Block>

                    {/* ── Patterns ──────────────────────────────────────── */}
                    <Block id="patterns" title="Modèles" intro="La carte héros et la navigation utilisent la surface de marque (bg-inverse) et ses encres dédiées.">
                        <section className="relative isolate overflow-hidden rounded-card bg-inverse p-6 text-inverse-ink shadow-raised sm:p-7">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-inverse-ink-3">Mission active</p>
                                    <h3 className="mt-1.5 font-display text-2xl font-bold tracking-tight">Acme Industries — Q4</h3>
                                    <p className="mt-1 text-sm text-inverse-ink-2">Directeurs financiers, ETI industrielles, Île-de-France</p>
                                </div>
                                <SegmentedControl
                                    tone="inverse"
                                    ariaLabel="Période"
                                    value={segment}
                                    onChange={setSegment}
                                    options={[
                                        { value: "day", label: "Jour" },
                                        { value: "week", label: "Semaine" },
                                        { value: "month", label: "Mois" },
                                    ]}
                                />
                            </div>
                            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    ["Appels", "86"],
                                    ["Joints", "31"],
                                    ["RDV", "4"],
                                    ["Objectif", "70 %"],
                                ].map(([l, v]) => (
                                    <div key={l} className="rounded-panel border border-inverse-line bg-inverse-raised p-3.5">
                                        <p className="text-2xs font-semibold text-inverse-ink-3">{l}</p>
                                        <p className="mt-0.5 font-display text-xl font-bold">{v}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full w-[70%] rounded-full bg-accent" />
                            </div>
                            <div className="mt-6 flex flex-wrap gap-3">
                                <Button variant="accent" leftIcon={<Headphones className="size-4" />}>Démarrer les appels</Button>
                                <Button variant="inverse">Voir la mission</Button>
                            </div>
                        </section>

                        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
                            <div className="rounded-card bg-inverse p-3 shadow-raised">
                                <div className="px-2 pb-4 pt-2">
                                    <BrandLogo tone="inverse" height={26} />
                                </div>
                                <ul className="space-y-0.5">
                                    {[
                                        { icon: Home, label: "Accueil", active: true },
                                        { icon: Target, label: "Missions" },
                                        { icon: Users, label: "Contacts", count: 12 },
                                        { icon: Mail, label: "Emails" },
                                        { icon: Settings, label: "Paramètres" },
                                    ].map(({ icon: Icon, label, active, count }) => (
                                        <li key={label}>
                                            <span
                                                className={cn(
                                                    "relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium",
                                                    active ? "bg-white/10 text-inverse-ink" : "text-inverse-ink-2",
                                                )}
                                            >
                                                {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />}
                                                <Icon className={cn("size-4", active ? "text-accent-300" : "text-inverse-ink-3")} aria-hidden />
                                                {label}
                                                {count && <span className="ml-auto rounded-full bg-accent px-1.5 text-3xs font-bold text-accent-fg">{count}</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <Specimen label="En-tête de section seul">
                                <SectionHeader
                                    title="Rappels du jour"
                                    icon={CalendarCheck}
                                    tone="warning"
                                    count={5}
                                    subtitle="Le plus ancien en premier"
                                    actions={<Button size="sm" variant="link" rightIcon={<ArrowRight className="size-3.5" />}>Voir tout</Button>}
                                />
                                <p className="pt-4 text-sm text-ink-3">Contenu de la carte…</p>
                            </Specimen>
                        </div>
                    </Block>
                </main>
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau rappel" description="Programmé dans l'agenda du SDR." size="md">
                <div className="space-y-4">
                    <Input label="Contact" defaultValue="Claire Dubois — Acme Industries" />
                    <Textarea label="Note" rows={3} placeholder="Contexte du rappel" />
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
                    <Button onClick={() => setModalOpen(false)}>Programmer</Button>
                </ModalFooter>
            </Modal>
            <ConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => setConfirmOpen(false)}
                title="Supprimer la liste ?"
                message="Les 1 240 contacts de cette liste seront retirés de la mission. Cette action est définitive."
                confirmText="Supprimer"
                variant="danger"
            />
            <Drawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title="Acme Industries"
                description="ETI · Industrie · Lyon"
                size="md"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Fermer</Button>
                        <Button leftIcon={<Phone className="size-4" />}>Appeler</Button>
                    </div>
                }
            >
                <div className="space-y-6">
                    <DrawerSection title="Contact principal">
                        <div className="flex items-center gap-3">
                            <Avatar name="Claire Dubois" size="lg" />
                            <div>
                                <p className="text-sm font-semibold text-ink">Claire Dubois</p>
                                <p className="text-xs text-ink-3">Directrice financière</p>
                            </div>
                        </div>
                    </DrawerSection>
                    <DrawerSection title="Historique">
                        <Callout tone="success" title="RDV pris le 2 oct.">Avec Léa Martin, visio de 30 min.</Callout>
                    </DrawerSection>
                </div>
            </Drawer>
        </div>
    );
}
