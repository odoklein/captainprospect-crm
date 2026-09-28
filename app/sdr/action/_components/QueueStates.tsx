"use client";

import Link from "next/link";
import { AlertCircle, CalendarX, CheckCircle2, Filter, ListX, RefreshCw, SearchX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CpButton, focusRing } from "./primitives";

export function QueueSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div role="status" aria-label="Chargement de la file" className="divide-y divide-cp-border/70">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <div className="size-4 rounded bg-cp-sunken" />
                    <div className="size-9 animate-pulse rounded-full bg-cp-sunken" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-40 animate-pulse rounded bg-cp-sunken" />
                        <div className="h-2.5 w-28 animate-pulse rounded bg-cp-sunken/70" />
                    </div>
                    <div className="hidden h-8 w-36 animate-pulse rounded-lg bg-cp-sunken md:block" />
                    <div className="hidden h-6 w-32 animate-pulse rounded bg-cp-sunken lg:block" />
                    <div className="h-8 w-44 animate-pulse rounded-lg bg-cp-sunken" />
                </div>
            ))}
            <span className="sr-only">Chargement…</span>
        </div>
    );
}

function StateBlock({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-cp-sunken text-cp-ink-3">
                <Icon className="size-6" aria-hidden />
            </div>
            <p className="text-base font-semibold text-cp-ink">{title}</p>
            {children && <div className="mt-1 max-w-md text-sm text-cp-ink-3">{children}</div>}
            {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
        </div>
    );
}

export function QueueError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <StateBlock icon={AlertCircle} title={message} action={<CpButton icon={RefreshCw} onClick={onRetry}>Réessayer</CpButton>}>
            Vérifiez votre connexion puis réessayez.
        </StateBlock>
    );
}

export type EmptyReason =
    | { kind: "no-missions" }
    | { kind: "not-planned" }
    | { kind: "no-lists" }
    | { kind: "no-search-results"; search: string }
    | { kind: "filtered-out" }
    | { kind: "queue-empty" };

export function QueueEmpty({
    reason,
    onClearSearch,
    onResetFilters,
    onRefresh,
}: {
    reason: EmptyReason;
    onClearSearch: () => void;
    onResetFilters: () => void;
    onRefresh: () => void;
}) {
    switch (reason.kind) {
        case "no-missions":
            return (
                <StateBlock icon={AlertCircle} title="Aucune mission active">
                    Vous n&apos;êtes assigné à aucune mission. Demandez à votre manager de vous y ajouter.
                </StateBlock>
            );
        case "not-planned":
            return (
                <StateBlock
                    icon={CalendarX}
                    title="Aucune mission planifiée aujourd'hui"
                    action={
                        <Link
                            href="/sdr/planning"
                            className={cn("inline-flex h-9 items-center rounded-lg border border-cp-border bg-cp-raised px-3 text-sm font-medium text-cp-ink hover:border-cp-border-strong", focusRing)}
                        >
                            Voir mon planning
                        </Link>
                    }
                >
                    La file ne montre que les missions de votre planning du jour.
                </StateBlock>
            );
        case "no-lists":
            return (
                <StateBlock icon={ListX} title="Cette mission n'a pas encore de liste">
                    Votre manager doit y rattacher une liste de sociétés et de contacts.
                </StateBlock>
            );
        case "no-search-results":
            return (
                <StateBlock icon={SearchX} title={`Aucun résultat pour « ${reason.search} »`} action={<CpButton onClick={onClearSearch}>Effacer la recherche</CpButton>}>
                    La recherche porte sur le nom, la société et le numéro de téléphone.
                </StateBlock>
            );
        case "filtered-out":
            return (
                <StateBlock icon={Filter} title="Aucune ligne ne correspond à cette vue" action={<CpButton onClick={onResetFilters}>Réinitialiser les filtres</CpButton>} />
            );
        case "queue-empty":
            return (
                <StateBlock icon={CheckCircle2} title="Rien à traiter pour cette liste" action={<CpButton icon={RefreshCw} onClick={onRefresh}>Actualiser</CpButton>}>
                    <p>Les prospects traités il y a moins de 24 h reviennent automatiquement ensuite.</p>
                    <details className="mt-3 text-left">
                        <summary className="cursor-pointer text-center text-xs font-medium text-cp-ink-2 hover:text-cp-ink">La file devrait contenir des lignes ?</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                            <li>La mission doit avoir une campagne active.</li>
                            <li>La liste doit être active (onglet BDD du manager).</li>
                            <li>Les sociétés sans contact n&apos;apparaissent qu&apos;en appel, si la société a un téléphone.</li>
                            <li>Vous devez être assigné à la mission.</li>
                        </ul>
                    </details>
                </StateBlock>
            );
    }
}
