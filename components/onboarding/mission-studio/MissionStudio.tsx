"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardCheck, Linkedin, Mail, Phone, Plus, Radar, Search, Send, X } from "lucide-react";
import { useBrand } from "@/lib/brand/client";
import { JOB_TITLE_GROUPS, MISSION_TYPES, SECTORS, SIZES, type Answers, type MissionTypeKey } from "@/lib/client-onboarding/questionnaire";
import {
    briefFromState, emptyState, readLocalDraft, sameState, SECTIONS, sectionDone, stateFromBrief, validateState,
    type Channel, type SectionKey, type StudioState,
} from "@/lib/onboarding/mission-studio";
import { roleFamiliesFor } from "@/lib/onboarding/market-classify";
import type { MissionBrief } from "@/lib/onboarding/self-service-schema";
import { coveredCodes, departementName, type Territory } from "@/lib/onboarding/territory";
import { countLabel, formatCount, selectionTotals, useMarketCounts } from "./counts";
import { BriefCard, Counter, SaveBadge, type SaveState } from "./LivePanel";
import { flyDelta, useLeaving, useReducedMotion, waitForElement, withViewTransition } from "./motion";
import { TerritoryMap, type TerritoryChange } from "./TerritoryMap";

const CHANNELS: { key: Channel; label: string; hint: string; icon: typeof Phone }[] = [
    { key: "CALL", label: "Téléphone", hint: "Nos équipes appellent et qualifient le besoin.", icon: Phone },
    { key: "EMAIL", label: "Email", hint: "Des séquences personnalisées, à votre nom.", icon: Mail },
    { key: "LINKEDIN", label: "LinkedIn", hint: "Invitations et messages aux décideurs.", icon: Linkedin },
];
const TYPE_ICONS: Record<MissionTypeKey, typeof Phone> = { RDV: CalendarDays, DETECTION: Radar, QUALIFICATION: ClipboardCheck, SURVEY: Search };

export interface StudioMission { id: string; status: string; isActive: boolean; brief: MissionBrief | null; name: string; objective: string; channels: Channel[]; startDate: string; endDate: string; targetMeetings: number | null }

const draftKey = (userId: string) => `mission-studio:new:${userId}`;
const readStorage = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const writeStorage = (key: string, value: string | null) => {
    try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* private mode: the draft simply is not kept */ }
};

