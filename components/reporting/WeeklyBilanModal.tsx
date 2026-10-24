"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Pencil, RefreshCw } from "lucide-react";
import { Button, Callout, Checkbox, Modal, ModalFooter, SegmentedControl, Textarea, useToast } from "@/components/ui";
import type { WeeklyBilanStats } from "@/lib/reporting/weekly-bilan-render";

interface BilanDraft {
    week: { start: string; end: string; label: string };
    sessionDate: string;
    clientEmail: string | null;
    stats: WeeklyBilanStats;
    markdown: string;
    email: string;
    ai: { status: "ok" | "failed" | "skipped"; error?: string };
    unverifiedNumbers: string[];
    existingReportingSessionId: string | null;
}

interface WeeklyBilanModalProps {
    clientId: string;
    clientName: string;
    /** Any day of the wanted week ("YYYY-MM-DD"); default = this Friday's week (last week on Monday). */
    initialWeekStart?: string | null;
    isOpen: boolean;
    onClose: () => void;
    onPublished?: () => void;
}

function draftKey(clientId: string, weekStart: string) {
    return `bilan-draft:${clientId}:${weekStart}`;
}

function shiftWeek(day: string, weeks: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
}

/** Markdown preview good enough for headings and bullets (what the bilan uses). */
function Preview({ markdown }: { markdown: string }) {
    return (
        <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-2">
            {markdown.split("\n").map((line, i) => {
                if (line.startsWith("# ")) return <h3 key={i} className="text-base font-bold text-ink">{line.slice(2)}</h3>;
                if (line.startsWith("## ")) return <h4 key={i} className="pt-2 text-sm font-semibold text-ink">{line.slice(3)}</h4>;
                if (line.startsWith("- ")) return <p key={i} className="pl-3">• {line.slice(2)}</p>;
                if (!line.trim()) return <div key={i} className="h-1" />;
                return <p key={i}>{line}</p>;
            })}
        </div>
    );
}

/**
 * « Bilan de la semaine » — the Friday client review (Valentin). Generated
 * from the week's figures, reread by the manager (mandatory tick), then
 * published as a « Reporting » session on the client portal.
 */
