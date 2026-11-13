"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, FileSpreadsheet } from "lucide-react";
import { Badge, Button, Card, LoadingState, Modal, ModalFooter, useToast } from "@/components/ui";
import { EXCLUSION_DURATIONS, IMPORT_ROW_STATUS_LABELS } from "@/lib/exclusions/constants";
import type { ImportRowStatus } from "@/lib/exclusions/import";
import { cn } from "@/lib/utils";

interface ImportRecord {
    id: string;
    fileName: string | null;
    scopeName?: string | null;
    reason: string;
    duration: string;
    totalRows: number;
    createdCount: number;
    duplicateCount: number;
    rejectedCount: number;
    appliedCompanies: number;
    appliedContacts: number;
    createdByName?: string | null;
    createdAt: string;
}

interface StoredRow {
    line: number;
    companyName: string | null;
    website: string | null;
    phone: string | null;
    status: ImportRowStatus;
}

interface StoredImport {
    id: string;
    fileName: string | null;
    createdAt: string;
    rows: StoredRow[];
}

const STATUS_TONE: Record<ImportRowStatus, string> = {
    CREATED: "text-emerald-700",
    DUPLICATE_IN_FILE: "text-slate-500",
    ALREADY_EXCLUDED: "text-slate-500",
    UNUSABLE: "text-red-600",
};

function csvCell(value: string | number | null): string {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadStored(stored: StoredImport) {
    const header = ["Ligne", "Société", "Site web", "Téléphone", "Résultat"].map(csvCell).join(";");
    const lines = stored.rows.map((row) =>
        [row.line, row.companyName, row.website, row.phone, IMPORT_ROW_STATUS_LABELS[row.status]].map(csvCell).join(";")
    );
    const csv = "﻿" + [header, ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `blacklist-${(stored.fileName ?? stored.id).replace(/\.[a-z]+$/i, "").replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Every blacklist file ever uploaded, kept so it can be read back: who sent it,
 * when, why, and what happened to each line.
 */
export function ExclusionImportHistory({
    endpoint,
    refreshKey = 0,
    showScope = false,
}: {
    endpoint: string;
    refreshKey?: number;
    showScope?: boolean;
}) {
    const toast = useToast();
    const [imports, setImports] = useState<ImportRecord[] | null>(null);
    const [opened, setOpened] = useState<StoredImport | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(endpoint);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Chargement impossible");
            setImports(json.data);
        } catch {
            // The history is secondary: if it cannot load, the page is still usable.
            setImports([]);
        }
    }, [endpoint]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const open = async (id: string) => {
        setOpeningId(id);
        try {
            const res = await fetch(`${endpoint}/${id}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Lecture impossible");
            setOpened(json.data);
        } catch (err) {
            toast.error("Lecture impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setOpeningId(null);
        }
    };

    if (imports === null) return <LoadingState />;
    if (imports.length === 0) return null;

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Listes importées ({imports.length})
            </h2>

            {imports.map((item) => (
                <Card key={item.id} className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <FileSpreadsheet className="w-4 h-4 shrink-0 text-slate-400" />
                                <span className="font-semibold text-slate-900 break-words">
                                    {item.fileName ?? "Liste importée"}
                                </span>
                                <Badge variant="outline">
                                    {EXCLUSION_DURATIONS.find((d) => d.value === item.duration)?.label ?? item.duration}
                                </Badge>
                                {showScope && (
                                    <Badge variant="outline">{item.scopeName ?? "Tous les clients"}</Badge>
                                )}
                            </div>
                            <p className="mt-1.5 text-sm text-slate-700 break-words">{item.reason}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                {item.createdByName ? `${item.createdByName} · ` : ""}
                                {format(new Date(item.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })} ·{" "}
                                {item.createdCount} ajoutée(s) sur {item.totalRows}
                                {item.duplicateCount > 0 ? ` · ${item.duplicateCount} doublon(s)` : ""}
                                {item.rejectedCount > 0 ? ` · ${item.rejectedCount} inexploitable(s)` : ""}
                                {item.appliedCompanies > 0 ? ` · ${item.appliedCompanies} déjà dans la base` : ""}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => open(item.id)}
                            isLoading={openingId === item.id}
                            className="shrink-0"
                        >
                            Voir la liste
                        </Button>
                    </div>
                </Card>
            ))}

            <Modal
                isOpen={!!opened}
                onClose={() => setOpened(null)}
                title={opened?.fileName ?? "Liste importée"}
                description={
                    opened
                        ? `Importée le ${format(new Date(opened.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}`
                        : undefined
                }
                size="xl"
            >
                {opened && (
                    <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Société</th>
                                    <th className="px-3 py-2">Site web</th>
                                    <th className="px-3 py-2">Téléphone</th>
                                    <th className="px-3 py-2">Résultat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {opened.rows.map((row) => (
                                    <tr key={row.line}>
                                        <td className="px-3 py-1.5 text-slate-400">{row.line}</td>
                                        <td className="px-3 py-1.5 text-slate-900 break-words">{row.companyName ?? "—"}</td>
                                        <td className="px-3 py-1.5 text-slate-600 break-all">{row.website ?? "—"}</td>
                                        <td className="px-3 py-1.5 text-slate-600">{row.phone ?? "—"}</td>
                                        <td className={cn("px-3 py-1.5 font-medium", STATUS_TONE[row.status])}>
                                            {IMPORT_ROW_STATUS_LABELS[row.status]}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setOpened(null)}>
                        Fermer
                    </Button>
                    {opened && (
                        <Button variant="outline" onClick={() => downloadStored(opened)}>
                            <Download className="w-4 h-4" />
                            Télécharger
                        </Button>
                    )}
                </ModalFooter>
            </Modal>
        </section>
    );
}
