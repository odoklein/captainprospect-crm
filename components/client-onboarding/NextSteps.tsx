"use client";

// « Prochaines étapes », shown once the client has approved the questionnaire:
// book the kick-off with the project manager, then blacklist, calendar and
// documents (still saved automatically, the questionnaire itself is locked).

import { useState, type ComponentType, type ReactNode } from "react";
import { Ban, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { nextStepDone, type Answers, type NextStepKey } from "@/lib/client-onboarding/questionnaire";
import type { PortalView } from "@/lib/client-onboarding/service";
import { BlacklistEditor, CalendarEditor, DocumentsEditor } from "./screens";
import { Timeline } from "./ReviewScreen";
import { Avatar, CARD, FOCUS } from "./ui";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function StepCard({ index, icon: IconC, title, hint, done, open, onToggle, children }: {
    index: number;
    icon: Icon;
    title: string;
    hint: string;
    done: boolean;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    const panelId = `next-step-${index}`;
    return (
        <li className={cn(CARD, "overflow-hidden transition-shadow", open && "ring-2 ring-primary/15")}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className={cn("flex w-full items-center gap-4 p-5 text-left hover:bg-surface-2/60", FOCUS)}
            >
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", done ? "bg-primary text-primary-fg" : "bg-primary-50 text-primary-600")} aria-hidden>
                    {done ? <Check className="size-5" strokeWidth={3} /> : <IconC className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-bold text-ink">
                        <span className="mr-2 text-ink-4">{index}.</span>{title}
                    </span>
                    <span className="block text-sm text-ink-3">{hint}</span>
                </span>
                {done && <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 sm:inline">Fait</span>}
                <ChevronDown className={cn("size-5 shrink-0 text-ink-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && <div id={panelId} className="border-t border-line-subtle px-5 pb-5 pt-4">{children}</div>}
        </li>
    );
}

export function NextSteps({ view, answers, update }: {
    view: PortalView;
    answers: Answers;
    update: (fn: (a: Answers) => void) => void;
}) {
    const [open, setOpen] = useState<NextStepKey | null>("kickoff");
    const toggle = (k: NextStepKey) => setOpen((o) => (o === k ? null : k));
    const firstName = answers.referent.name.trim().split(/\s+/)[0] ?? "";
    const manager = view.accountManager?.name ?? null;

    return (
        <div className="mx-auto w-full max-w-4xl pb-16">
            <header className="mb-8 text-center">
                <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden>
                    <CheckCircle2 className="size-8" />
                </span>
                <h1 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-tight tracking-tight text-ink">
                    C&apos;est validé{firstName ? <>, <span className="text-primary">{firstName}</span></> : null}.
                </h1>
                <p className="mt-3 text-lg text-ink-3">Voici la suite pour préparer le lancement. Tout est enregistré automatiquement.</p>
            </header>

            <Timeline
                steps={[
                    { label: "Questionnaire", state: "done" },
                    { label: "Ciblage", state: "done" },
                    { label: "Discours", state: "done" },
                    { label: "Point avec votre chef de projet", state: "next" },
                    { label: "Lancement", state: "goal" },
                ]}
            />

            <ol className="mt-6 space-y-4">
                <StepCard
                    index={1}
                    icon={CalendarClock}
                    title="Prenez rendez-vous avec votre chef de projet"
                    hint="30 minutes pour valider le ciblage, le script et la date de lancement."
                    done={false}
                    open={open === "kickoff"}
                    onToggle={() => toggle("kickoff")}
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {manager && (
                            <div className="flex items-center gap-3">
                                <Avatar name={manager} size={44} />
                                <div>
                                    <p className="font-bold text-ink">{manager}</p>
                                    <p className="text-sm text-ink-3">Votre chef de projet</p>
                                </div>
                            </div>
                        )}
                        {view.kickoffUrl ? (
                            <a
                                href={view.kickoffUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn("inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-primary-fg shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--brand-primary)_70%,transparent)] hover:bg-primary-hover", FOCUS)}
                            >
                                Choisir un créneau <ExternalLink className="size-4" aria-hidden />
                            </a>
                        ) : (
                            <p className="max-w-sm text-sm text-ink-2">
                                {manager ? `${manager.split(/\s+/)[0]} vous contacte` : "Votre chef de projet vous contacte"} pour fixer ce rendez-vous.
                            </p>
                        )}
                    </div>
                </StepCard>

                <StepCard
                    index={2}
                    icon={Ban}
                    title="Votre blacklist"
                    hint="Clients actuels, partenaires, concurrents : les entreprises à ne jamais contacter."
                    done={nextStepDone("blacklist", answers)}
                    open={open === "blacklist"}
                    onToggle={() => toggle("blacklist")}
                >
                    <BlacklistEditor answers={answers} update={update} />
                </StepCard>

                <StepCard
                    index={3}
                    icon={CalendarDays}
                    title="Votre calendrier"
                    hint="Où et quand placer les rendez-vous de vos prospects."
                    done={nextStepDone("calendar", answers)}
                    open={open === "calendar"}
                    onToggle={() => toggle("calendar")}
                >
                    <CalendarEditor answers={answers} update={update} />
                </StepCard>

                <StepCard
                    index={4}
                    icon={FileText}
                    title="Vos documents"
                    hint="Plaquette, présentation, tarifs : ce qui aidera nos équipes à bien parler de vous."
                    done={nextStepDone("documents", answers)}
                    open={open === "documents"}
                    onToggle={() => toggle("documents")}
                >
                    <DocumentsEditor answers={answers} update={update} />
                </StepCard>
            </ol>
        </div>
    );
}
