import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTETAKERS } from "@/lib/notetakers/catalog";
import { NOTETAKER_GUIDES, type NotetakerGuide } from "@/lib/notetakers/guide";

// ============================================
// « Où trouver la clé » for one note-taker: the offer that includes the API,
// the clicks in the tool, what the key sees, and links to the key page and
// the vendor's guide. Paramètres › Intégrations.
// ============================================

export function NotetakerKeyHelp({ id, className }: { id: string; className?: string }) {
    const guide: NotetakerGuide | undefined = NOTETAKER_GUIDES[id as keyof typeof NOTETAKER_GUIDES];
    if (!guide) return null;
    const label = NOTETAKERS.find((n) => n.id === id)?.label ?? id;
    return (
        <div className={cn("rounded-xl bg-surface-2 px-4 py-3 text-xs text-ink-2", className)}>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-semibold text-ink">Où trouver la clé {label}</span>
                {guide.plan && <span className="text-ink-3">API : {guide.plan}</span>}
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 leading-relaxed marker:text-ink-4">
                {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                ))}
            </ol>
            {guide.note && <p className="mt-2 leading-relaxed text-ink-3">{guide.note}</p>}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {guide.keyUrl && (
                    <a href={guide.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-link hover:underline">
                        Ouvrir la page de la clé dans {label} <ExternalLink className="size-3" aria-hidden />
                    </a>
                )}
                <a href={guide.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-link hover:underline">
                    Guide officiel {label} <ExternalLink className="size-3" aria-hidden />
                </a>
            </p>
        </div>
    );
}