export function MissionStudio({ mission }: { mission?: StudioMission | null }) {
    const brand = useBrand();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: session } = useSession();
    const userId = session?.user?.id ?? "";
    const reduced = useReducedMotion();
    const missionId = mission?.id;
    const previousAnswers = useRef<Answers | null>(mission?.brief?.questionnaire ?? null);

    const initial = useMemo(() => mission ? stateFromBrief({
        ...(mission.brief ?? {}), name: mission.name, objective: mission.objective, channels: mission.channels, targetMeetings: mission.targetMeetings,
        startDate: mission.startDate.slice(0, 10), endDate: mission.endDate.slice(0, 10),
    }) : emptyState(), [mission]);
    const [state, setState] = useState<StudioState>(initial);
    const [restored, setRestored] = useState<number | null>(null);
    const [showErrors, setShowErrors] = useState(false);
    const [save, setSave] = useState<SaveState>({ kind: "idle", local: !missionId });
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const [active, setActive] = useState<SectionKey>("objective");
    const [seen, setSeen] = useState<Set<SectionKey>>(() => new Set(["objective"]));
    const [sheet, setSheet] = useState(false);
    const lastSaved = useRef<StudioState>(initial);
    const counterRef = useRef<HTMLDivElement>(null);
    const barCounterRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLElement>(null);
    const sectionRefs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});

    // New mission: pick up the draft kept on this device.
    useEffect(() => {
        if (missionId || !userId) return;
        const draft = readLocalDraft(readStorage(draftKey(userId)));
        if (draft && !sameState(draft.state, emptyState())) {
            setState(draft.state); lastSaved.current = draft.state; setRestored(draft.savedAt);
            setSave({ kind: "saved", local: true });
        }
    }, [missionId, userId]);

    const validation = useMemo(() => validateState(state, previousAnswers.current), [state]);
    const errors = showErrors ? validation.issues.fields : {};

    // Autosave: on this device until the first send, then on the server (a valid brief only).
    useEffect(() => {
        if (save.kind === "locked" || sameState(state, lastSaved.current)) return;
        if (!missionId) {
            if (!userId) return;
            const timer = window.setTimeout(() => {
                writeStorage(draftKey(userId), JSON.stringify({ version: 1, savedAt: Date.now(), state }));
                lastSaved.current = state;
                setSave({ kind: "saved", local: true });
            }, 600);
            return () => window.clearTimeout(timer);
        }
        if (!validation.brief) {
            const first = validation.issues.sections[0];
            setSave({ kind: "invalid", detail: `Non enregistré · complétez « ${SECTIONS.find((s) => s.key === first)?.label ?? "le brief"} »` });
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSave({ kind: "saving" });
            try {
                const response = await fetch(`/api/client/missions/${encodeURIComponent(missionId)}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(briefFromState(state, previousAnswers.current)), signal: controller.signal,
                });
                const json = await response.json().catch(() => ({}));
                if (response.status === 409) { setSave({ kind: "locked" }); return; }
                if (!response.ok || !json.success) throw new Error(json.error);
                lastSaved.current = state;
                setSave({ kind: "saved" });
            } catch {
                if (!controller.signal.aborted) setSave({ kind: "error" });
            }
        }, 1200);
        return () => { controller.abort(); window.clearTimeout(timer); };
    }, [state, missionId, userId, validation, save.kind]);

    // Rail follows the scroll; sections reveal once.
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const key = entry.target.getAttribute("data-section") as SectionKey;
                setActive(key);
                setSeen((current) => (current.has(key) ? current : new Set([...current, key])));
            }
        }, { rootMargin: "-35% 0px -55% 0px" });
        const reveal = new IntersectionObserver((entries) => {
            for (const entry of entries) if (entry.isIntersecting) {
                const key = entry.target.getAttribute("data-section") as SectionKey;
                setSeen((current) => (current.has(key) ? current : new Set([...current, key])));
            }
        }, { rootMargin: "0px 0px -12% 0px" });
        for (const el of Object.values(sectionRefs.current)) if (el) { observer.observe(el); reveal.observe(el); }
        return () => { observer.disconnect(); reveal.disconnect(); };
    }, []);

    const criteria = useMemo(() => ({ sectors: [...state.sectors].sort(), sizes: [...state.sizes].sort(), roles: roleFamiliesFor(state.jobTitles) }), [state.sectors, state.sizes, state.jobTitles]);
    const { data: counts, status } = useMarketCounts(criteria);
    const totals = selectionTotals(counts, state.territory);
    const small = counts?.small ?? 20;
    const zoneCount = coveredCodes(state.territory).length;
    const scope = state.territory.all || zoneCount === 0 ? "dans toute la France" : zoneCount === 1 ? "dans votre département" : `dans vos ${zoneCount} départements`;
    const source = `Base de données ${brand.name}, mise à jour en continu`;

    const set = useCallback(<K extends keyof StudioState>(key: K, value: StudioState[K]) => setState((s) => ({ ...s, [key]: value })), []);
    const toggleIn = <K extends "sectors" | "sizes" | "jobTitles" | "channels">(key: K, value: StudioState[K][number]) =>
        setState((s) => {
            const list = s[key] as string[];
            return { ...s, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
        });

    function onTerritory(update: (prev: Territory) => Territory, change: TerritoryChange) {
        if (change.origin && counts && change.codes.length) {
            const n = change.codes.reduce((sum, c) => sum + (counts.departements[c]?.[0] ?? 0), 0);
            const target = window.matchMedia("(max-width: 900px)").matches ? barCounterRef.current : counterRef.current;
            const amount = n < small ? `moins de ${small}` : formatCount(n);
            const whole = !state.territory.all && state.territory.codes.length === 0;
            const emptied = !change.added && !state.territory.all && state.territory.codes.length <= change.codes.length;
            // From « toute la France » the first pick narrows the count: name it rather than « + ».
            if (n > 0 && !emptied) flyDelta(change.origin, target, whole && change.added ? `${departementName(change.codes[0])} · ${amount}` : `${change.added ? "+" : "−"}${amount}`, change.added ? "add" : "remove");
        }
        setState((s) => ({ ...s, territory: update(s.territory) }));
    }

    function go(key: SectionKey) {
        const el = sectionRefs.current[key];
        if (!el) return;
        // Sections skipped by the jump are shown at once, so scrolling back never meets a blank.
        const upTo = SECTIONS.findIndex((s) => s.key === key);
        setSeen((current) => new Set([...current, ...SECTIONS.slice(0, upTo + 1).map((s) => s.key)]));
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }

    async function send() {
        setShowErrors(true); setSendError("");
        const { brief, issues } = validateState(state, previousAnswers.current);
        if (!brief) {
            const first = issues.sections[0];
            if (first) {
                go(first);
                const field = Object.keys(issues.fields)[0];
                window.setTimeout(() => document.getElementById(`ms-field-${field}`)?.focus({ preventScroll: true }), reduced ? 0 : 450);
            }
            return;
        }
        setSending(true);
        try {
            const response = await fetch(`/api/client/missions${missionId ? `/${encodeURIComponent(missionId)}` : ""}`, {
                method: missionId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(briefFromState(state, previousAnswers.current)),
            });
            const json = await response.json().catch(() => ({}));
            if (response.status === 409) { setSave({ kind: "locked" }); throw new Error(json.error || "Cette mission a été prise en charge par l’agence."); }
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible d’envoyer votre brief. Réessayez dans un instant.");
            const saved = json.data as { id: string };
            lastSaved.current = state;
            if (!missionId && userId) writeStorage(draftKey(userId), null);
            // The grid renders the new tile at once, so the card has somewhere to land.
            queryClient.setQueryData(["client", "mission-briefs", userId], (old: { client: unknown; missions: { id: string }[] } | undefined) =>
                old ? { ...old, missions: [saved, ...old.missions.filter((m) => m.id !== saved.id)] } : old);
            void queryClient.invalidateQueries({ queryKey: ["client", "mission-briefs", userId] });
            const url = `/client/missions?sent=${encodeURIComponent(saved.id)}`;
            if (cardRef.current) cardRef.current.style.viewTransitionName = "ms-brief";
            await withViewTransition(async () => {
                router.push(url);
                await waitForElement(`[data-mission-id="${CSS.escape(saved.id)}"]`);
            }, async () => {
                await cardRef.current?.animate([
                    { transform: "none", opacity: 1 },
                    { transform: "translateY(-40px) scale(.92)", opacity: 0 },
                ], { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" }).finished.catch(() => undefined);
            });
        } catch (error) {
            setSendError(error instanceof Error ? error.message : "Une erreur est survenue.");
            setSending(false);
        }
    }

    function startOver() {
        if (userId) writeStorage(draftKey(userId), null);
        const fresh = emptyState();
        lastSaved.current = fresh; setState(fresh); setRestored(null); setSave({ kind: "idle", local: true }); setShowErrors(false);
    }

    const sectionProps = (key: SectionKey, index: number) => ({
        ref: (el: HTMLElement | null) => { sectionRefs.current[key] = el; },
        "data-section": key,
        "data-seen": seen.has(key) || undefined,
        "aria-labelledby": `ms-h-${key}`,
        className: "ms-section",
        style: { ["--i" as string]: index },
    });
    const head = (key: SectionKey, index: number, lede: string) => {
        const meta = SECTIONS[index];
        return <header className="ms-section-head">
            <p className="ms-step">{String(index + 1).padStart(2, "0")} · {meta.label}{sectionDone(key, state) && key !== "review" && <Check size={14} aria-label="complété" />}</p>
            <h2 id={`ms-h-${key}`} tabIndex={-1}>{meta.title}</h2>
            <p className="ms-lede">{lede}</p>
        </header>;
    };

    const jobChoices = JOB_TITLE_GROUPS.flatMap((g) => g.titles as readonly string[]);
    const customTitles = state.jobTitles.filter((t) => !jobChoices.includes(t));
    const locked = save.kind === "locked";

    return <div className="ms" data-motion={reduced ? undefined : "on"}>
        <nav className="ms-rail" aria-label="Sections du brief">
            <Link href="/client/missions" className="ms-back"><ArrowLeft size={15} aria-hidden /><span className="ms-back-label">Mes missions</span></Link>
            <ol>
                {SECTIONS.map((s, i) => <li key={s.key} data-active={active === s.key || undefined} data-done={(s.key !== "review" && sectionDone(s.key, state)) || undefined}
                    data-issue={(showErrors && validation.issues.sections.includes(s.key)) || undefined}>
                    <button type="button" onClick={() => go(s.key)} aria-current={active === s.key ? "step" : undefined}>
                        <span className="ms-rail-dot" aria-hidden>{s.key !== "review" && sectionDone(s.key, state) ? <Check size={11} /> : i + 1}</span>
                        <span className="ms-rail-label">{s.label}</span>
                    </button>
                </li>)}
            </ol>
            <span className="ms-rail-track" aria-hidden><i style={{ transform: `scaleY(${SECTIONS.findIndex((s) => s.key === active) / (SECTIONS.length - 1)})` }} /></span>
        </nav>

        <main className="ms-story">
            <header className="ms-intro">
                <p className="ss-eyebrow">{missionId ? "Brouillon" : "Nouvelle mission"} · {brand.name}</p>
                <h1>{missionId ? "Compléter votre brief" : "Donnez le cap à votre prospection"}</h1>
                <p>Six questions, une page. Votre brief se construit à droite au fil de vos réponses, et le compteur vous montre les entreprises de notre base qui correspondent.</p>
                {restored && <div className="ms-restored" role="status"><Check size={15} aria-hidden />Brouillon repris là où vous l’aviez laissé ({new Date(restored).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}).
                    <button type="button" className="ms-link" onClick={startOver}>Repartir de zéro</button></div>}
                {locked && <div className="ms-restored" data-tone="warn" role="alert">L’agence a pris votre mission en charge : vos dernières modifications n’ont pas été enregistrées. Contactez-la depuis la messagerie pour les ajouter.</div>}
            </header>

            <section {...sectionProps("objective", 0)}>
                {head("objective", 0, "Le résultat qui fera dire que la mission est réussie.")}
                <div className="ms-cards" role="radiogroup" aria-label="Type de mission (facultatif)">
                    {MISSION_TYPES.map((t) => { const Icon = TYPE_ICONS[t.key]; return <button key={t.key} type="button" role="radio" aria-checked={state.missionType === t.key}
                        className="ms-option" onClick={() => set("missionType", state.missionType === t.key ? "" : t.key)}>
                        <Icon size={18} aria-hidden /><strong>{t.label}</strong><span>{t.hint}</span>
                    </button>; })}
                </div>
                <Field id="name" label="Nom de la mission" error={errors.name}>
                    <input id="ms-field-name" className="ms-input" value={state.name} maxLength={200} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Conquête Auvergne-Rhône-Alpes" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "ms-err-name" : undefined} />
                </Field>
                <Field id="objective" label="Votre objectif" hint="Chiffrez-le si vous pouvez : nombre de rendez-vous, profils, échéance." error={errors.objective}>
                    <textarea id="ms-field-objective" className="ms-input" rows={4} value={state.objective} maxLength={5000} onChange={(e) => set("objective", e.target.value)}
                        placeholder="Ex. 20 rendez-vous qualifiés avec des directeurs financiers d’ETI d’ici fin mars." aria-invalid={Boolean(errors.objective)} aria-describedby={errors.objective ? "ms-err-objective" : undefined} />
                </Field>
            </section>

            <section {...sectionProps("target", 1)}>
                {head("target", 1, "Chaque choix met à jour le compteur : vous voyez tout de suite la taille de votre marché.")}
                <Group label="Secteurs" hint="Plusieurs choix possibles">
                    <div className="ms-chips">{SECTORS.map((s) => <Chip key={s.key} on={state.sectors.includes(s.key)} onClick={() => toggleIn("sectors", s.key)}>{s.label}</Chip>)}</div>
                </Group>
                <Group label="Taille d’entreprise" hint="En salariés">
                    <div className="ms-chips">{SIZES.map((s) => <Chip key={s.key} on={state.sizes.includes(s.key)} onClick={() => toggleIn("sizes", s.key)}>{s.label}</Chip>)}</div>
                </Group>
                <Group label="Interlocuteurs" hint="Les fonctions que nous appellerons">
                    {JOB_TITLE_GROUPS.map((g) => <div key={g.label} className="ms-chip-group"><span>{g.label}</span>
                        <div className="ms-chips">{g.titles.map((t) => <Chip key={t} on={state.jobTitles.includes(t)} onClick={() => toggleIn("jobTitles", t)}>{t}</Chip>)}</div></div>)}
                    <CustomTitles titles={customTitles} reduced={reduced} onAdd={(t) => !state.jobTitles.includes(t) && state.jobTitles.length < 30 && set("jobTitles", [...state.jobTitles, t])} onRemove={(t) => set("jobTitles", state.jobTitles.filter((x) => x !== t))} />
                </Group>
                <Field id="audience" label="Précisions" optional hint="Ce que les cases ne disent pas : signaux d’achat, technologies utilisées, contre-exemples…" error={errors.audience}>
                    <textarea id="ms-field-audience" className="ms-input" rows={3} value={state.audienceNotes} maxLength={1500} onChange={(e) => set("audienceNotes", e.target.value)} placeholder="Ex. Entreprises qui recrutent des commerciaux, équipées d’un ERP." aria-invalid={Boolean(errors.audience)} aria-describedby={errors.audience ? "ms-err-audience" : undefined} />
                </Field>
                <Field id="exclusions" label="À exclure" optional error={errors.exclusions}>
                    <textarea id="ms-field-exclusions" className="ms-input" rows={2} value={state.exclusions} maxLength={10000} onChange={(e) => set("exclusions", e.target.value)} placeholder="Clients actuels, concurrents, groupes à éviter…" />
                </Field>
            </section>

            <section {...sectionProps("territory", 2)}>
                {head("territory", 2, "Plus la teinte est soutenue, plus notre base est riche à cet endroit. Cliquez pour composer votre zone.")}
                <TerritoryMap territory={state.territory} counts={counts} status={status} reduced={reduced} onChange={onTerritory} />
                <Field id="note" label="Précisions sur la zone" optional hint="Hors de France, ou une nuance que la carte ne dit pas." error={errors.note}>
                    <input id="ms-field-note" className="ms-input" value={state.territory.note} maxLength={500} onChange={(e) => set("territory", { ...state.territory, note: e.target.value })} placeholder="Ex. aussi la Belgique francophone ; éviter Paris intra-muros" />
                </Field>
            </section>

            <section {...sectionProps("channels", 3)}>
                {head("channels", 3, "Les canaux que nous activons en votre nom, et la période souhaitée.")}
                <div className="ms-cards ms-cards--3" role="group" aria-label="Canaux de prospection">
                    {CHANNELS.map((c) => <button key={c.key} id={c.key === "CALL" ? "ms-field-channels" : undefined} type="button" aria-pressed={state.channels.includes(c.key)} className="ms-option" onClick={() => toggleIn("channels", c.key)}>
                        <c.icon size={18} aria-hidden /><strong>{c.label}</strong><span>{c.hint}</span><i className="ms-option-check" aria-hidden><Check size={12} /></i>
                    </button>)}
                </div>
                {errors.channels && <p className="ms-error" id="ms-err-channels" role="alert">{errors.channels}</p>}
                <div className="ms-pair">
                    <Field id="startDate" label="Début souhaité" error={errors.startDate}>
                        <input id="ms-field-startDate" className="ms-input" type="date" value={state.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={Boolean(errors.startDate)} />
                    </Field>
                    <Field id="endDate" label="Fin souhaitée" error={errors.endDate}>
                        <input id="ms-field-endDate" className="ms-input" type="date" min={state.startDate || undefined} value={state.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={Boolean(errors.endDate)} />
                    </Field>
                </div>
                <Field id="targetMeetings" label="Rendez-vous visés" optional hint="Sur toute la période. Laissez vide si vous ne savez pas encore." error={errors.targetMeetings}>
                    <input id="ms-field-targetMeetings" className="ms-input ms-input--short" type="number" inputMode="numeric" min={1} max={100000} value={state.targetMeetings ?? ""}
                        onChange={(e) => set("targetMeetings", e.target.value ? Math.trunc(Number(e.target.value)) : null)} />
                </Field>
            </section>

            <section {...sectionProps("offer", 4)}>
                {head("offer", 4, "Les mots que nos équipes utiliseront pour parler de vous.")}
                <Field id="pitch" label="En une phrase, que vendez-vous ?" error={errors.pitch} count={[state.pitch.length, 600]}>
                    <input id="ms-field-pitch" className="ms-input" value={state.pitch} maxLength={600} onChange={(e) => set("pitch", e.target.value)} placeholder="Ex. Nous aidons les ETI à clôturer leurs comptes en trois jours." aria-invalid={Boolean(errors.pitch)} aria-describedby={errors.pitch ? "ms-err-pitch" : undefined} />
                </Field>
                <Field id="offerDetail" label="Votre offre en détail" optional count={[state.offerDetail.length, 1500]}>
                    <textarea id="ms-field-offerDetail" className="ms-input" rows={3} value={state.offerDetail} maxLength={1500} onChange={(e) => set("offerDetail", e.target.value)} placeholder="Produits, formules, panier moyen…" />
                </Field>
                <Field id="valueProposition" label="Pourquoi vous plutôt qu’un autre ?" optional error={errors.valueProposition}>
                    <input id="ms-field-valueProposition" className="ms-input" value={state.valueProposition} maxLength={600} onChange={(e) => set("valueProposition", e.target.value)} placeholder="Votre différence, en une phrase." />
                </Field>
                <Group label="Trois atouts" hint="Facultatif">
                    <div className="ms-benefits">{state.benefits.map((b, i) => <input key={i} className="ms-input" aria-label={`Atout ${i + 1}`} value={b} maxLength={300}
                        placeholder={["Ex. Mise en place en une semaine", "Ex. Support basé en France", "Ex. Sans engagement"][i]}
                        onChange={(e) => set("benefits", state.benefits.map((x, j) => (j === i ? e.target.value : x)) as StudioState["benefits"])} />)}</div>
                </Group>
                <Field id="proof" label="Une preuve qui rassure" optional hint="Clients de référence, chiffres, labels.">
                    <textarea id="ms-field-proof" className="ms-input" rows={2} value={state.proof} maxLength={1500} onChange={(e) => set("proof", e.target.value)} placeholder="Ex. 120 clients dont Sodexo et Bouygues ; -40 % de temps de clôture." />
                </Field>
            </section>

            <section {...sectionProps("review", 5)}>
                {head("review", 5, missionId ? "Vos modifications s’enregistrent au fil de l’eau. Relisez, puis revenez à vos missions." : "Relisez en un coup d’œil. À l’envoi, l’agence reçoit votre brief et prépare la campagne avec vous.")}
                <ol className="ms-review">
                    {SECTIONS.slice(0, 5).map((s, i) => {
                        const done = sectionDone(s.key, state);
                        const issue = showErrors && validation.issues.sections.includes(s.key);
                        return <li key={s.key} data-done={done || undefined} data-issue={issue || undefined}>
                            <span className="ms-review-dot" aria-hidden>{done ? <Check size={12} /> : i + 1}</span>
                            <span className="ms-review-text"><strong>{s.label}</strong>{issue ? <em>À compléter</em> : done ? <em>Prêt</em> : <em>{s.key === "territory" ? "Facultatif : toute la France par défaut" : "À compléter"}</em>}</span>
                            <button type="button" className="ms-link" onClick={() => go(s.key)}>Modifier</button>
                        </li>;
                    })}
                </ol>
                <p className="ms-review-market">{status === "error" || !counts ? "" : <>Votre cible : <b>{countLabel(totals[0], small, ["entreprise", "entreprises"])}</b> et <b>{countLabel(totals[1], small, ["décideur", "décideurs"])}</b> déjà dans la base, {scope}.</>}</p>
                {sendError && <p className="ms-error" role="alert">{sendError}</p>}
                {showErrors && !validation.brief && <p className="ms-error" role="alert">Il manque encore quelques éléments, signalés en rouge. Rien n’est perdu : tout est enregistré.</p>}
                <div className="ms-send">
                    <button type="button" className="ms-primary" onClick={() => void send()} disabled={sending || locked} data-busy={sending || undefined}>
                        {sending ? <span className="ms-spinner" aria-hidden /> : <Send size={16} aria-hidden />}
                        {missionId ? "Enregistrer et revenir à mes missions" : "Envoyer mon brief à l’agence"}
                    </button>
                    <p>{missionId ? "Tant que l’agence n’a pas lancé la mission, vous pouvez la modifier." : "Votre mission est créée en brouillon : l’agence valide le lancement avec vous."}</p>
                </div>
            </section>
        </main>

        <aside className="ms-panel" aria-label="Votre brief en direct">
            <Counter ref={counterRef} totals={totals} status={status} small={small} ready={Boolean(counts)} reduced={reduced} scope={scope} source={source} />
            <BriefCard ref={cardRef} state={state} save={save} agency={brand.name} />
        </aside>

        <div className="ms-bar" data-open={sheet || undefined}>
            <button type="button" className="ms-bar-toggle" aria-expanded={sheet} aria-controls="ms-sheet" onClick={() => setSheet((v) => !v)}>
                <Counter ref={barCounterRef} compact totals={totals} status={status} small={small} ready={Boolean(counts)} reduced={reduced} scope={scope} source={source} />
                <span className="ms-bar-cta">{sheet ? <X size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}<span className="ms-sr">{sheet ? "Masquer le brief" : "Voir le brief"}</span></span>
            </button>
            <div id="ms-sheet" className="ms-sheet" hidden={!sheet}>
                <SaveBadge save={save} />
                <BriefCard state={state} save={save} agency={brand.name} />
            </div>
        </div>
    </div>;
}

function Field({ id, label, hint, optional, error, count, children }: { id: string; label: string; hint?: string; optional?: boolean; error?: string; count?: [number, number]; children: ReactNode }) {
    return <div className="ms-field" data-invalid={Boolean(error) || undefined}>
        <label htmlFor={`ms-field-${id}`} className="ms-label">{label}{optional && <span className="ms-optional">facultatif</span>}
            {count && count[0] > count[1] * 0.7 && <span className="ms-countdown" aria-live="polite">{count[1] - count[0]} caractères restants</span>}</label>
        {hint && <p className="ms-hint">{hint}</p>}
        <div className="ms-control">{children}</div>
        {error && <p className="ms-error" id={`ms-err-${id}`} role="alert">{error}</p>}
    </div>;
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return <fieldset className="ms-group"><legend className="ms-label">{label}{hint && <span className="ms-optional">{hint}</span>}</legend>{children}</fieldset>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
    return <button type="button" className="ms-chip" aria-pressed={on} onClick={onClick}><span className="ms-chip-check" aria-hidden><Check size={13} /></span>{children}</button>;
}

function CustomTitles({ titles, reduced, onAdd, onRemove }: { titles: string[]; reduced: boolean; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
    const [value, setValue] = useState("");
    const shown = useLeaving(titles, (t) => t, reduced);
    const add = () => { const t = value.trim().slice(0, 120); if (t) onAdd(t); setValue(""); };
    return <div className="ms-custom">
        {shown.length > 0 && <div className="ms-tokens">{shown.map(({ item, leaving }) => <span key={item} className="ms-token" data-leaving={leaving || undefined}>{item}
            {!leaving && <button type="button" aria-label={`Retirer ${item}`} onClick={() => onRemove(item)}><X size={12} /></button>}</span>)}</div>}
        <div className="ms-add">
            <input className="ms-input" value={value} maxLength={120} aria-label="Ajouter une autre fonction" placeholder="Une autre fonction ? Ex. Directeur innovation"
                onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <button type="button" className="ms-ghost" onClick={add} disabled={!value.trim()}><Plus size={15} aria-hidden />Ajouter</button>
        </div>
    </div>;
}
