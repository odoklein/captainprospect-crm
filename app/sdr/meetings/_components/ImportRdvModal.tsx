"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, X, ChevronRight, ChevronLeft, Check, AlertCircle, Video, MapPin } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

interface RdvImportMappings {
  dateColumn: string;
  statusColumn?: string;
  contactEmailColumn?: string;
  companyNameColumn?: string;
  firstNameColumn?: string;
  lastNameColumn?: string;
  meetingTypeColumn?: string;
  meetingCategoryColumn?: string;
  noteColumn?: string;
  meetingAddressColumn?: string;
  meetingJoinUrlColumn?: string;
  meetingPhoneColumn?: string;
  campaignColumn?: string;
  mobileColumn?: string;
  functionColumn?: string;
}

interface Mission {
  id: string;
  name: string;
  client?: { name: string };
  lists: { id: string; name: string }[];
}

interface ImportResult {
  created: number;
  skipped: number;
  totalRows: number;
  errors: { row: number; message: string }[];
}

interface SdrImportRdvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(firstLine: string): string {
  const delimiters = [",", ";", "\t", "|"];
  let maxCount = 0;
  let detected = ",";
  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }
  return detected;
}

const MAPPING_FIELDS = [
  { key: "dateColumn" as const, label: "Date/Heure RDV *", required: true, description: "Date du rendez-vous (ex: 20/03/26 12:30)" },
  { key: "statusColumn" as const, label: "Statut RDV", required: false, description: "Statut (Planifié, Réalisé, Absent, Annulé...)" },
  { key: "companyNameColumn" as const, label: "Raison Sociale", required: false, description: "Nom de la société" },
  { key: "contactEmailColumn" as const, label: "Email", required: false, description: "Email du contact" },
  { key: "firstNameColumn" as const, label: "Prénom", required: false, description: "Prénom du contact (pour info)" },
  { key: "lastNameColumn" as const, label: "Nom", required: false, description: "Nom du contact (pour info)" },
  { key: "functionColumn" as const, label: "Fonction", required: false, description: "Fonction du contact" },
  { key: "mobileColumn" as const, label: "Mobile", required: false, description: "Numéro de mobile" },
  { key: "meetingJoinUrlColumn" as const, label: "Lieu/Lien RDV", required: false, description: "Lien visio ou adresse" },
  { key: "campaignColumn" as const, label: "Nom Campagne", required: false, description: "Nom de la campagne" },
  { key: "meetingTypeColumn" as const, label: "Type RDV", required: false, description: "VISIO, PHYSIQUE ou TÉLÉPHONIQUE" },
  { key: "meetingCategoryColumn" as const, label: "Catégorie", required: false, description: "EXPLORATOIRE ou BESOIN" },
  { key: "noteColumn" as const, label: "Note", required: false, description: "Notes additionnelles" },
];