export function WeeklyBilanModal({ clientId, clientName, initialWeekStart, isOpen, onClose, onPublished }: WeeklyBilanModalProps) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const [weekStart, setWeekStart] = useState<string | null>(initialWeekStart ?? null);
    const [draft, setDraft] = useState<BilanDraft | null>(null);
    const [markdown, setMarkdown] = useState("");
    const [mode, setMode] = useState<"edit" | "preview">("edit");
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const [sendEmail, setSendEmail] = useState(false);
    const [publishing, setPublishing] = useState(false);

    async function generate(start: string | null, withAi = true) {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/clients/${clientId}/weekly-bilan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weekStart: start ?? undefined, withAi }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Génération impossible");
            const data = json.data as BilanDraft;
            setDraft(data);
            setWeekStart(data.week.start);
            let saved: string | null = null;
            try {
                saved = localStorage.getItem(draftKey(clientId, data.week.start));
            } catch {
                /* storage unavailable */
            }
            setMarkdown(saved ?? data.markdown);
            setChecked(false);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Génération impossible");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (isOpen) void generate(initialWeekStart ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, clientId, initialWeekStart]);

    // Keep the manager's edits if the modal closes before publishing.
    useEffect(() => {
        if (!draft) return;
        const t = window.setTimeout(() => {
            try {
                if (markdown !== draft.markdown) localStorage.setItem(draftKey(clientId, draft.week.start), markdown);
            } catch {
                /* storage unavailable */
            }
        }, 500);
        return () => window.clearTimeout(t);
    }, [markdown, draft, clientId]);

    const kpis = useMemo(() => {
        if (!draft) return [];
        const s = draft.stats;
        return [
            { label: "Appels", value: s.calls },
            { label: "Conversations", value: s.conversations },
            { label: "RDV", value: s.meetings },
            { label: "Prospects", value: s.prospects },
        ];
    }, [draft]);

    async function publish() {
        if (!draft) return;
        setPublishing(true);
        try {
            const res = await fetch(`/api/clients/${clientId}/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "Reporting",
                    date: draft.sessionDate,
                    crMarkdown: markdown,
                    summaryEmail: draft.email,
                    notifyByEmail: sendEmail,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Publication impossible");
            try {
                localStorage.removeItem(draftKey(clientId, draft.week.start));
            } catch {
                /* storage unavailable */
            }
            success("Bilan publié sur l'espace client", clientName);
            queryClient.invalidateQueries({ queryKey: ["client-sessions", clientId] });
            queryClient.invalidateQueries({ queryKey: ["manager-home-today"] });
            onPublished?.();
            onClose();
        } catch (err) {
            showError("Publication impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setPublishing(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" title={`Bilan de la semaine — ${clientName}`} description={draft?.week.label}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={loading || !weekStart} onClick={() => generate(shiftWeek(weekStart!, -1))}>
                            Semaine précédente
                        </Button>
                        <Button size="sm" variant="secondary" disabled={loading || !weekStart} onClick={() => generate(shiftWeek(weekStart!, 1))}>
                            Semaine suivante
                        </Button>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
                        disabled={loading}
                        onClick={() => {
                            try {
                                if (weekStart) localStorage.removeItem(draftKey(clientId, weekStart));
                            } catch {
                                /* storage unavailable */
                            }
                            void generate(weekStart);
                        }}
                    >
                        Régénérer
                    </Button>
                </div>

                {loading && <p className="text-sm text-ink-3">Préparation du bilan : chiffres de la semaine puis synthèse IA…</p>}
                {loadError && <Callout tone="danger" title="Impossible de préparer le bilan">{loadError}</Callout>}

                {draft && !loading && (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {kpis.map((k) => (
                                <div key={k.label} className="rounded-xl border border-line bg-surface p-3">
                                    <p className="text-xs text-ink-3">{k.label}</p>
                                    <p className="text-lg font-bold tabular-nums text-ink">{k.value.toLocaleString("fr-FR")}</p>
                                </div>
                            ))}
                        </div>

                        {draft.existingReportingSessionId && (
                            <Callout tone="warning">Un bilan a déjà été publié pour cette semaine.</Callout>
                        )}
                        {draft.ai.status === "failed" && (
                            <Callout tone="warning" title={`Synthèse IA indisponible : ${draft.ai.error ?? "erreur"}`}>
                                Les chiffres et les RDV sont prêts ; complétez les sections « À rédiger ».
                            </Callout>
                        )}
                        {draft.unverifiedNumbers.length > 0 && (
                            <Callout tone="warning" title={`Chiffres à vérifier : ${draft.unverifiedNumbers.join(", ")}`}>
                                Ils figurent dans le texte de l&apos;IA mais pas dans les statistiques de la semaine.
                            </Callout>
                        )}

                        <SegmentedControl<"edit" | "preview">
                            options={[
                                { value: "edit", label: "Modifier", icon: Pencil },
                                { value: "preview", label: "Aperçu", icon: Eye },
                            ]}
                            value={mode}
                            onChange={setMode}
                            ariaLabel="Mode d'affichage du bilan"
                            size="sm"
                        />
                        {mode === "edit" ? (
                            <Textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={18} className="font-mono text-[13px]" />
                        ) : (
                            <Preview markdown={markdown} />
                        )}

                        <div className="space-y-2">
                            <Checkbox
                                checked={checked}
                                onChange={(e) => setChecked(e.target.checked)}
                                label="J'ai relu et vérifié le bilan"
                            />
                            <Checkbox
                                checked={sendEmail}
                                disabled={!draft.clientEmail}
                                onChange={(e) => setSendEmail(e.target.checked)}
                                label={draft.clientEmail ? `Envoyer aussi par e-mail à ${draft.clientEmail}` : "Envoi par e-mail : aucune adresse sur la fiche client"}
                            />
                        </div>
                    </>
                )}
            </div>

            <ModalFooter>
                <Button
                    variant="ghost"
                    leftIcon={<Copy className="h-4 w-4" aria-hidden />}
                    disabled={!draft}
                    onClick={async () => {
                        if (!draft) return;
                        try {
                            await navigator.clipboard.writeText(draft.email);
                            success("E-mail copié");
                        } catch {
                            showError("Copie impossible");
                        }
                    }}
                >
                    Copier l&apos;e-mail
                </Button>
                <Button variant="primary" disabled={!draft || !checked || !markdown.trim()} isLoading={publishing} onClick={publish}>
                    Publier sur l&apos;espace client
                </Button>
            </ModalFooter>
        </Modal>
    );
}
