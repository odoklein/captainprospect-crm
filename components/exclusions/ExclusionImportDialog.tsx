"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Ban, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Button, Modal, ModalFooter, useToast } from "@/components/ui";
import {
    EXCLUSION_DURATIONS,
    EXCLUSION_REASON_PRESETS,
} from "@/lib/exclusions/constants";
import {
    MAX_IMPORT_ROWS,
    guessColumns,
    prepareImportRows,
    summarizeImport,
    type ImportField,
    type ImportRowInput,
} from "@/lib/exclusions/import";
import { cn } from "@/lib/utils";

interface ParsedFile {
    fileName: string;
    headers: string[];
    records: Record<string, string>[];
}

interface ImportSummary {
    total: number;
    created: number;
    duplicates: number;
    rejected: number;
    appliedCompanies: number;
    appliedContacts: number;
}

const FIELD_LABELS: Record<ImportField, string> = {
    companyName: "Société",
    website: "Site web",
    phone: "Téléphone / standard",
};

const NONE = "";

/** Excel on French Windows saves CSV as windows-1252; reading it as UTF-8 would mangle every accent. */
function decodeCsv(buffer: ArrayBuffer): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder("windows-1252").decode(buffer);
    }
}

function downloadTemplate() {
    const csv = "﻿Société;Site web;Téléphone\r\nBRAND TO DESIGN;brandtodesign.fr;01 23 45 67 89\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele-blacklist.csv";
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * "Importer une liste": send a whole blacklist at once instead of one company at
 * a time. The same dialog serves the manager console (which also picks the
 * client) and the client portal (whose route forces its own client).
 */
export function ExclusionImportDialog({
    isOpen,
    onClose,
    onImported,
    endpoint,
    withClientPicker = false,
}: {
    isOpen: boolean;
    onClose: () => void;
    onImported: () => void;
    endpoint: string;
    withClientPicker?: boolean;
}) {
    const toast = useToast();
    const fileInput = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<ParsedFile | null>(null);
    const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
    const [reason, setReason] = useState("");
    const [duration, setDuration] = useState("permanent");
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
    const [scopeId, setScopeId] = useState("");
    const [isSaving, setSaving] = useState(false);
    const [result, setResult] = useState<ImportSummary | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setFile(null);
        setMapping({});
        setReason("");
        setDuration("permanent");
        setScopeId("");
        setResult(null);

        if (!withClientPicker) return;
        fetch("/api/clients?limit=200")
            .then((r) => r.json())
            .then((json) => setClients(json.success ? json.data ?? [] : []))
            .catch(() => setClients([]));
    }, [isOpen, withClientPicker]);

    const loadFile = async (picked: File) => {
        try {
            const text = decodeCsv(await picked.arrayBuffer());
            const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
            const headers = (parsed.meta.fields ?? []).filter((h) => h.trim() !== "");
            if (headers.length === 0 || parsed.data.length === 0) {
                toast.error("Fichier vide", "Aucune ligne trouvée dans ce fichier.");
                return;
            }
            setFile({ fileName: picked.name, headers, records: parsed.data });
            setMapping(guessColumns(headers));
        } catch {
            toast.error("Lecture impossible", "Ce fichier n'a pas pu être lu. Enregistrez-le en CSV et réessayez.");
        }
    };

    const rows: ImportRowInput[] = useMemo(() => {
        if (!file) return [];
        const read = (record: Record<string, string>, field: ImportField) => {
            const column = mapping[field];
            return column ? record[column] ?? null : null;
        };
        return file.records.map((record) => ({
            companyName: read(record, "companyName"),
            website: read(record, "website"),
            phone: read(record, "phone"),
        }));
    }, [file, mapping]);

    // A first estimate. The server has the last word: it also knows which of
    // these are already in the blacklist.
    const estimate = useMemo(() => summarizeImport(prepareImportRows(rows)), [rows]);

    const tooMany = rows.length > MAX_IMPORT_ROWS;
    const canSubmit = !!file && estimate.created > 0 && !tooMany && reason.trim().length >= 3 && !isSaving;

    const submit = async () => {
        if (!file) return;
        setSaving(true);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(withClientPicker
                        ? // No client picked means every client — the legal-grade level.
                          { scope: scopeId ? "CLIENT" : "GLOBAL", scopeId: scopeId || undefined }
                        : {}),
                    fileName: file.fileName,
                    reason,
                    duration,
                    rows,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Import impossible");
            setResult(json.data);
            onImported();
        } catch (err) {
            toast.error("Import impossible", err instanceof Error ? err.message : undefined);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Importer une liste"
            description="Envoyez un fichier CSV de sociétés à ne plus contacter. Chaque ligne devient une règle, y compris pour les sociétés pas encore dans la base."
            size="lg"
        >
            {result ? (
                <ImportResult result={result} />
            ) : (
                <div className="space-y-4">
                    {!file ? (
                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={() => fileInput.current?.click()}
                                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-slate-600 hover:border-primary-300 hover:bg-primary-50/40"
                            >
                                <Upload className="w-6 h-6" />
                                <span className="text-sm font-semibold">Choisir un fichier CSV</span>
                                <span className="text-xs text-slate-500">
                                    Colonnes reconnues : société, site web, téléphone · {MAX_IMPORT_ROWS.toLocaleString("fr-FR")} lignes maximum
                                </span>
                            </button>
                            <input
                                ref={fileInput}
                                type="file"
                                accept=".csv,.txt,text/csv"
                                className="hidden"
                                onChange={(e) => {
                                    const picked = e.target.files?.[0];
                                    if (picked) void loadFile(picked);
                                    e.target.value = "";
                                }}
                            />
                            <button
                                type="button"
                                onClick={downloadTemplate}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Télécharger un modèle
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex min-w-0 items-center gap-2">
                                    <FileSpreadsheet className="w-4 h-4 shrink-0 text-slate-500" />
                                    <span className="truncate text-sm font-medium text-slate-800">{file.fileName}</span>
                                    <Badge variant="outline">{rows.length.toLocaleString("fr-FR")} lignes</Badge>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
                                >
                                    Changer de fichier
                                </button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                {(Object.keys(FIELD_LABELS) as ImportField[]).map((field) => (
                                    <div key={field}>
                                        <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                                            {FIELD_LABELS[field]}
                                        </label>
                                        <select
                                            value={mapping[field] ?? NONE}
                                            onChange={(e) =>
                                                setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))
                                            }
                                            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-primary-300"
                                        >
                                            <option value={NONE}>— Ignorer —</option>
                                            {file.headers.map((header) => (
                                                <option key={header} value={header}>
                                                    {header}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            <p
                                className={cn(
                                    "rounded-lg px-3 py-2 text-sm",
                                    tooMany || estimate.created === 0
                                        ? "bg-red-50 text-red-700"
                                        : "bg-emerald-50 text-emerald-800"
                                )}
                            >
                                {tooMany
                                    ? `Trop de lignes : ${MAX_IMPORT_ROWS.toLocaleString("fr-FR")} maximum par import.`
                                    : estimate.created === 0
                                      ? "Aucune ligne exploitable avec ce choix de colonnes."
                                      : `${estimate.created.toLocaleString("fr-FR")} société(s) à ajouter` +
                                        (estimate.duplicates > 0
                                            ? ` · ${estimate.duplicates.toLocaleString("fr-FR")} doublon(s) ignoré(s)`
                                            : "") +
                                        (estimate.rejected > 0
                                            ? ` · ${estimate.rejected.toLocaleString("fr-FR")} ligne(s) inexploitable(s)`
                                            : "")}
                            </p>

                            {withClientPicker && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">Périmètre</label>
                                    <select
                                        value={scopeId}
                                        onChange={(e) => setScopeId(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-primary-300"
                                    >
                                        <option value="">Toutes les missions (tous clients)</option>
                                        {clients.map((client) => (
                                            <option key={client.id} value={client.id}>
                                                {client.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                                    Motif <span className="text-red-500">*</span>
                                </label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {EXCLUSION_REASON_PRESETS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setReason(preset)}
                                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary-300"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Durée</label>
                                <div className="flex flex-wrap gap-2">
                                    {EXCLUSION_DURATIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setDuration(option.value)}
                                            className={cn(
                                                "rounded-lg border px-3 py-1.5 text-sm",
                                                duration === option.value
                                                    ? "border-primary-400 bg-primary-50 text-primary-700 font-medium"
                                                    : "border-slate-200 text-slate-600"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <ModalFooter>
                {result ? (
                    <Button onClick={onClose}>Fermer</Button>
                ) : (
                    <>
                        <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                            Annuler
                        </Button>
                        <Button variant="danger" onClick={submit} isLoading={isSaving} disabled={!canSubmit}>
                            <Ban className="w-4 h-4" />
                            Importer {estimate.created > 0 ? estimate.created.toLocaleString("fr-FR") : ""} société(s)
                        </Button>
                    </>
                )}
            </ModalFooter>
        </Modal>
    );
}

function ImportResult({ result }: { result: ImportSummary }) {
    return (
        <div className="space-y-3">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                {result.created.toLocaleString("fr-FR")} société(s) ajoutée(s) à la blacklist.
            </p>
            <ul className="space-y-1 text-sm text-slate-700">
                <li>
                    <strong>{result.appliedCompanies.toLocaleString("fr-FR")}</strong> société(s) et{" "}
                    <strong>{result.appliedContacts.toLocaleString("fr-FR")}</strong> contact(s) déjà présents dans la base
                    ont été retirés de la prospection.
                </li>
                {result.duplicates > 0 && (
                    <li>{result.duplicates.toLocaleString("fr-FR")} doublon(s) ignoré(s).</li>
                )}
                {result.rejected > 0 && (
                    <li>{result.rejected.toLocaleString("fr-FR")} ligne(s) inexploitable(s) : ni nom, ni site, ni téléphone.</li>
                )}
            </ul>
            <p className="text-xs text-slate-500">
                Le fichier est conservé dans l&apos;historique des imports, avec le résultat de chaque ligne.
            </p>
        </div>
    );
}
