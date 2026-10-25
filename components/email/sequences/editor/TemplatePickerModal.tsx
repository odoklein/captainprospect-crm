"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Button, Callout, EmptyState, Input, Modal, ModalFooter, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiJson, errorMessage } from "../api";
import { htmlToPlain } from "./draft";

interface TemplateRow {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    category?: string | null;
    createdBy?: { name: string } | null;
    updatedAt?: string;
}

interface TemplatePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** True when the current email already has content (we warn before replacing). */
    willReplace: boolean;
    onPick: (template: { subject: string; body: string; name: string }) => void;
}

let cache: TemplateRow[] | null = null;

export function TemplatePickerModal({ isOpen, onClose, willReplace, onPick }: TemplatePickerModalProps) {
    const [templates, setTemplates] = useState<TemplateRow[] | null>(cache);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || cache) return;
        let cancelled = false;
        apiJson<TemplateRow[]>("/api/email/templates")
            .then(({ data }) => {
                cache = data ?? [];
                if (!cancelled) setTemplates(cache);
            })
            .catch((e) => !cancelled && setError(errorMessage(e, "Impossible de charger les modèles")));
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (templates ?? []).filter(
            (t) => !q || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || (t.category ?? "").toLowerCase().includes(q),
        );
    }, [templates, query]);

    const selected = filtered.find((t) => t.id === selectedId) ?? null;

    const confirm = () => {
        if (!selected) return;
        onPick({ name: selected.name, subject: selected.subject, body: htmlToPlain(selected.bodyHtml) });
        setSelectedId(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Partir d'un modèle" description="L'objet et le texte du modèle remplacent ceux de cet email. Vous pourrez ensuite les modifier." size="xl">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="min-w-0 space-y-3">
                    <Input
                        size="sm"
                        placeholder="Rechercher un modèle…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        icon={<Search className="size-4" />}
                        aria-label="Rechercher un modèle"
                        autoFocus
                    />
                    {error && <Callout tone="danger">{error}</Callout>}
                    <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                        {!templates && !error &&
                            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                        {templates && filtered.length === 0 && (
                            <EmptyState variant="inline" icon={FileText} title="Aucun modèle trouvé" description={query ? "Essayez un autre mot-clé." : "Créez vos modèles dans l'onglet Modèles."} />
                        )}
                        {filtered.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedId(t.id)}
                                onDoubleClick={() => {
                                    setSelectedId(t.id);
                                    onPick({ name: t.name, subject: t.subject, body: htmlToPlain(t.bodyHtml) });
                                    onClose();
                                }}
                                className={cn(
                                    "block w-full rounded-lg border px-3 py-2 text-left transition-colors",
                                    selectedId === t.id ? "border-primary-300 bg-primary-50" : "border-transparent hover:bg-surface-2",
                                )}
                            >
                                <p className="truncate text-[13px] font-semibold text-ink">{t.name}</p>
                                <p className="truncate text-xs text-ink-3">{t.subject || "Sans objet"}</p>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4">
                    {selected ? (
                        <>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Objet</p>
                            <p className="mb-3 text-sm font-semibold text-ink">{selected.subject || "Sans objet"}</p>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Message</p>
                            <p className="mt-1 max-h-[340px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                                {htmlToPlain(selected.bodyHtml)}
                            </p>
                        </>
                    ) : (
                        <p className="py-16 text-center text-sm text-ink-3">Sélectionnez un modèle pour le prévisualiser.</p>
                    )}
                </div>
            </div>
            <ModalFooter>
                {willReplace && selected && <p className="mr-auto text-xs text-warning-ink">Le contenu actuel de cet email sera remplacé.</p>}
                <Button variant="ghost" onClick={onClose}>Annuler</Button>
                <Button onClick={confirm} disabled={!selected}>Utiliser ce modèle</Button>
            </ModalFooter>
        </Modal>
    );
}
