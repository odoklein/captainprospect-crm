"use client";

import { Modal } from "@/components/ui";
import { Kbd } from "./primitives";

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
    {
        title: "Naviguer",
        items: [
            { keys: ["↑", "↓"], label: "Ligne précédente / suivante (ou k / j)" },
            { keys: ["Début", "Fin"], label: "Première / dernière ligne" },
            { keys: ["/"], label: "Rechercher" },
            { keys: ["r"], label: "Actualiser la file" },
        ],
    },
    {
        title: "Traiter la ligne active",
        items: [
            { keys: ["a"], label: "Appeler" },
            { keys: ["1", "2", "3", "4"], label: "Résultat rapide (ouvre la note si elle est requise)" },
            { keys: ["⏎"], label: "Ouvrir la fiche complète" },
            { keys: ["x"], label: "Sélectionner / désélectionner" },
            { keys: ["s"], label: "Afficher / masquer le script" },
        ],
    },
    {
        title: "Saisie du résultat",
        items: [
            { keys: ["Ctrl", "⏎"], label: "Enregistrer" },
            { keys: ["Échap"], label: "Annuler / fermer" },
        ],
    },
];

export function ShortcutsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Raccourcis clavier" description="Toute la file se traite sans souris." size="md">
            <div className="space-y-5">
                {GROUPS.map((g) => (
                    <section key={g.title}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cp-ink-3">{g.title}</h3>
                        <ul className="divide-y divide-cp-border rounded-xl border border-cp-border">
                            {g.items.map((item) => (
                                <li key={item.label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-cp-ink-2">
                                    <span>{item.label}</span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        {item.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </Modal>
    );
}
