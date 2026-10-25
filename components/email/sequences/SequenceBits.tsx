"use client";

import Link from "next/link";
import { Badge, Callout } from "@/components/ui";
import { formatRelative, type EngineStatus, type Tone } from "./types";

type BadgeVariant = "default" | "primary" | "accent" | "success" | "warning" | "danger" | "info";

export function toneToBadge(tone: Tone): BadgeVariant {
    return tone === "neutral" ? "default" : tone;
}

export function TonePill({ tone, children, dot = true }: { tone: Tone; children: React.ReactNode; dot?: boolean }) {
    return (
        <Badge variant={toneToBadge(tone)} dot={dot} size="sm">
            {children}
        </Badge>
    );
}

/**
 * Warns the manager when the sending engine (cron) hasn't run recently —
 * otherwise "Active" sequences silently send nothing.
 */
export function EngineHealthCallout({ engine, hasActive }: { engine: EngineStatus | null | undefined; hasActive: boolean }) {
    if (!engine) return null;
    if (engine.healthy) {
        if (!engine.lastRun?.errors) return null;
        return (
            <Callout tone="warning" title="Le dernier passage du moteur a rencontré des erreurs">
                {engine.lastRun.errorSamples?.[0] ?? "Consultez les contacts inscrits pour le détail."}
            </Callout>
        );
    }
    if (!hasActive && !engine.lastRun) return null;
    return (
        <Callout
            tone={hasActive ? "danger" : "warning"}
            title={
                engine.lastRun
                    ? `Le moteur d'envoi n'a pas tourné depuis ${formatRelative(engine.lastRun.at).replace("il y a ", "")}`
                    : "Le moteur d'envoi n'a encore jamais tourné"
            }
        >
            {hasActive
                ? `Aucun email de séquence ne part tant qu'il est arrêté${engine.dueNow ? ` (${engine.dueNow} en attente)` : ""}. `
                : "Les séquences ne pourront pas envoyer tant qu'il est arrêté. "}
            Il doit appeler <code className="rounded bg-surface-3 px-1 text-[12px]">/api/cron/email-sequences</code> toutes les 5 minutes
            (tâche planifiée Dokploy). Prévenez l'équipe technique.
        </Callout>
    );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
            <span aria-hidden>←</span> {children}
        </Link>
    );
}
