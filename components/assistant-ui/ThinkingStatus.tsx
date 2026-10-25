"use client";

/**
 * What Captain AI is doing while the turn runs. The chat endpoint answers in
 * one block, so the steps are inferred from the question itself (an RDV
 * question opens the RDV, a "pourquoi" question cross-checks sources) and
 * paced over time, ending on « Je rédige la réponse » until it lands.
 */

import { useEffect, useMemo, useState } from "react";
import { AiMark } from "@/components/ui/AiMark";

const STEP_MS = 2200;

const TOPICS: Array<{ match: RegExp; steps: string[] }> = [
    { match: /\b(rdv|rendez|meeting|absen|confirm)/, steps: ["J'ouvre l'agenda des RDV…", "Je vérifie les retours clients…"] },
    { match: /\b(appel|call|transcri|dit|ecoute|conversation)/, steps: ["J'écoute les transcriptions d'appels…", "Je relis les notes des SDR…"] },
    { match: /\b(sdr|commercia|equipe|perf|qui )/, steps: ["Je compare les performances des SDR…"] },
    { match: /\b(chiffre|combien|stat|taux|mois|semaine|jour|periode|evolution)/, steps: ["Je calcule les chiffres de la période…", "Je compare avec la période précédente…"] },
    { match: /\b(liste|fichier|base|donnee|qualite|doublon)/, steps: ["J'inspecte les listes de prospection…"] },
    { match: /\b(acces|compte|mot de passe|identifiant|portail)/, steps: ["Je vérifie les accès du projet…"] },
    { match: /\b(email|mail|brouillon)/, steps: ["Je prépare le contenu de l'email…"] },
    { match: /\b(contact|prospect|societe|entreprise|lead)/, steps: ["Je retrouve les fiches prospects…"] },
    { match: /\b(factur|paiement|echeanc)/, steps: ["Je consulte l'échéancier de facturation…"] },
    { match: /\b(script|pitch|cible|icp|mission|campagne)/, steps: ["Je relis le script et la cible de la mission…"] },
    { match: /\b(pourquoi|baisse|hausse|analyse|cause|probleme|explique)/, steps: ["Je cherche les causes…", "Je croise plusieurs sources…"] },
];

function normalize(text: string): string {
    return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function buildThinkingSteps(prompt: string, scopeName: string | null): string[] {
    const text = normalize(prompt);
    const matched = TOPICS.filter((t) => t.match.test(text)).flatMap((t) => t.steps);
    const middle =
        matched.length > 0
            ? matched.slice(0, 5)
            : [`Je parcours les données ${scopeName ? `de ${scopeName}` : "de l'agence"}…`, "Je croise plusieurs sources…"];
    return ["Je lis votre question…", ...middle, "Je vérifie les chiffres…", "Je rédige la réponse…"];
}

export function ThinkingStatus({
    prompt,
    scopeName,
    elapsedMs,
}: {
    prompt: string;
    scopeName: string | null;
    elapsedMs: number;
}) {
    const steps = useMemo(() => buildThinkingSteps(prompt, scopeName), [prompt, scopeName]);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
        const timer = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), STEP_MS);
        return () => clearInterval(timer);
    }, [steps]);

    const longWait = index === steps.length - 1 && elapsedMs > (steps.length + 3) * STEP_MS;
    const label = longWait ? "Analyse en profondeur, encore quelques secondes…" : steps[index];

    return (
        <div className="flex gap-3" role="status" aria-live="polite">
            <span className="cp-ai-orb cp-ai-orb-busy flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
                <AiMark className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-1">
                <p
                    key={label}
                    className="cp-ai-shimmer animate-in fade-in-0 slide-in-from-bottom-1 text-sm font-medium duration-300"
                >
                    {label}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="flex gap-1" aria-hidden>
                        {steps.map((_, i) => (
                            <span
                                key={i}
                                className={
                                    i <= index
                                        ? "h-1 w-3 rounded-full bg-accent-500 transition-colors"
                                        : "h-1 w-3 rounded-full bg-slate-200 transition-colors"
                                }
                            />
                        ))}
                    </span>
                    <span className="tabular-nums">{(elapsedMs / 1000).toFixed(1)} s</span>
                </div>
            </div>
        </div>
    );
}