export function SdrImportRdvModal({ isOpen, onClose, onSuccess }: SdrImportRdvModalProps) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [listId, setListId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<RdvImportMappings>({ dateColumn: "" });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch("/api/sdr/missions");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMissions(json.data as Mission[]);
      }
    } catch {
      setError("Erreur lors du chargement des missions");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMissions();
      setStep(1);
      setMissionId("");
      setListId("");
      setFile(null);
      setCsvHeaders([]);
      setPreviewRows([]);
      setMappings({ dateColumn: "" });
      setResult(null);
      setError(null);
    }
  }, [isOpen, fetchMissions]);

  const mission = missions.find((m) => m.id === missionId);
  const lists = mission?.lists ?? [];

  useEffect(() => {
    setListId("");
  }, [missionId]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string) || "";
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setCsvHeaders([]);
        setPreviewRows([]);
        setError("Le fichier doit contenir au moins une ligne d'en-tête et une ligne de données");
        return;
      }
      const delimiter = detectDelimiter(lines[0]);
      const headers = parseCSVLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, ""));
      setCsvHeaders(headers);
      
      const rows: Record<string, string>[] = [];
      for (let i = 1; i < Math.min(6, lines.length); i++) {
        const values = parseCSVLine(lines[i], delimiter).map((v) => v.replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, j) => {
          row[h] = values[j] ?? "";
        });
        rows.push(row);
      }
      setPreviewRows(rows);
      
      // Auto-detect common columns
      setMappings({
        dateColumn: headers.find((h) => /date|heure|rdv|rendez/i.test(h)) || headers[0] || "",
        statusColumn: headers.find((h) => /statut|status/i.test(h)),
        contactEmailColumn: headers.find((h) => /email|mail/i.test(h)),
        companyNameColumn: headers.find((h) => /raison|société|company|entreprise|nom/i.test(h)),
        firstNameColumn: headers.find((h) => /prénom|firstname|first.name/i.test(h)),
        lastNameColumn: headers.find((h) => /nom(?!.*campagne|.*société)|lastname|last.name/i.test(h)),
        functionColumn: headers.find((h) => /fonction|title|poste|role/i.test(h)),
        mobileColumn: headers.find((h) => /mobile|portable|tél.*mobile/i.test(h)),
        meetingJoinUrlColumn: headers.find((h) => /lieu|lien|visio|adresse|url|meet/i.test(h)),
        campaignColumn: headers.find((h) => /campagne|mission/i.test(h)),
        meetingTypeColumn: headers.find((h) => /type|format/i.test(h)),
        meetingCategoryColumn: headers.find((h) => /catégorie|category/i.test(h)),
        noteColumn: headers.find((h) => /note|commentaire|comment/i.test(h)),
      });
    };
    reader.readAsText(f, "UTF-8");
  };

  const canGoMapping = missionId && file && csvHeaders.length > 0;
  const canImport = mappings.dateColumn && (mappings.contactEmailColumn || mappings.companyNameColumn);

  const handleImport = async () => {
    if (!canImport || !file || !missionId) return;
    setUploading(true);
    setResult(null);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("missionId", missionId);
      if (listId) formData.append("listId", listId);
      formData.append("mappings", JSON.stringify(mappings));
      
      const res = await fetch("/api/sdr/meetings/import", {
        method: "POST",
        body: formData,
      });
      
      const json = await res.json().catch(() => ({}));
      if (json.success && json.data) {
        setResult(json.data);
        if (json.data.created > 0) onSuccess();
      } else {
        setError(json.error || "Erreur lors de l'import");
      }
    } catch {
      setError("Erreur réseau lors de l'import");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importer des RDV depuis un fichier" size="xl">
      <div className="space-y-6">
        {/* Progress Steps */}
        {!result && (
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                    step === s ? "bg-primary-600 text-white" : step > s ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                  )}
                >
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                <span className={cn("text-sm", step >= s ? "text-slate-900" : "text-slate-500")}>
                  {s === 1 ? "Fichier & Mission" : s === 2 ? "Mapping" : "Confirmation"}
                </span>
                {s < 3 && <div className="w-8 h-px bg-slate-200 mx-1" />}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-900 mb-1">Import terminé</h3>
              <p className="text-emerald-700">
                <strong>{result.created}</strong> RDV créé(s) sur <strong>{result.totalRows}</strong> ligne(s)
                {result.skipped > 0 && ` (${result.skipped} ignoré(s))`}
              </p>
            </div>

            {result.errors.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-sm font-medium text-slate-700">Erreurs ({result.errors.length})</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <div key={i} className="px-4 py-2 text-sm text-red-600 border-b border-slate-100 last:border-0">
                      Ligne {e.row}: {e.message}
                    </div>
                  ))}
                  {result.errors.length > 20 && (
                    <div className="px-4 py-2 text-sm text-slate-500">
                      … et {result.errors.length - 20} autre(s) erreur(s)
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose} variant="primary">
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Mission <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-primary-300 focus:ring-4 focus:ring-primary-100 outline-none"
                    value={missionId}
                    onChange={(e) => setMissionId(e.target.value)}
                  >
                    <option value="">Sélectionner une mission</option>
                    {missions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.client ? `(${m.client.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Liste (optionnel)
                  </label>
                  <select
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-primary-300 focus:ring-4 focus:ring-primary-100 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    disabled={!missionId || lists.length === 0}
                  >
                    <option value="">Toutes les listes de la mission</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Fichier CSV ou Excel <span className="text-red-500">*</span>
                  </label>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-6 text-center transition-colors",
                      file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-primary-300 hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.txt"
                      className="hidden"
                      id="rdv-import-file"
                      onChange={onFileChange}
                    />
                    <label htmlFor="rdv-import-file" className="cursor-pointer block">
                      {file ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                          <div className="text-left">
                            <p className="font-medium text-slate-900">{file.name}</p>
                            <p className="text-sm text-slate-500">{csvHeaders.length} colonnes détectées</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-10 h-10 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-700">Cliquez pour sélectionner un fichier</p>
                            <p className="text-sm text-slate-500">CSV, Excel (.xlsx, .xls)</p>
                          </div>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    disabled={!canGoMapping}
                    onClick={() => setStep(2)}
                    className="gap-2"
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-primary-50 border border-primary-100 rounded-lg p-4">
                  <p className="text-sm text-primary-800">
                    Associez les colonnes du fichier aux champs RDV. Au moins une colonne permettant 
                    d'identifier le contact (Email ou Société) est requise.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                  {MAPPING_FIELDS.map(({ key, label, required, description }) => (
                    <div key={key} className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <select
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none"
                        value={mappings[key] ?? ""}
                        onChange={(e) => setMappings((m) => ({ ...m, [key]: e.target.value || undefined }))}
                      >
                        <option value="">— Non mappé —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      {description && <p className="text-xs text-slate-500">{description}</p>}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Retour
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!canImport}
                    onClick={() => setStep(3)}
                    className="gap-2"
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 mb-2">Aperçu des données ({previewRows.length} premières lignes)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Date</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Société/Contact</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Type</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-600">Statut importé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 px-3 text-slate-900">{row[mappings.dateColumn] || "—"}</td>
                            <td className="py-2 px-3 text-slate-900">
                              {row[mappings.companyNameColumn ?? ""] || row[mappings.contactEmailColumn ?? ""] || "—"}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              <span className="inline-flex items-center gap-1.5">
                                {row[mappings.meetingJoinUrlColumn ?? ""] ? <Video className="h-3.5 w-3.5 shrink-0" /> : <MapPin className="h-3.5 w-3.5 shrink-0" />}
                                {row[mappings.meetingJoinUrlColumn ?? ""] ? "Visio" : "Physique"}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                {row[mappings.statusColumn ?? ""] || "Planifié"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(2)} disabled={uploading} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Retour
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!canImport || uploading}
                    onClick={handleImport}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Importer les RDV
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
