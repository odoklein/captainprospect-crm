"use client";

// ============================================
// In-context help for the Appeler list.
//
// - A « Bien démarrer » line above the list for a new SDR: three steps that
//   tick themselves when they are actually done (open a prospect, call, log
//   the result). It never blocks anything, can be hidden, and goes away once
//   the three are done. Remembered per person on this browser.
// - The keyboard sheet: « ? » anywhere on the page, or the help button.
// ============================================

import { useCallback, useEffect, useState } from "react";
import { Check, Keyboard, X } from "lucide-react";
import { Kbd, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

type Step = "opened" | "called" | "saved";
type GuideState = Record<Step, boolean> & { hidden: boolean };
const EMPTY: GuideState = { opened: false, called: false, saved: false, hidden: false };

function storageKey(userId: string) {
    return `cp_appeler_guide_${userId}`;
}

function read(userId: string | null | undefined): GuideState {
    if (!userId || typeof window === "undefined") return EMPTY;
    try {
        const raw = localStorage.getItem(storageKey(userId));
        return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<GuideState>) } : EMPTY;
    } catch {
        return EMPTY;
    }
}

/** Progress of the first-run guide; `mark` ticks a step (idempotent). */
export function useAppelerGuide(userId: string | null | undefined) {
    const [state, setState] = useState<GuideState>(() => read(userId));
    const [loadedFor, setLoadedFor] = useState(userId);
    // The session can arrive after the first render: load that person's progress then.
    if (loadedFor !== userId) {
        setLoadedFor(userId);
        setState(read(userId));
    }
    useEffect(() => {
        if (!userId) return;
        try {
            localStorage.setItem(storageKey(userId), JSON.stringify(state));
        } catch {
            /* private mode: the guide simply comes back next time */
        }
    }, [userId, state]);

    const mark = useCallback((step: Step) => setState((s) => (s[step] ? s : { ...s, [step]: true })), []);
    const hide = useCallback(() => setState((s) => ({ ...s, hidden: true })), []);
    const done = state.opened && state.called && state.saved;
    return { state, mark, hide, visible: !!userId && !state.hidden && !done };
}

const STEPS: { id: Step; label: string; hint: React.ReactNode }[] = [
    { id: "opened", label: "Ouvrir un prospect", hint: <>clic sur une ligne, ou <Kbd>J</Kbd> puis <Kbd>Entrée</Kbd></> },
    { id: "called", label: "L'appeler", hint: <>bouton vert « Appeler » du panneau</> },
    { id: "saved", label: "Noter le résultat", hint: <><Kbd>1</Kbd>–<Kbd>6</Kbd> puis <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd></> },
];

export function AppelerGuide({
    state,
    onHide,
    onShortcuts,
}: {
    state: GuideState;
    onHide: () => void;
    onShortcuts: () => void;
}) {
    const next = STEPS.find((s) => !state[s.id]);
    return (
        <section aria-label="Bien démarrer" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5">
            <p className="text-[13px] font-semibold text-ink">Bien démarrer</p>
            <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
                {STEPS.map((s, i) => {
                    const done = state[s.id];
                    const current = next?.id === s.id;
                    return (
                        <li key={s.id} className="flex items-center gap-2 text-[12.5px]">
                            <span
                                aria-hidden
                                className={cn(
                                    "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors",
                                    done ? "bg-success text-white" : current ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-3",
                                )}
                            >
                                {done ? <Check className="size-3" /> : i + 1}
                            </span>
                            <span className={cn(done ? "text-ink-4 line-through decoration-line-strong" : current ? "font-medium text-ink" : "text-ink-3")}>
                                {s.label}
                                <span className="sr-only">{done ? " (fait)" : ""}</span>
                            </span>
                            {current && <span className="hidden text-ink-4 xl:inline">· {s.hint}</span>}
                        </li>
                    );
                })}
            </ol>
            <div className="ml-auto flex items-center gap-1">
                <button
                    type="button"
                    onClick={onShortcuts}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <Keyboard className="size-3.5" aria-hidden /> Raccourcis <Kbd>?</Kbd>
                </button>
                <button
                    type="button"
                    onClick={onHide}
                    aria-label="Masquer le guide"
                    title="Masquer le guide"
                    className="grid size-7 place-items-center rounded-md text-ink-4 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <X className="size-3.5" aria-hidden />
                </button>
            </div>
        </section>
    );
}

const GROUPS: { title: string; rows: [React.ReactNode, string][] }[] = [
    {
        title: "Dans la liste",
        rows: [
            [<Kbd key="s">/</Kbd>, "Rechercher (nom, société, numéro, note)"],
            [<><Kbd>J</Kbd> <Kbd>K</Kbd></>, "Prospect suivant / précédent (ou ↓ ↑)"],
            [<Kbd key="e">Entrée</Kbd>, "Ouvrir le prospect dans le panneau"],
        ],
    },
    {
        title: "Dans le panneau",
        rows: [
            [<><Kbd>1</Kbd>–<Kbd>6</Kbd></>, "Choisir le résultat de l'appel"],
            [<><Kbd>Ctrl</Kbd> + <Kbd>Entrée</Kbd></>, "Enregistrer et passer au suivant (même depuis la note)"],
            [<><Kbd>←</Kbd> <Kbd>→</Kbd></>, "Changer d'onglet (Appel, Fiche, Script, SMS) une fois un onglet sélectionné"],
            [<Kbd key="esc">Échap</Kbd>, "Fermer le panneau"],
        ],
    },
];

export function AppelerShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Modal isOpen={open} onClose={onClose} title="Raccourcis clavier" description="Ils ne s'appliquent pas pendant la saisie d'un texte." size="md">
            <div className="space-y-5">
                {GROUPS.map((g) => (
                    <section key={g.title}>
                        <h3 className="mb-1 text-[12.5px] font-semibold text-ink-3">{g.title}</h3>
                        <dl className="divide-y divide-line-subtle">
                            {g.rows.map(([keys, label], i) => (
                                <div key={i} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                                    <dt className="text-ink-2">{label}</dt>
                                    <dd className="flex shrink-0 items-center gap-1 text-ink-4">{keys}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
                <p className="text-[12px] text-ink-3">
                    Le Mode Focus a ses propres raccourcis (appeler, passer, pause) : <Kbd>?</Kbd> pendant une session.
                </p>
            </div>
        </Modal>
    );
}

/** « ? » opens the sheet (outside text fields and other dialogs). */
export function useQuestionMarkKey(onOpen: () => void, enabled = true) {
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
            if (document.querySelector('[aria-modal="true"]')) return;
            e.preventDefault();
            onOpen();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onOpen, enabled]);
}
