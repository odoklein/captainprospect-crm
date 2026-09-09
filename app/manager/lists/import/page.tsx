"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Select, FileUpload, useToast, Modal, ConfirmModal, Input, Badge, Tooltip, RadioCardGroup, StatCard } from "@/components/ui";
import type { RadioCardOption } from "@/components/ui";
import {
    ArrowLeft,
    ArrowRight,
    Upload,
    Check,
    Loader2,
    FileText,
    AlertCircle,
    CheckCircle2,
    Table,
    Building2,
    User,
    XCircle,
    Sparkles,
    Search,
    RotateCcw,
    Save,
    ChevronDown,
    ChevronRight,
    Info,
    TrendingUp,
    Database,
    Mail,
    Phone,
    Globe,
    MapPin,
    Briefcase,
    Users,
    Calendar,
    History,
    SkipForward,
    RefreshCw,
    Archive,
    Layers,
    ListChecks,
    PhoneCall,
    PlusCircle,
} from "lucide-react";
import Link from "next/link";
import { ACTION_RESULT_LABELS } from "@/lib/types";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
}

interface SdrOption {
    id: string;
    name: string;
    role: string;
}

interface ListOption {
    id: string;
    name: string;
    missionId: string;
}

/** Duplicate-handling scenarios shown as cards in step 1. */
type DuplicateScenario = "smart_merge" | "skip" | "overwrite" | "clean_replace";

interface SimulationMatch {
    csvName: string;
    matchedCompanyId: string;
    listName: string | null;
    crossList: boolean;
    alreadyWorked: boolean;
}

interface SimulationResult {
    newCompanies: number;
    existingCompanies: number;
    alreadyWorked: number;
    sampleMatches: SimulationMatch[];
}

interface ColumnMapping {
    csvColumn: string;
    targetField: string;
    confidence?: number;
    autoDetected?: boolean;
}

interface ColumnStats {
    column: string;
    totalRows: number;
    filledRows: number;
    uniqueValues: number;
    dataType: 'text' | 'email' | 'phone' | 'url' | 'number' | 'date';
    sampleValues: string[];
}

interface StatusMapping {
    csvValue: string;
    actionResult: string;
    count: number;
}

interface ChannelMapping {
    csvValue: string;
    channel: 'CALL' | 'EMAIL' | 'LINKEDIN';
    count: number;
}

interface ActionColumnMapping {
    statusColumn: string;
    dateColumn: string;
    callbackDateColumn: string;
    noteColumn: string;
    channelColumn: string;
}

interface ActionColumnGroup {
    id: string;
    statusColumn: string;
    dateColumn: string;
    noteColumn: string;
    channelColumn: string;
    callbackDateColumn: string;
}

interface PreviewRow {
    [key: string]: string;
}

// Keep each request payload below typical serverless limits (e.g. Vercel 413).
const IMPORT_CHUNK_THRESHOLD_BYTES = 4 * 1024 * 1024;
const IMPORT_CHUNK_TARGET_BYTES = 3.5 * 1024 * 1024;

function splitMultiActionCell(raw: string): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];

    return trimmed
        .split(/(?:\r?\n|;|\||=>|->|→|»)+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function inferDataType(samples: string[]): ColumnStats["dataType"] {
    const nonEmpty = samples.filter((v) => v.trim().length > 0);
    if (nonEmpty.length === 0) return "text";
    const emailCount = nonEmpty.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())).length;
    const urlCount = nonEmpty.filter((v) => /^https?:\/\//i.test(v.trim()) || /^www\./i.test(v.trim())).length;
    const phoneCount = nonEmpty.filter((v) => /^[+()\d\s.-]{8,}$/.test(v.trim())).length;
    const numberCount = nonEmpty.filter((v) => /^-?\d+([.,]\d+)?$/.test(v.trim())).length;
    const dateCount = nonEmpty.filter((v) => /^(\d{1,2}[\/-]\d{1,2}[\/-](\d{2}|\d{4})|\d{4}-\d{1,2}-\d{1,2})/.test(v.trim())).length;
    const n = nonEmpty.length;
    if (emailCount / n > 0.6) return "email";
    if (urlCount / n > 0.6) return "url";
    if (phoneCount / n > 0.6) return "phone";
    if (dateCount / n > 0.6) return "date";
    if (numberCount / n > 0.7) return "number";
    return "text";
}

// ============================================
// FIELD OPTIONS
// ============================================

const COMPANY_FIELDS = [
    { value: "", label: "Ignorer" },
    { value: "company.name", label: "Nom de société *" },
    { value: "company.industry", label: "Industrie" },
    { value: "company.country", label: "Pays" },
    { value: "company.website", label: "Site web" },
    { value: "company.phone", label: "Téléphone société" },
    { value: "company.additionalPhones", label: "Téléphones société (suppl.)" },
    { value: "company.size", label: "Taille" },
    { value: "__custom_company__", label: "➕ Champ personnalisé société..." },
];

const CONTACT_FIELDS = [
    { value: "contact.firstName", label: "Prénom" },
    { value: "contact.lastName", label: "Nom" },
    { value: "contact.email", label: "Email" },
    { value: "contact.phone", label: "Téléphone" },
     { value: "contact.additionalPhones", label: "Téléphones (suppl.)" },
    { value: "contact.title", label: "Fonction" },
    { value: "contact.linkedin", label: "LinkedIn" },
    { value: "__custom_contact__", label: "➕ Champ personnalisé contact..." },
];

const ALL_FIELDS = [...COMPANY_FIELDS, ...CONTACT_FIELDS];

// Count lines in file by streaming (avoids loading full file; used for progress %)
/** Upper bound on company names sent to the simulation endpoint (matches the API cap). */
const SIMULATION_MAX_NAMES = 20000;

async function countFileLines(file: File): Promise<number> {
    const stream = file.stream();
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let count = 0;
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        count += parts.length;
    }
    if (buffer.trim()) count++;
    return Math.max(0, count - 1);
}

function splitCsvIntoChunks(csvText: string, targetBytes: number): string[] {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) return [csvText];

    const header = lines[0];
    const rows = lines.slice(1);
    const encoder = new TextEncoder();
    const chunks: string[] = [];

    let currentRows: string[] = [];
    let currentBytes = encoder.encode(`${header}\n`).length;

    for (const row of rows) {
        const rowBytes = encoder.encode(`${row}\n`).length;
        const wouldExceed = currentRows.length > 0 && currentBytes + rowBytes > targetBytes;
        if (wouldExceed) {
            chunks.push([header, ...currentRows].join("\n"));
            currentRows = [row];
            currentBytes = encoder.encode(`${header}\n${row}\n`).length;
        } else {
            currentRows.push(row);
            currentBytes += rowBytes;
        }
    }

    if (currentRows.length > 0) {
        chunks.push([header, ...currentRows].join("\n"));
    }

    return chunks.length > 0 ? chunks : [csvText];
}

// ============================================
// CSV IMPORT PAGE
// ============================================

export default function ImportListPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [sdrOptions, setSdrOptions] = useState<SdrOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Step 1: File & Mission
    const [file, setFile] = useState<File | null>(null);
    const [importMode, setImportMode] = useState<"new" | "existing">("new");
    const [missionId, setMissionId] = useState("");
    const [listName, setListName] = useState("");
    const [listId, setListId] = useState("");
    const [lists, setLists] = useState<ListOption[]>([]);
    const [whenAlreadyWorkedOn, setWhenAlreadyWorkedOn] = useState<"skip" | "add_anyway">("skip");

    // Step 1: duplicate handling
    const [duplicateScenario, setDuplicateScenario] = useState<DuplicateScenario>("smart_merge");
    const [duplicateScope, setDuplicateScope] = useState<"list" | "mission">("mission");
    const [confirmCleanReplace, setConfirmCleanReplace] = useState(false);

    // Step 4: pre-import simulation (real DB check, see /api/lists/import/simulate)
    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationError, setSimulationError] = useState<string | null>(null);

    // Step 2: Import Type Selection
    const [importType, setImportType] = useState<"companies-only" | "companies-contacts">("companies-contacts");

    // Step 3: Column mapping
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [mappings, setMappings] = useState<ColumnMapping[]>([]);
    const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [columnStats, setColumnStats] = useState<ColumnStats[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['company', 'contact']));
    const [showQualityReport, setShowQualityReport] = useState(false);
    
    // Action history import
    const [importActions, setImportActions] = useState(false);
    const [assignedSdrId, setAssignedSdrId] = useState("");
    const [actionColumnMapping, setActionColumnMapping] = useState<ActionColumnMapping>({
        statusColumn: "",
        dateColumn: "",
        callbackDateColumn: "",
        noteColumn: "",
        channelColumn: "",
    });
    const [actionColumnMode, setActionColumnMode] = useState<"single" | "multi-column">("single");
    const [actionColumnGroups, setActionColumnGroups] = useState<ActionColumnGroup[]>([]);
    const [statusMappings, setStatusMappings] = useState<StatusMapping[]>([]);
    const [detectedStatuses, setDetectedStatuses] = useState<string[]>([]);
    const [detectedChannels, setDetectedChannels] = useState<string[]>([]);
    const [channelMappings, setChannelMappings] = useState<ChannelMapping[]>([]);
    /** Per-column unique values and counts from ALL rows (used for status/channel mapping) */
    const [fullColumnUniqueValues, setFullColumnUniqueValues] = useState<Record<string, { values: string[]; counts: Record<string, number> }>>({});

    // Step 4: Validation
    const [validationResult, setValidationResult] = useState<{
        valid: number;
        errors: string[];
        warnings: string[];
    } | null>(null);

    // Step 5: Import result
    const [importResult, setImportResult] = useState<{
        companies: number;
        companiesUpdated: number;
        companiesSkipped: number;
        contacts: number;
        contactsUpdated: number;
        contactsSkipped: number;
        actions?: number;
        errors: number;
    } | null>(null);

    const [importProgress, setImportProgress] = useState<number | null>(null);

    // Custom field modal state
    const [customFieldPrompt, setCustomFieldPrompt] = useState<{
        index: number;
        type: "company" | "contact";
    } | null>(null);
    const [customFieldValue, setCustomFieldValue] = useState("");

    const mappedCount = mappings.filter(m => m.targetField && m.targetField !== "").length;
    const requiredMapped = mappings.some(m => m.targetField === "company.name");
    const canGoToType = !!file && !!missionId && (importMode === "new" ? !!listName?.trim() : !!listId);
    const mappingCompletion = csvHeaders.length > 0 ? Math.round((mappedCount / csvHeaders.length) * 100) : 0;

    // "Clean replace" is a list-level action (archive + re-import), the other three are
    // row-level strategies the API applies per matched company.
    const replaceList = duplicateScenario === "clean_replace";
    const duplicateStrategy: "smart_merge" | "skip" | "overwrite" =
        duplicateScenario === "clean_replace" ? "smart_merge" : duplicateScenario;

    const duplicateScenarioOptions: RadioCardOption<DuplicateScenario>[] = [
        {
            value: "smart_merge",
            title: "Enrichir & compléter",
            description: "Garde les fiches existantes et remplit uniquement les champs vides (téléphone, site, taille…). Ajoute les nouveaux contacts.",
            icon: Sparkles,
            badge: "Recommandé",
        },
        {
            value: "skip",
            title: "Ignorer les doublons",
            description: "Ne modifie rien aux fiches existantes. Seules les sociétés et contacts inconnus sont créés.",
            icon: SkipForward,
        },
        {
            value: "overwrite",
            title: "Mettre à jour / écraser",
            description: "Remplace les valeurs existantes par celles du CSV. À utiliser pour rafraîchir des coordonnées obsolètes.",
            icon: RefreshCw,
        },
        {
            value: "clean_replace",
            title: "Remplacement propre",
            description: importMode === "existing"
                ? "Archive la liste actuelle (conservée en historique) et importe dans une liste neuve."
                : "Disponible uniquement en ajoutant à une liste existante.",
            icon: Archive,
            disabled: importMode !== "existing",
        },
    ];

    const duplicateScopeOptions: RadioCardOption<"list" | "mission">[] = [
        {
            value: "mission",
            title: "Toute la mission",
            description: "Vérifie si la société existe déjà dans n'importe quelle liste de la mission. Évite qu'un même prospect soit appelé par deux SDR.",
            icon: Layers,
            badge: "Recommandé",
        },
        {
            value: "list",
            title: "Cette liste uniquement",
            description: "Ne vérifie les doublons que dans la liste cible. Les sociétés présentes ailleurs dans la mission seront recréées.",
            icon: ListChecks,
        },
    ];

    const otherMissionListsCount = importMode === "existing"
        ? lists.filter((l) => l.id !== listId).length
        : lists.length;

    const autoMapStatusValues = () => {
        if (statusMappings.length === 0) return;
        const next = statusMappings.map((entry) => {
            const v = entry.csvValue.toLowerCase().trim();
            let actionResult = entry.actionResult;
            if (!actionResult) {
                if (v.includes("pas de réponse") || v.includes("no answer")) actionResult = "NO_ANSWER";
                else if (v.includes("rappel") || v.includes("callback")) actionResult = "CALLBACK_REQUESTED";
                else if (v.includes("rdv") || v.includes("meeting") || v.includes("book")) actionResult = "MEETING_BOOKED";
                else if (v.includes("annul")) actionResult = "MEETING_CANCELLED";
                else if (v.includes("refus") || v.includes("not interested")) actionResult = "NOT_INTERESTED";
                else if (v.includes("wrong") || v.includes("faux numéro")) actionResult = "WRONG_NUMBER";
                else if (v.includes("email sent") || v.includes("email envoyé")) actionResult = "EMAIL_SENT";
            }
            return { ...entry, actionResult };
        });
        setStatusMappings(next);
    };

    const addActionColumnGroup = () => {
        const nextIndex = actionColumnGroups.length + 1;
        setActionColumnGroups((prev) => [
            ...prev,
            {
                id: `call-${Date.now()}-${nextIndex}`,
                statusColumn: "",
                dateColumn: "",
                noteColumn: "",
                channelColumn: "",
                callbackDateColumn: "",
            },
        ]);
    };

    const updateActionColumnGroup = (
        id: string,
        patch: Partial<Omit<ActionColumnGroup, "id">>
    ) => {
        setActionColumnGroups((prev) =>
            prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
        );
    };

    const removeActionColumnGroup = (id: string) => {
        setActionColumnGroups((prev) => prev.filter((g) => g.id !== id));
    };

    const sequencePreviewRows = previewData.slice(0, 3).map((row, idx) => {
        const multiStatuses = actionColumnGroups
            .map((g) => (g.statusColumn ? row[g.statusColumn] || "" : ""))
            .filter((v) => !!v)
            .map((v) => v.trim());
        const statuses =
            actionColumnMode === "multi-column"
                ? multiStatuses
                : actionColumnMapping.statusColumn
                    ? splitMultiActionCell(row[actionColumnMapping.statusColumn] || "")
                    : [];
        const dates =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.dateColumn ? row[g.dateColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.dateColumn
                    ? splitMultiActionCell(row[actionColumnMapping.dateColumn] || "")
                    : [];
        const channels =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.channelColumn ? row[g.channelColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.channelColumn
                    ? splitMultiActionCell(row[actionColumnMapping.channelColumn] || "")
                    : [];
        const notes =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.noteColumn ? row[g.noteColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.noteColumn
                    ? splitMultiActionCell(row[actionColumnMapping.noteColumn] || "")
                    : [];
        const lengths = [statuses.length, dates.length, channels.length, notes.length].filter((n) => n > 0);
        const maxLen = lengths.length > 0 ? Math.max(...lengths) : 0;
        const minLen = lengths.length > 0 ? Math.min(...lengths) : 0;
        return {
            rowNumber: idx + 1,
            statuses,
            dates,
            channels,
            notes,
            actionCount: statuses.length,
            hasPotentialMisalignment: lengths.length > 1 && maxLen !== minLen,
        };
    });

    const isWorkedConflictActive =
        importMode === "existing" && whenAlreadyWorkedOn === "skip" && importActions;

    const statusResultByCsv = new Map(
        statusMappings.map((m) => [m.csvValue.trim().toLowerCase(), m.actionResult])
    );
    const channelByCsv = new Map(
        channelMappings.map((m) => [m.csvValue.trim().toLowerCase(), m.channel])
    );
    const channelLabelByValue: Record<"CALL" | "EMAIL" | "LINKEDIN", string> = {
        CALL: "Appel",
        EMAIL: "Email",
        LINKEDIN: "LinkedIn",
    };
    const channelEmojiByValue: Record<"CALL" | "EMAIL" | "LINKEDIN", string> = {
        CALL: "📞",
        EMAIL: "📧",
        LINKEDIN: "💼",
    };

    const reconstructedActionPreview = previewData.slice(0, 3).map((row, idx) => {
        const companyCol = mappings.find((m) => m.targetField === "company.name")?.csvColumn;
        const companyName = (companyCol ? row[companyCol] : "")?.trim() || `Ligne ${idx + 1}`;
        const statuses =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.statusColumn ? row[g.statusColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.statusColumn
                    ? splitMultiActionCell(row[actionColumnMapping.statusColumn] || "")
                    : [];
        const dates =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.dateColumn ? row[g.dateColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.dateColumn
                    ? splitMultiActionCell(row[actionColumnMapping.dateColumn] || "")
                    : [];
        const channels =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.channelColumn ? row[g.channelColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.channelColumn
                    ? splitMultiActionCell(row[actionColumnMapping.channelColumn] || "")
                    : [];
        const notes =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.noteColumn ? row[g.noteColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.noteColumn
                    ? splitMultiActionCell(row[actionColumnMapping.noteColumn] || "")
                    : [];
        const callbacks =
            actionColumnMode === "multi-column"
                ? actionColumnGroups
                    .map((g) => (g.callbackDateColumn ? row[g.callbackDateColumn] || "" : ""))
                    .filter((v) => !!v)
                    .map((v) => v.trim())
                : actionColumnMapping.callbackDateColumn
                    ? splitMultiActionCell(row[actionColumnMapping.callbackDateColumn] || "")
                    : [];

        const actions = statuses.map((status, actionIdx) => {
            const statusKey = status.trim().toLowerCase();
            const mappedResult = statusResultByCsv.get(statusKey) || "";
            const resultLabel = mappedResult ? ACTION_RESULT_LABELS[mappedResult as keyof typeof ACTION_RESULT_LABELS] : undefined;
            const rawChannel = (channels[actionIdx] ?? channels[0] ?? "").trim().toLowerCase();
            const mappedChannel = (channelByCsv.get(rawChannel) || "CALL") as "CALL" | "EMAIL" | "LINKEDIN";
            return {
                channel: mappedChannel,
                channelLabel: channelLabelByValue[mappedChannel],
                channelEmoji: channelEmojiByValue[mappedChannel],
                date: dates[actionIdx] ?? dates[0] ?? "",
                callbackDate: callbacks[actionIdx] ?? callbacks[0] ?? "",
                sourceStatus: status,
                mappedLabel: resultLabel,
                note: notes[actionIdx] ?? notes[0] ?? "",
            };
        });

        return {
            companyName,
            actionCount: actions.length,
            actions,
        };
    });

    // ============================================
    // FETCH MISSIONS
    // ============================================

    useEffect(() => {
        const fetchMissionsAndSdrs = async () => {
            setIsLoading(true);
            try {
                const [missionsRes, sdrsRes] = await Promise.all([
                    fetch("/api/missions?isActive=true"),
                    fetch("/api/users?role=SDR,BUSINESS_DEVELOPER&status=active&limit=200"),
                ]);
                const [missionsJson, sdrsJson] = await Promise.all([
                    missionsRes.json(),
                    sdrsRes.json(),
                ]);
                if (missionsJson.success) {
                    setMissions(missionsJson.data);
                }
                if (sdrsJson.success) {
                    const users = Array.isArray(sdrsJson.data?.users) ? sdrsJson.data.users : [];
                    setSdrOptions(users.map((u: { id: string; name: string; role: string }) => ({
                        id: u.id,
                        name: u.name,
                        role: u.role,
                    })));
                }
            } catch (err) {
                console.error("Failed to fetch import references:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMissionsAndSdrs();
    }, []);

    // Fetch the mission's lists — needed both to pick a target list and to tell the user
    // how many other lists mission-scope deduplication will check against.
    useEffect(() => {
        if (!missionId) {
            setLists([]);
            setListId("");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/lists?missionId=${missionId}&limit=200`);
                const json = await res.json();
                if (cancelled || !json.success) return;
                const items = (json.data ?? []) as { id: string; name: string; missionId: string }[];
                setLists(items);
                if (importMode === "existing") {
                    setListId((prev) => (items.some((l) => l.id === prev) ? prev : items[0]?.id ?? ""));
                }
            } catch {
                if (!cancelled) setLists([]);
            }
        })();
        return () => { cancelled = true; };
    }, [importMode, missionId]);

    // Detect unique status values for selected action status columns (single or multi-column mode)
    useEffect(() => {
        const selectedStatusColumns =
            actionColumnMode === "multi-column"
                ? actionColumnGroups.map((g) => g.statusColumn).filter(Boolean)
                : actionColumnMapping.statusColumn
                    ? [actionColumnMapping.statusColumn]
                    : [];
        if (selectedStatusColumns.length === 0) {
            setDetectedStatuses([]);
            setStatusMappings([]);
            return;
        }
        const aggregateCounts: Record<string, number> = {};
        for (const col of selectedStatusColumns) {
            const data = fullColumnUniqueValues[col];
            if (!data) continue;
            for (const csvValue of data.values) {
                aggregateCounts[csvValue] = (aggregateCounts[csvValue] || 0) + (data.counts[csvValue] || 0);
            }
        }
        const values = Object.keys(aggregateCounts).sort();
        setDetectedStatuses(values);
        setStatusMappings((prev) => {
            const prevByValue = new Map(prev.map((m) => [m.csvValue, m.actionResult]));
            return values.map((csvValue) => ({
                csvValue,
                actionResult: prevByValue.get(csvValue) || "",
                count: aggregateCounts[csvValue] || 0,
            }));
        });
    }, [actionColumnMode, actionColumnGroups, actionColumnMapping.statusColumn, fullColumnUniqueValues]);

    // Detect unique channel values for selected action channel columns (single or multi-column mode)
    useEffect(() => {
        const selectedChannelColumns =
            actionColumnMode === "multi-column"
                ? actionColumnGroups.map((g) => g.channelColumn).filter(Boolean)
                : actionColumnMapping.channelColumn
                    ? [actionColumnMapping.channelColumn]
                    : [];
        if (selectedChannelColumns.length === 0) {
            setDetectedChannels([]);
            setChannelMappings([]);
            return;
        }
        const aggregateCounts: Record<string, number> = {};
        for (const col of selectedChannelColumns) {
            const data = fullColumnUniqueValues[col];
            if (!data) continue;
            for (const csvValue of data.values) {
                aggregateCounts[csvValue] = (aggregateCounts[csvValue] || 0) + (data.counts[csvValue] || 0);
            }
        }
        const values = Object.keys(aggregateCounts).sort();
        setDetectedChannels(values);
        setChannelMappings((prev) => {
            const prevByValue = new Map(prev.map((m) => [m.csvValue, m.channel]));
            return values.map((csvValue) => ({
                csvValue,
                channel: prevByValue.get(csvValue) || "CALL",
                count: aggregateCounts[csvValue] || 0,
            }));
        });
    }, [actionColumnMode, actionColumnGroups, actionColumnMapping.channelColumn, fullColumnUniqueValues]);

    // ============================================
    // ADVANCED CSV PARSING
    // ============================================

    const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of field
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add last field
        result.push(current.trim());
        return result;
    };

    const detectDelimiter = (firstLine: string): string => {
        const delimiters = [',', ';', '\t', '|'];
        let maxCount = 0;
        let detectedDelimiter = ',';

        for (const delim of delimiters) {
            const count = (firstLine.match(new RegExp(`\\${delim}`, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                detectedDelimiter = delim;
            }
        }

        return detectedDelimiter;
    };

    const parseCSV = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split(/\r?\n/).filter(line => line.trim());

            if (lines.length < 2) {
                showError("Erreur", "Le fichier CSV doit contenir au moins une ligne d'en-tête et une ligne de données");
                return;
            }

            // Detect delimiter
            const delimiter = detectDelimiter(lines[0]);

            // Parse headers with advanced parsing
            const headers = parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, ''));
            setCsvHeaders(headers);

            // Initialize mappings with auto-detect (FIXED: More specific patterns first)
            const autoMappings = headers.map(header => {
                const lowerHeader = header.toLowerCase();
                let targetField = "";

                // Auto-detect common fields - CHECK SPECIFIC PATTERNS FIRST
                // Company phone (before generic company check)
                if ((lowerHeader.includes("phone") || lowerHeader.includes("téléphone") || lowerHeader.includes("tel")) &&
                    (lowerHeader.includes("company") || lowerHeader.includes("société") || lowerHeader.includes("entreprise"))) {
                    targetField = "company.phone";
                }
                // Company size
                else if (lowerHeader.includes("size") || lowerHeader.includes("taille") ||
                    lowerHeader.includes("employees") || lowerHeader.includes("employés")) {
                    targetField = "company.size";
                }
                // Generic company name (after specific company fields)
                else if (lowerHeader.includes("company") || lowerHeader.includes("société") || lowerHeader.includes("entreprise") || lowerHeader.includes("organization")) {
                    targetField = "company.name";
                }
                else if (lowerHeader.includes("industry") || lowerHeader.includes("secteur") || lowerHeader.includes("industrie")) {
                    targetField = "company.industry";
                }
                else if (lowerHeader.includes("country") || lowerHeader.includes("pays")) {
                    targetField = "company.country";
                }
                else if (lowerHeader.includes("website") || lowerHeader.includes("site") || lowerHeader.includes("url")) {
                    targetField = "company.website";
                }
                // Contact fields
                else if (lowerHeader.includes("firstname") || lowerHeader.includes("prénom") || lowerHeader === "first name" || lowerHeader === "prenom") {
                    targetField = "contact.firstName";
                }
                else if (lowerHeader.includes("lastname") || lowerHeader === "nom" || lowerHeader === "last name" || lowerHeader.includes("surname")) {
                    targetField = "contact.lastName";
                }
                else if (lowerHeader.includes("email") || lowerHeader.includes("mail") || lowerHeader.includes("e-mail")) {
                    targetField = "contact.email";
                }
                else if (lowerHeader.includes("phone") || lowerHeader.includes("téléphone") || lowerHeader.includes("tel") || lowerHeader.includes("mobile")) {
                    targetField = "contact.phone";
                }
                else if (lowerHeader.includes("title") || lowerHeader.includes("fonction") || lowerHeader.includes("poste") || lowerHeader.includes("job")) {
                    targetField = "contact.title";
                }
                else if (lowerHeader.includes("linkedin")) {
                    targetField = "contact.linkedin";
                }

                return { csvColumn: header, targetField };
            });

            setMappings(autoMappings);

            // Parse preview data (first 5 rows) with advanced parsing
            const dataRows = lines.slice(1, 6).map(line => {
                const values = parseCSVLine(line, delimiter).map(v => v.replace(/^"|"$/g, ''));
                const row: PreviewRow = {};
                headers.forEach((header, i) => {
                    row[header] = values[i] || "";
                });
                return row;
            });

            setPreviewData(dataRows);

            // Scan ALL rows to build unique values + counts per column (for status/channel mapping)
            const colUnique: Record<string, { values: string[]; counts: Record<string, number> }> = {};
            headers.forEach(h => { colUnique[h] = { values: [], counts: {} }; });
            for (let r = 1; r < lines.length; r++) {
                const values = parseCSVLine(lines[r], delimiter).map(v => v.replace(/^"|"$/g, '').trim());
                headers.forEach((header, i) => {
                    const rawValue = values[i] || "";
                    if (!rawValue) return;
                    const splitValues = splitMultiActionCell(rawValue);
                    const valuesToCount = splitValues.length > 1 ? splitValues : [rawValue];

                    for (const val of valuesToCount) {
                        const existing = colUnique[header].counts[val];
                        if (existing === undefined) {
                            colUnique[header].values.push(val);
                            colUnique[header].counts[val] = 1;
                        } else {
                            colUnique[header].counts[val]++;
                        }
                    }
                });
            }
            headers.forEach(h => { colUnique[h].values.sort(); });
            setFullColumnUniqueValues(colUnique);

            const stats: ColumnStats[] = headers.map((header, idx) => {
                const allValues = lines
                    .slice(1)
                    .map((line) => parseCSVLine(line, delimiter)[idx]?.replace(/^"|"$/g, "").trim() || "");
                const nonEmpty = allValues.filter((v) => v.length > 0);
                return {
                    column: header,
                    totalRows: lines.length - 1,
                    filledRows: nonEmpty.length,
                    uniqueValues: Object.keys(colUnique[header]?.counts ?? {}).length,
                    dataType: inferDataType(nonEmpty.slice(0, 50)),
                    sampleValues: nonEmpty.slice(0, 3),
                };
            });
            setColumnStats(stats);

            // Set total row count for validation
            setTotalRows(lines.length - 1);

            // Auto-generate list name from file
            if (!listName) {
                const name = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
                setListName(name);
            }
        };
        reader.readAsText(file);
    }, [listName, showError]);

    // ============================================
    // HANDLE FILE SELECTION
    // ============================================

    const handleFileSelected = (files: File[]) => {
        if (files.length > 0) {
            setFile(files[0]);
            parseCSV(files[0]);
        }
    };

    // ============================================
    // VALIDATE DATA
    // ============================================

    const validateData = () => {
        const hasCompanyName = mappings.some(m => m.targetField === "company.name");
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!hasCompanyName) {
            errors.push("Le champ 'Nom de société' est obligatoire");
        }

        // Check for duplicate mappings
        const usedFields = new Map<string, string>();
        for (const mapping of mappings) {
            if (mapping.targetField && mapping.targetField !== "" &&
                !mapping.targetField.startsWith("__custom")) {
                const existing = usedFields.get(mapping.targetField);
                if (existing) {
                    errors.push(`Le champ "${mapping.targetField}" est mappé à la fois par "${existing}" et "${mapping.csvColumn}"`);
                } else {
                    usedFields.set(mapping.targetField, mapping.csvColumn);
                }
            }
        }

        if (importType === "companies-contacts") {
            const hasContact = mappings.some(m => m.targetField.startsWith("contact."));
            if (!hasContact) {
                warnings.push("Aucun champ contact mappé - seules les sociétés seront importées");
            }

            const hasEmail = mappings.some(m => m.targetField === "contact.email");
            if (hasContact && !hasEmail) {
                warnings.push("Pas d'email mappé - les contacts ne pourront pas être enrichis");
            }
        }

        // Check for company phone if companies-only
        if (importType === "companies-only") {
            const hasCompanyPhone = mappings.some(m => m.targetField === "company.phone");
            if (!hasCompanyPhone) {
                warnings.push("Aucun téléphone société mappé - les SDR ne pourront pas appeler directement les sociétés");
            }
        }

        // Validation for action history import: require full mapping of detected statuses
        if (importActions) {
            if (!assignedSdrId) {
                errors.push("Sélectionnez un SDR pour assigner l'historique des prospects déjà travaillés");
            }
            const hasStatusMapping =
                actionColumnMode === "multi-column"
                    ? actionColumnGroups.some((g) => !!g.statusColumn)
                    : !!actionColumnMapping.statusColumn;
            if (!hasStatusMapping) {
                errors.push(
                    actionColumnMode === "multi-column"
                        ? "Vous avez activé l'historique d'actions mais aucun groupe d'appel n'a de colonne de statut"
                        : "Vous avez activé l'historique d'actions mais aucune colonne de statut n'est sélectionnée"
                );
            } else if (statusMappings.length > 0 && statusMappings.some(m => !m.actionResult)) {
                errors.push("Tous les statuts trouvés dans la colonne d'historique doivent être mappés à un résultat CRM");
            }

            const previewMisaligned = previewData.slice(0, 20).some((row) => {
                const statuses =
                    actionColumnMode === "multi-column"
                        ? actionColumnGroups
                            .map((g) => (g.statusColumn ? row[g.statusColumn] || "" : ""))
                            .filter((v) => !!v)
                        : actionColumnMapping.statusColumn
                            ? splitMultiActionCell(row[actionColumnMapping.statusColumn] || "")
                            : [];
                if (statuses.length <= 1) return false;
                const dates =
                    actionColumnMode === "multi-column"
                        ? actionColumnGroups.map((g) => (g.dateColumn ? row[g.dateColumn] || "" : "")).filter((v) => !!v)
                        : actionColumnMapping.dateColumn
                            ? splitMultiActionCell(row[actionColumnMapping.dateColumn] || "")
                            : [];
                const channels =
                    actionColumnMode === "multi-column"
                        ? actionColumnGroups.map((g) => (g.channelColumn ? row[g.channelColumn] || "" : "")).filter((v) => !!v)
                        : actionColumnMapping.channelColumn
                            ? splitMultiActionCell(row[actionColumnMapping.channelColumn] || "")
                            : [];
                const notes =
                    actionColumnMode === "multi-column"
                        ? actionColumnGroups.map((g) => (g.noteColumn ? row[g.noteColumn] || "" : "")).filter((v) => !!v)
                        : actionColumnMapping.noteColumn
                            ? splitMultiActionCell(row[actionColumnMapping.noteColumn] || "")
                            : [];
                const lengths = [statuses.length, dates.length, channels.length, notes.length].filter((n) => n > 1);
                return lengths.some((n) => n !== statuses.length);
            });

            if (previewMisaligned) {
                warnings.push("Certaines lignes semblent avoir un nombre de valeurs différent entre statuts/dates/canaux/notes. Vérifiez la section 'Aperçu séquence multi-actions'.");
            }

            if (importMode === "existing" && whenAlreadyWorkedOn === "skip") {
                warnings.push("Conflit potentiel: vous importez l'historique d'actions mais vous avez choisi d'ignorer les sociétés déjà travaillées. Une partie de l'historique peut être ignorée.");
            }
        }

        setValidationResult({
            valid: errors.length === 0 ? totalRows : 0, // FIXED: Use totalRows instead of previewData.length
            errors,
            warnings,
        });

        if (errors.length === 0) {
            setStep(4);
        }
    };

    // ============================================
    // IMPORT DATA
    // ============================================

    // ============================================
    // PRE-IMPORT SIMULATION (real DB check)
    // ============================================

    /** Extract every company name from the file, deduped, so the API can match them against the CRM. */
    const extractCompanyNames = useCallback(async (): Promise<{ names: string[]; truncated: boolean }> => {
        const nameMapping = mappings.find((m) => m.targetField === "company.name");
        if (!file || !nameMapping) return { names: [], truncated: false };

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return { names: [], truncated: false };

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseCSVLine(lines[0], delimiter).map((h) => h.replace(/^"|"$/g, ""));
        const colIndex = headers.indexOf(nameMapping.csvColumn);
        if (colIndex === -1) return { names: [], truncated: false };

        const unique = new Set<string>();
        let truncated = false;
        for (let i = 1; i < lines.length; i++) {
            const value = parseCSVLine(lines[i], delimiter)[colIndex]?.replace(/^"|"$/g, "").trim();
            if (!value) continue;
            if (unique.size >= SIMULATION_MAX_NAMES) {
                truncated = true;
                break;
            }
            unique.add(value);
        }
        return { names: [...unique], truncated };
    }, [file, mappings]);

    const runSimulation = useCallback(async () => {
        setIsSimulating(true);
        setSimulationError(null);
        try {
            const { names } = await extractCompanyNames();
            if (names.length === 0) {
                setSimulation(null);
                setSimulationError("Impossible de lire les noms de sociétés du fichier.");
                return;
            }
            const res = await fetch("/api/lists/import/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyNames: names,
                    listId: importMode === "existing" ? listId : "",
                    missionId,
                    duplicateScope,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setSimulation(null);
                setSimulationError(json.error || "La simulation a échoué.");
                return;
            }
            setSimulation(json.data as SimulationResult);
        } catch {
            setSimulation(null);
            setSimulationError("Simulation indisponible — la vérification sera faite pendant l'import.");
        } finally {
            setIsSimulating(false);
        }
    }, [extractCompanyNames, importMode, listId, missionId, duplicateScope]);

    // Re-run the simulation whenever the user lands on step 4 or changes the scope/target.
    useEffect(() => {
        if (step !== 4) return;
        const timer = setTimeout(() => { void runSimulation(); }, 150);
        return () => clearTimeout(timer);
    }, [step, runSimulation]);

    // "Clean replace" only exists for an existing list — fall back if the user switches mode.
    useEffect(() => {
        if (importMode !== "existing" && duplicateScenario === "clean_replace") {
            setDuplicateScenario("smart_merge");
        }
    }, [importMode, duplicateScenario]);

    const handleImport = async () => {
        if (!file) return;

        setIsImporting(true);
        setImportProgress(0);

        try {
            const totalRows = await countFileLines(file);
            type ImportDoneData = {
                listId?: string;
                replacedListId?: string | null;
                companiesCreated: number;
                companiesUpdated?: number;
                companiesSkipped?: number;
                contactsCreated: number;
                contactsUpdated?: number;
                contactsSkipped?: number;
                actionsCreated?: number;
                errors: number;
            };
            const uploadChunk = async (
                uploadFile: File,
                opts: { existingListId?: string; chunkRows?: number; processedRowsBefore?: number; totalRowsAll?: number }
            ): Promise<{ data?: ImportDoneData; error?: string }> => {
                const formData = new FormData();
                formData.append("file", uploadFile);
                if (opts.existingListId) {
                    formData.append("listId", opts.existingListId);
                } else if (importMode === "existing" && listId) {
                    formData.append("listId", listId);
                    // Only the first request may archive-and-replace; later chunks append to the
                    // fresh list it created (passed back as existingListId).
                    if (replaceList) formData.append("replaceList", "true");
                } else {
                    formData.append("missionId", missionId);
                    formData.append("listName", listName);
                }
                formData.append("whenAlreadyWorkedOn", whenAlreadyWorkedOn);
                formData.append("duplicateStrategy", duplicateStrategy);
                formData.append("duplicateScope", duplicateScope);
                formData.append("mappings", JSON.stringify(mappings));
                formData.append("importType", importType);
                formData.append("importActions", String(importActions));
                if (assignedSdrId) {
                    formData.append("assignedSdrId", assignedSdrId);
                }
                formData.append("actionColumnMapping", JSON.stringify(actionColumnMapping));
                if (actionColumnMode === "multi-column") {
                    formData.append("actionColumnMode", actionColumnMode);
                    formData.append("actionColumnGroups", JSON.stringify(actionColumnGroups));
                }
                formData.append("statusMappings", JSON.stringify(statusMappings));
                formData.append("channelMappings", JSON.stringify(channelMappings));
                if ((opts.chunkRows ?? 0) > 0) formData.append("totalRows", String(opts.chunkRows));

                const res = await fetch("/api/lists/import", { method: "POST", body: formData });
                if (!res.ok || !res.body) {
                    const json = await res.json().catch(() => ({}));
                    if (res.status === 413) return { error: "Le fichier est trop gros pour un envoi unique." };
                    return { error: (json as { error?: string }).error || "L'import a échoué" };
                }

                const reader = res.body.getReader();
                const dec = new TextDecoder();
                let buffer = "";
                let doneData: ImportDoneData | undefined;
                let errorMsg: string | undefined;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += dec.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            const msg = JSON.parse(trimmed) as { type: string; percent?: number; data?: ImportDoneData; error?: string };
                            if (msg.type === "progress" && msg.percent != null) {
                                if (opts.totalRowsAll && opts.chunkRows && opts.processedRowsBefore != null) {
                                    const processedThisChunk = Math.round((msg.percent / 100) * opts.chunkRows);
                                    const globalPercent = Math.min(
                                        100,
                                        Math.round(((opts.processedRowsBefore + processedThisChunk) / opts.totalRowsAll) * 100)
                                    );
                                    setImportProgress(globalPercent);
                                } else {
                                    setImportProgress(msg.percent);
                                }
                            }
                            if (msg.type === "done" && msg.data) doneData = msg.data;
                            if (msg.type === "error" && msg.error) errorMsg = msg.error;
                        } catch {
                            // ignore malformed lines
                        }
                    }
                }

                if (errorMsg) return { error: errorMsg };
                if (!doneData) return { error: "Réponse invalide" };
                return { data: doneData };
            };

            const shouldChunk = file.size > IMPORT_CHUNK_THRESHOLD_BYTES;
            if (!shouldChunk) {
                const single = await uploadChunk(file, { chunkRows: totalRows, processedRowsBefore: 0, totalRowsAll: totalRows });
                if (single.error || !single.data) {
                    showError("Erreur", single.error || "L'import a échoué");
                    return;
                }
                setImportProgress(100);
                setImportResult({
                    companies: single.data.companiesCreated,
                    companiesUpdated: single.data.companiesUpdated ?? 0,
                    companiesSkipped: single.data.companiesSkipped ?? 0,
                    contacts: single.data.contactsCreated,
                    contactsUpdated: single.data.contactsUpdated ?? 0,
                    contactsSkipped: single.data.contactsSkipped ?? 0,
                    actions: single.data.actionsCreated,
                    errors: single.data.errors,
                });
                setStep(5);
                success("Import réussi", `${single.data.companiesCreated} sociétés et ${single.data.contactsCreated} contacts importés`);
                return;
            }

            const csvText = await file.text();
            const csvChunks = splitCsvIntoChunks(csvText, IMPORT_CHUNK_TARGET_BYTES);
            if (csvChunks.length === 0) {
                showError("Erreur", "Le fichier CSV est vide");
                return;
            }

            // With "clean replace" the first chunk must go through the replace path (archive + create
            // a fresh list); only the chunks after it append to the list that call returns.
            let targetListId = importMode === "existing" && !replaceList ? listId : "";
            let companiesTotal = 0;
            let companiesUpdatedTotal = 0;
            let companiesSkippedTotal = 0;
            let contactsTotal = 0;
            let contactsUpdatedTotal = 0;
            let contactsSkippedTotal = 0;
            let actionsTotal = 0;
            let errorsTotal = 0;
            let processedRowsBefore = 0;

            for (let i = 0; i < csvChunks.length; i++) {
                const chunkText = csvChunks[i];
                const chunkRows = Math.max(0, chunkText.split(/\r?\n/).filter((line) => line.trim().length > 0).length - 1);
                const chunkFile = new File([chunkText], `${file.name.replace(/\.csv$/i, "")}-part-${i + 1}.csv`, { type: "text/csv" });
                const result = await uploadChunk(chunkFile, {
                    existingListId: targetListId || undefined,
                    chunkRows,
                    processedRowsBefore,
                    totalRowsAll: totalRows,
                });
                if (result.error || !result.data) {
                    showError("Erreur", result.error || "L'import a échoué");
                    return;
                }
                targetListId = result.data.listId || targetListId;
                companiesTotal += result.data.companiesCreated;
                companiesUpdatedTotal += result.data.companiesUpdated ?? 0;
                companiesSkippedTotal += result.data.companiesSkipped ?? 0;
                contactsTotal += result.data.contactsCreated;
                contactsUpdatedTotal += result.data.contactsUpdated ?? 0;
                contactsSkippedTotal += result.data.contactsSkipped ?? 0;
                actionsTotal += result.data.actionsCreated ?? 0;
                errorsTotal += result.data.errors;
                processedRowsBefore += chunkRows;
                setImportProgress(Math.min(100, Math.round((processedRowsBefore / Math.max(totalRows, 1)) * 100)));
            }

            setImportProgress(100);
            setImportResult({
                companies: companiesTotal,
                companiesUpdated: companiesUpdatedTotal,
                companiesSkipped: companiesSkippedTotal,
                contacts: contactsTotal,
                contactsUpdated: contactsUpdatedTotal,
                contactsSkipped: contactsSkippedTotal,
                actions: actionsTotal,
                errors: errorsTotal,
            });
            setStep(5);
            success("Import réussi", `${companiesTotal} sociétés et ${contactsTotal} contacts importés`);
        } catch (err) {
            console.error("Import failed:", err);
            showError("Erreur", "L'import a échoué");
        } finally {
            setIsImporting(false);
            setImportProgress(null);
        }
    };

    // ============================================
    // STEP INDICATORS
    // ============================================

    const steps = [
        { num: 1, label: "Fichier", icon: Upload },
        { num: 2, label: "Type", icon: Building2 },
        { num: 3, label: "Mapping", icon: ArrowRight },
        { num: 4, label: "Validation", icon: CheckCircle2 },
        { num: 5, label: "Import", icon: Database },
    ];

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header — compact: title, context, and a slim step rail */}
            <div className="flex items-center gap-3">
                <Link href="/manager/lists">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold text-slate-900 leading-tight">Importer CSV</h1>
                    <p className="text-xs text-slate-500 truncate">
                        {[
                            file?.name,
                            missions.find(m => m.id === missionId)?.name,
                            csvHeaders.length > 0 ? `${mappedCount}/${csvHeaders.length} colonnes` : null,
                        ].filter(Boolean).join(" · ") || "Sélectionnez un fichier et une mission"}
                    </p>
                </div>
                <span className="text-xs font-medium text-slate-500 shrink-0">
                    Étape {step}/{steps.length} · {steps.find(s => s.num === step)?.label}
                </span>
            </div>

            {/* Slim step rail */}
            <div className="flex gap-1.5">
                {steps.map((s) => (
                    <button
                        key={s.num}
                        type="button"
                        onClick={() => { if (s.num < step) setStep(s.num as 1 | 2 | 3 | 4 | 5); }}
                        disabled={s.num >= step}
                        title={s.label}
                        aria-label={`Étape ${s.num} : ${s.label}`}
                        aria-current={step === s.num ? "step" : undefined}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${step > s.num
                            ? "bg-indigo-500 cursor-pointer hover:bg-indigo-600"
                            : step === s.num
                                ? "bg-indigo-500"
                                : "bg-slate-200 cursor-default"
                            }`}
                    />
                ))}
            </div>

            {/* Step 1: File & Mission Selection */}
            {step === 1 && (
                <Card>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Destination
                            </label>
                            <RadioCardGroup
                                name="destination"
                                columns={2}
                                value={importMode}
                                onChange={(v) => setImportMode(v)}
                                options={[
                                    {
                                        value: "new",
                                        title: "Nouvelle liste",
                                        description: "Créer une nouvelle liste dans la mission",
                                        icon: PlusCircle,
                                    },
                                    {
                                        value: "existing",
                                        title: "Ajouter à une liste existante",
                                        description: "Mapper les colonnes et fusionner avec la liste",
                                        icon: Layers,
                                    },
                                ]}
                            />
                        </div>

                        <Select
                            label="Mission *"
                            placeholder="Sélectionner une mission..."
                            options={missions.map(m => ({ value: m.id, label: m.name }))}
                            value={missionId}
                            onChange={(v) => { setMissionId(v); setListId(""); }}
                            searchable
                        />

                        {importMode === "new" ? (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Nom de la liste *
                                </label>
                                <input
                                    type="text"
                                    value={listName}
                                    onChange={(e) => setListName(e.target.value)}
                                    placeholder="Ex: Liste CSV Mars 2025"
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                        ) : (
                            <Select
                                label="Liste existante *"
                                placeholder={missionId ? "Choisir une liste..." : "Sélectionnez d'abord une mission"}
                                options={lists.map(l => ({ value: l.id, label: l.name }))}
                                value={listId}
                                onChange={setListId}
                                searchable
                                disabled={!missionId || lists.length === 0}
                            />
                        )}

                        {/* Duplicate handling */}
                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-slate-700">
                                    Que faire des sociétés déjà présentes ?
                                </label>
                                <Tooltip content="Une société est reconnue par son nom (insensible à la casse et aux espaces).">
                                    <Info className="w-4 h-4 text-slate-400" />
                                </Tooltip>
                            </div>
                            <RadioCardGroup
                                name="duplicate-scenario"
                                columns={2}
                                value={duplicateScenario}
                                onChange={(v) => {
                                    if (v === "clean_replace") {
                                        setConfirmCleanReplace(true);
                                        return;
                                    }
                                    setDuplicateScenario(v);
                                }}
                                options={duplicateScenarioOptions}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Périmètre de détection des doublons
                            </label>
                            <RadioCardGroup
                                name="duplicate-scope"
                                columns={2}
                                value={duplicateScope}
                                onChange={(v) => setDuplicateScope(v)}
                                options={duplicateScopeOptions}
                            />
                            {duplicateScope === "mission" && missionId && (
                                <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-400" />
                                    <span>
                                        {otherMissionListsCount > 0
                                            ? `${otherMissionListsCount} autre${otherMissionListsCount > 1 ? "s" : ""} liste${otherMissionListsCount > 1 ? "s" : ""} de cette mission ${otherMissionListsCount > 1 ? "seront vérifiées" : "sera vérifiée"} en plus de la liste cible.`
                                            : "Aucune autre liste dans cette mission pour le moment — le périmètre équivaut à la liste cible."}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Si la société a déjà été travaillée
                            </label>
                            <select
                                value={whenAlreadyWorkedOn}
                                onChange={(e) => setWhenAlreadyWorkedOn(e.target.value as "skip" | "add_anyway")}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="skip">Ignorer la société (ne pas la relancer)</option>
                                <option value="add_anyway">Ajouter quand même (nouveaux interlocuteurs possibles)</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-1">
                                « Déjà travaillée » = la société a au moins une action enregistrée{duplicateScope === "mission" ? ", y compris dans une autre liste de la mission" : ""}.
                            </p>
                        </div>

                        <FileUpload
                            label="Fichier CSV *"
                            accept=".csv"
                            maxSize={200}
                            onFilesSelected={handleFileSelected}
                        />

                        <div className="flex justify-end">
                            <Button
                                variant="primary"
                                onClick={() => setStep(2)}
                                disabled={!canGoToType}
                                className="gap-2"
                            >
                                Suivant
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Step 2: Import Type Selection */}
            {step === 2 && (
                <Card>
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 mb-2">Type d'import</h2>
                            <p className="text-sm text-slate-500">
                                Choisissez ce que vous souhaitez importer depuis votre fichier CSV
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setImportType("companies-only")}
                                className={`p-6 rounded-xl border-2 transition-all text-left ${importType === "companies-only"
                                    ? "border-indigo-500 bg-indigo-50"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${importType === "companies-only"
                                        ? "bg-indigo-100 text-indigo-600"
                                        : "bg-slate-100 text-slate-400"
                                        }`}>
                                        <Building2 className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-slate-900 mb-1">Sociétés uniquement</h3>
                                        <p className="text-sm text-slate-600">
                                            Importez uniquement les sociétés. Les SDR pourront appeler directement les sociétés qui ont un numéro de téléphone.
                                        </p>
                                    </div>
                                    {importType === "companies-only" && (
                                        <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                    )}
                                </div>
                            </button>

                            <button
                                onClick={() => setImportType("companies-contacts")}
                                className={`p-6 rounded-xl border-2 transition-all text-left ${importType === "companies-contacts"
                                    ? "border-indigo-500 bg-indigo-50"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${importType === "companies-contacts"
                                        ? "bg-indigo-100 text-indigo-600"
                                        : "bg-slate-100 text-slate-400"
                                        }`}>
                                        <User className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-slate-900 mb-1">Sociétés + Contacts</h3>
                                        <p className="text-sm text-slate-600">
                                            Importez les sociétés avec leurs contacts associés. Permet un ciblage plus précis.
                                        </p>
                                    </div>
                                    {importType === "companies-contacts" && (
                                        <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                    )}
                                </div>
                            </button>
                        </div>

                        <div className="flex justify-between">
                            <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Retour
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => setStep(3)}
                                className="gap-2"
                            >
                                Suivant
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Step 3: Column Mapping */}
            {step === 3 && (
                <Card>
                    <div className="space-y-6">
                        {/* Header with Stats */}
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    Mapper les colonnes
                                    <Badge variant="primary" className="text-xs">
                                        {mappedCount}/{csvHeaders.length} mappees
                                    </Badge>
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    Associez chaque colonne CSV à un champ de données
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Tooltip content="Détection automatique basée sur les noms de colonnes">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-lg">
                                        <Sparkles className="w-4 h-4 text-indigo-500" />
                                        <span className="text-sm font-medium text-indigo-700">Auto-détecté</span>
                                    </div>
                                </Tooltip>
                            </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-slate-800">Progression du mapping</p>
                                <p className="text-xs text-slate-500">{mappingCompletion}%</p>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${mappingCompletion}%` }} />
                            </div>
                            {!requiredMapped && (
                                <p className="text-xs text-rose-600 mt-2">Le champ obligatoire `Nom de société` n&apos;est pas encore mappé.</p>
                            )}
                        </div>

                        {/* Bulk Actions Toolbar */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Rechercher une colonne..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setMappings(mappings.map(m => ({ ...m, targetField: "" })));
                                    }}
                                    className="gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Réinitialiser
                                </Button>
                            </div>

                            {/* Action history toggle */}
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <History className="w-4 h-4 text-slate-500" />
                                        <p className="text-sm font-medium text-slate-900">Prospects déjà travaillés ?</p>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Activez cette option pour importer l&apos;historique des statuts (appels, emails, LinkedIn) depuis votre CSV.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setImportActions(!importActions)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${importActions ? "bg-indigo-600" : "bg-slate-300"}`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${importActions ? "translate-x-5" : ""}`}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {mappings
                                .filter(m => !searchQuery || m.csvColumn.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((mapping, i) => {
                                const availableFields = importType === "companies-only" ? [...COMPANY_FIELDS] : [...ALL_FIELDS];
                                const currentTarget = mapping.targetField;
                                const isCustomCompany = currentTarget.startsWith("company.") && !COMPANY_FIELDS.some(f => f.value === currentTarget);
                                const isCustomContact = currentTarget.startsWith("contact.") && !CONTACT_FIELDS.some(f => f.value === currentTarget);

                                if (isCustomCompany) {
                                    availableFields.push({ value: currentTarget, label: `Société (Perso): ${currentTarget.replace('company.', '')}` });
                                }
                                if (isCustomContact) {
                                    availableFields.push({ value: currentTarget, label: `Contact (Perso): ${currentTarget.replace('contact.', '')}` });
                                }

                                const getFieldIcon = () => {
                                    if (currentTarget.startsWith("company.")) return <Building2 className="w-4 h-4 text-blue-500" />;
                                    if (currentTarget.startsWith("contact.")) return <User className="w-4 h-4 text-purple-500" />;
                                    return null;
                                };

                                return (
                                    <div key={mapping.csvColumn} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-sm font-semibold text-slate-900">{mapping.csvColumn}</p>
                                                {currentTarget && getFieldIcon()}
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">
                                                Exemple: {previewData[0]?.[mapping.csvColumn] || "—"}
                                            </p>
                                            {(() => {
                                                const stat = columnStats.find(s => s.column === mapping.csvColumn);
                                                if (!stat) return null;
                                                const fillRate = stat.totalRows > 0 ? Math.round((stat.filledRows / stat.totalRows) * 100) : 0;
                                                return (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            rempli {fillRate}%
                                                        </span>
                                                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                            {stat.uniqueValues} uniques
                                                        </span>
                                                        <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                                            {stat.dataType}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                                        <Select
                                            options={availableFields}
                                            value={mapping.targetField}
                                            onChange={(value) => {
                                                const newMappings = [...mappings];
                                                const actualIndex = mappings.findIndex(m => m.csvColumn === mapping.csvColumn);
                                                if (value === "__custom_company__") {
                                                    setCustomFieldPrompt({ index: actualIndex, type: 'company' });
                                                    setCustomFieldValue("");
                                                } else if (value === "__custom_contact__") {
                                                    setCustomFieldPrompt({ index: actualIndex, type: 'contact' });
                                                    setCustomFieldValue("");
                                                } else {
                                                    newMappings[actualIndex].targetField = value;
                                                    setMappings(newMappings);
                                                }
                                            }}
                                            className="w-56 flex-shrink-0"
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Action history configuration */}
                        {importActions && (
                            <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                        Historique des actions
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Configurez les colonnes pour reconstruire l&apos;historique des statuts et des notes de vos prospects.
                                    </p>
                                </div>
                                <Select
                                    label="Assigner l'historique à (SDR) *"
                                    placeholder="Sélectionner un SDR..."
                                    options={sdrOptions.map((s) => ({
                                        value: s.id,
                                        label: `${s.name} (${s.role === "BUSINESS_DEVELOPER" ? "BD" : "SDR"})`,
                                    }))}
                                    value={assignedSdrId}
                                    onChange={setAssignedSdrId}
                                    searchable
                                />
                                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                                    <p className="text-xs font-medium text-indigo-800 mb-1">Format multi-appels accepte</p>
                                    <p className="text-xs text-indigo-700">
                                        Vous pouvez separer les sequences avec <strong>;</strong>, <strong>|</strong>, retour a la ligne, <strong>-&gt;</strong>, <strong>=&gt;</strong>, <strong>→</strong> ou <strong>»</strong>.
                                    </p>
                                    <p className="text-[11px] text-indigo-700 mt-1">
                                        Exemple: <span className="font-medium">No answer ; Callback requested ; Meeting booked</span>
                                    </p>
                                </div>
                                {isWorkedConflictActive && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                        <p className="text-xs font-semibold text-amber-800">Attention: regle potentiellement contradictoire</p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Vous avez active l&apos;historique multi-actions, mais en destination vous avez choisi
                                            <span className="font-medium"> &quot;Ignorer les societes deja travaillees&quot;</span>. Les actions
                                            historiques de ces societes seront ignorees.
                                        </p>
                                        <p className="text-[11px] text-amber-700 mt-1">
                                            Conseil: passez sur &quot;Ajouter quand meme&quot; si vous voulez conserver tout l&apos;historique.
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium text-slate-700">Mode de mapping des actions</p>
                                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                                            <button
                                                type="button"
                                                className={`px-3 py-1.5 text-xs rounded ${actionColumnMode === "single" ? "bg-indigo-600 text-white" : "text-slate-700"}`}
                                                onClick={() => setActionColumnMode("single")}
                                            >
                                                Colonne unique
                                            </button>
                                            <button
                                                type="button"
                                                className={`px-3 py-1.5 text-xs rounded ${actionColumnMode === "multi-column" ? "bg-indigo-600 text-white" : "text-slate-700"}`}
                                                onClick={() => setActionColumnMode("multi-column")}
                                            >
                                                Multi-colonnes
                                            </button>
                                        </div>
                                    </div>

                                    {actionColumnMode === "single" ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-700">Colonne statut</p>
                                                <Select
                                                    options={[
                                                        { value: "", label: "Ignorer" },
                                                        ...csvHeaders.map(h => ({ value: h, label: h })),
                                                    ]}
                                                    value={actionColumnMapping.statusColumn}
                                                    onChange={(value) =>
                                                        setActionColumnMapping(prev => ({ ...prev, statusColumn: value }))
                                                    }
                                                />
                                                <p className="text-xs text-slate-500">
                                                    Valeurs comme &quot;Tentative&quot;, &quot;Meeting booké&quot;, etc.
                                                </p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-700">Colonne date</p>
                                                <Select
                                                    options={[
                                                        { value: "", label: "Ignorer" },
                                                        ...csvHeaders.map(h => ({ value: h, label: h })),
                                                    ]}
                                                    value={actionColumnMapping.dateColumn}
                                                    onChange={(value) =>
                                                        setActionColumnMapping(prev => ({ ...prev, dateColumn: value }))
                                                    }
                                                />
                                                <p className="text-xs text-slate-500">
                                                    Date à laquelle l&apos;action a eu lieu (optionnel).
                                                </p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-700">Colonne date callback / RDV</p>
                                                <Select
                                                    options={[
                                                        { value: "", label: "Ignorer" },
                                                        ...csvHeaders.map(h => ({ value: h, label: h })),
                                                    ]}
                                                    value={actionColumnMapping.callbackDateColumn}
                                                    onChange={(value) =>
                                                        setActionColumnMapping(prev => ({ ...prev, callbackDateColumn: value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-700">Colonne note</p>
                                                <Select
                                                    options={[
                                                        { value: "", label: "Ignorer" },
                                                        ...csvHeaders.map(h => ({ value: h, label: h })),
                                                    ]}
                                                    value={actionColumnMapping.noteColumn}
                                                    onChange={(value) =>
                                                        setActionColumnMapping(prev => ({ ...prev, noteColumn: value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xs font-medium text-slate-700">Colonne canal</p>
                                                <Select
                                                    options={[
                                                        { value: "", label: "Ignorer" },
                                                        ...csvHeaders.map(h => ({ value: h, label: h })),
                                                    ]}
                                                    value={actionColumnMapping.channelColumn}
                                                    onChange={(value) =>
                                                        setActionColumnMapping(prev => ({ ...prev, channelColumn: value }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {actionColumnGroups.map((group, idx) => (
                                                <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-medium text-slate-900">Appel {idx + 1}</p>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeActionColumnGroup(group.id)}
                                                            className="h-7 text-xs text-rose-600"
                                                        >
                                                            Supprimer
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <Select
                                                            label="Statut"
                                                            options={[{ value: "", label: "Ignorer" }, ...csvHeaders.map(h => ({ value: h, label: h }))]}
                                                            value={group.statusColumn}
                                                            onChange={(value) => updateActionColumnGroup(group.id, { statusColumn: value })}
                                                        />
                                                        <Select
                                                            label="Date"
                                                            options={[{ value: "", label: "Ignorer" }, ...csvHeaders.map(h => ({ value: h, label: h }))]}
                                                            value={group.dateColumn}
                                                            onChange={(value) => updateActionColumnGroup(group.id, { dateColumn: value })}
                                                        />
                                                        <Select
                                                            label="Note"
                                                            options={[{ value: "", label: "Ignorer" }, ...csvHeaders.map(h => ({ value: h, label: h }))]}
                                                            value={group.noteColumn}
                                                            onChange={(value) => updateActionColumnGroup(group.id, { noteColumn: value })}
                                                        />
                                                        <Select
                                                            label="Canal"
                                                            options={[{ value: "", label: "Ignorer" }, ...csvHeaders.map(h => ({ value: h, label: h }))]}
                                                            value={group.channelColumn}
                                                            onChange={(value) => updateActionColumnGroup(group.id, { channelColumn: value })}
                                                        />
                                                        <Select
                                                            label="Date callback / RDV"
                                                            options={[{ value: "", label: "Ignorer" }, ...csvHeaders.map(h => ({ value: h, label: h }))]}
                                                            value={group.callbackDateColumn}
                                                            onChange={(value) => updateActionColumnGroup(group.id, { callbackDateColumn: value })}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            <Button
                                                variant="secondary"
                                                onClick={addActionColumnGroup}
                                                className="gap-2"
                                            >
                                                Ajouter un appel
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {/* Status mappings */}
                                {detectedStatuses.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-medium text-slate-700">
                                                Mapping des statuts CSV vers les résultats CRM
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" onClick={autoMapStatusValues} className="h-7 text-xs">
                                                    Auto-mapper
                                                </Button>
                                                {statusMappings.some(m => !m.actionResult) && (
                                                    <span className="text-[11px] text-amber-600">
                                                        Certains statuts ne sont pas encore mappes
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                                            <table className="w-full text-xs">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Statut CSV</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Occurrences</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Résultat CRM</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {statusMappings.map((m, idx) => (
                                                        <tr key={m.csvValue} className="border-t border-slate-100">
                                                            <td className="px-3 py-1.5 text-slate-900">{m.csvValue}</td>
                                                            <td className="px-3 py-1.5 text-slate-500">{m.count}</td>
                                                            <td className="px-3 py-1.5">
                                                                <Select
                                                                    options={Object.entries(ACTION_RESULT_LABELS).map(([value, label]) => ({
                                                                        value,
                                                                        label,
                                                                    }))}
                                                                    value={m.actionResult}
                                                                    onChange={(value) => {
                                                                        const next = [...statusMappings];
                                                                        next[idx] = { ...next[idx], actionResult: value };
                                                                        setStatusMappings(next);
                                                                    }}
                                                                    className="w-52"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Channel mappings (optional) */}
                                {(
                                    (actionColumnMode === "single" && !!actionColumnMapping.channelColumn) ||
                                    (actionColumnMode === "multi-column" && actionColumnGroups.some((g) => !!g.channelColumn))
                                ) && detectedChannels.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-700">
                                            Mapping des valeurs de canal vers les canaux CRM
                                        </p>
                                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                                            <table className="w-full text-xs">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Canal CSV</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Occurrences</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Canal CRM</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {channelMappings.map((m, idx) => (
                                                        <tr key={m.csvValue} className="border-t border-slate-100">
                                                            <td className="px-3 py-1.5 text-slate-900">{m.csvValue}</td>
                                                            <td className="px-3 py-1.5 text-slate-500">{m.count}</td>
                                                            <td className="px-3 py-1.5">
                                                                <Select
                                                                    options={[
                                                                        { value: 'CALL', label: 'Appel' },
                                                                        { value: 'EMAIL', label: 'Email' },
                                                                        { value: 'LINKEDIN', label: 'LinkedIn' },
                                                                    ]}
                                                                    value={m.channel}
                                                                    onChange={(value) => {
                                                                        const next = [...channelMappings];
                                                                        next[idx] = { ...next[idx], channel: value as 'CALL' | 'EMAIL' | 'LINKEDIN' };
                                                                        setChannelMappings(next);
                                                                    }}
                                                                    className="w-40"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {(
                                    (actionColumnMode === "single" && !!actionColumnMapping.statusColumn) ||
                                    (actionColumnMode === "multi-column" && actionColumnGroups.some((g) => !!g.statusColumn))
                                ) && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-slate-700">Reconstruction avant import (simulation CRM)</p>
                                        <div className="grid grid-cols-1 gap-3">
                                            {reconstructedActionPreview.map((row, rowIdx) => (
                                                <div key={`reco-${rowIdx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        {row.companyName} - {row.actionCount} action{row.actionCount > 1 ? "s" : ""} detectee{row.actionCount > 1 ? "s" : ""}
                                                    </p>
                                                    <div className="mt-2 space-y-1.5">
                                                        {row.actions.length > 0 ? row.actions.map((action, actionIdx) => (
                                                            <div key={`reco-${rowIdx}-action-${actionIdx}`} className="text-xs text-slate-700">
                                                                <span>{action.channelEmoji} {action.channelLabel}</span>
                                                                <span> · {action.date || "date non fournie"}</span>
                                                                <span> · {action.mappedLabel || action.sourceStatus}</span>
                                                                {action.callbackDate && (
                                                                    <span> -&gt; RDV/Rappel {action.callbackDate}</span>
                                                                )}
                                                                {action.note && (
                                                                    <span> · "{action.note}"</span>
                                                                )}
                                                            </div>
                                                        )) : (
                                                            <p className="text-xs text-slate-500">Aucune action detectee pour cet exemple.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs font-medium text-slate-700">Apercu sequence multi-actions (3 premieres lignes)</p>
                                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                                            <table className="w-full text-xs">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Ligne</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Actions detectees</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Exemple de sequence</th>
                                                        <th className="px-3 py-2 text-left text-slate-700 font-medium">Qualite</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sequencePreviewRows.map((row) => (
                                                        <tr key={`seq-preview-${row.rowNumber}`} className="border-t border-slate-100">
                                                            <td className="px-3 py-2 text-slate-900">#{row.rowNumber}</td>
                                                            <td className="px-3 py-2 text-slate-700">{row.actionCount || 0}</td>
                                                            <td className="px-3 py-2 text-slate-600 max-w-[420px] truncate">
                                                                {row.statuses.length > 0 ? row.statuses.join(" -> ") : "Aucune sequence"}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                {row.hasPotentialMisalignment ? (
                                                                    <span className="text-amber-600">A verifier (tailles differentes)</span>
                                                                ) : (
                                                                    <span className="text-emerald-600">OK</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Preview */}
                        <div>
                            <h3 className="text-sm font-medium text-slate-700 mb-2">Aperçu des données</h3>
                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            {csvHeaders.slice(0, 5).map(h => (
                                                <th key={h} className="text-left py-2 px-3 text-slate-700 font-medium">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 3).map((row, i) => (
                                            <tr key={i} className="border-b border-slate-100 last:border-0">
                                                {csvHeaders.slice(0, 5).map(h => (
                                                    <td key={h} className="py-2 px-3 text-slate-600 truncate max-w-[200px]">
                                                        {row[h] || "—"}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <Button variant="ghost" onClick={() => setStep(2)} className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Retour
                            </Button>
                            <Button variant="primary" onClick={validateData} className="gap-2">
                                Valider
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Step 4: Validation */}
            {step === 4 && validationResult && (
                <Card>
                    <div className="space-y-6">
                        <div className="text-center py-8">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-slate-900">Prêt pour l&apos;import</h2>
                            <p className="text-slate-500 mt-1">
                                {validationResult.valid} lignes valides détectées
                            </p>
                        </div>

                        {validationResult.warnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-700">Avertissements</p>
                                        <ul className="text-sm text-amber-600 mt-1 space-y-1">
                                            {validationResult.warnings.map((w, i) => (
                                                <li key={i}>• {w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pre-import simulation against the real CRM data */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium text-slate-900">Simulation avant import</h3>
                                <Button variant="ghost" size="sm" onClick={() => void runSimulation()} disabled={isSimulating} className="gap-2">
                                    <RotateCcw className={`w-3.5 h-3.5 ${isSimulating ? "animate-spin" : ""}`} />
                                    Recalculer
                                </Button>
                            </div>

                            {isSimulating && (
                                <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyse du fichier par rapport au CRM…
                                </div>
                            )}

                            {!isSimulating && simulationError && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                                    <div>
                                        <p className="font-medium">Simulation indisponible</p>
                                        <p className="mt-0.5">{simulationError} Vous pouvez lancer l&apos;import : la déduplication sera appliquée normalement.</p>
                                    </div>
                                </div>
                            )}

                            {!isSimulating && simulation && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <StatCard
                                            label="Nouvelles sociétés"
                                            value={simulation.newCompanies}
                                            icon={PlusCircle}
                                            iconBg="bg-emerald-100"
                                            iconColor="text-emerald-600"
                                        />
                                        <StatCard
                                            label="Doublons détectés"
                                            value={simulation.existingCompanies}
                                            icon={Layers}
                                            iconBg="bg-indigo-100"
                                            iconColor="text-indigo-600"
                                            subtitle={
                                                <Badge variant="primary">
                                                    {duplicateScenario === "smart_merge" ? "Enrichis"
                                                        : duplicateScenario === "skip" ? "Ignorés"
                                                            : duplicateScenario === "overwrite" ? "Écrasés"
                                                                : "Liste archivée"}
                                                </Badge>
                                            }
                                        />
                                        <StatCard
                                            label="Déjà travaillées"
                                            value={simulation.alreadyWorked}
                                            icon={PhoneCall}
                                            iconBg="bg-amber-100"
                                            iconColor="text-amber-600"
                                            subtitle={
                                                <Badge variant={whenAlreadyWorkedOn === "skip" ? "warning" : "default"}>
                                                    {whenAlreadyWorkedOn === "skip" ? "Ignorées" : "Ajoutées quand même"}
                                                </Badge>
                                            }
                                        />
                                    </div>

                                    {simulation.existingCompanies === 0 ? (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-3">
                                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                                            Aucun doublon détecté — toutes les sociétés du fichier sont nouvelles.
                                        </div>
                                    ) : (
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
                                            <p className="font-medium mb-1">Voici ce qui va se passer</p>
                                            <p>
                                                {simulation.newCompanies} société{simulation.newCompanies > 1 ? "s" : ""} créée{simulation.newCompanies > 1 ? "s" : ""}
                                                {duplicateScenario === "smart_merge" && `, ${simulation.existingCompanies} enrichie${simulation.existingCompanies > 1 ? "s" : ""} sans perte de données`}
                                                {duplicateScenario === "skip" && `, ${simulation.existingCompanies} laissée${simulation.existingCompanies > 1 ? "s" : ""} intacte${simulation.existingCompanies > 1 ? "s" : ""}`}
                                                {duplicateScenario === "overwrite" && `, ${simulation.existingCompanies} mise${simulation.existingCompanies > 1 ? "s" : ""} à jour avec les valeurs du CSV`}
                                                {duplicateScenario === "clean_replace" && `, la liste actuelle sera archivée avant l'import`}
                                                {whenAlreadyWorkedOn === "skip" && simulation.alreadyWorked > 0 && `, ${simulation.alreadyWorked} déjà travaillée${simulation.alreadyWorked > 1 ? "s" : ""} ignorée${simulation.alreadyWorked > 1 ? "s" : ""}`}
                                                .
                                            </p>
                                        </div>
                                    )}

                                    {simulation.sampleMatches.length > 0 && (
                                        <details className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                                Aperçu des correspondances détectées ({simulation.sampleMatches.length}
                                                {simulation.existingCompanies > simulation.sampleMatches.length ? ` sur ${simulation.existingCompanies}` : ""})
                                            </summary>
                                            <div className="overflow-x-auto border-t border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 text-slate-500">
                                                        <tr>
                                                            <th className="text-left font-medium px-4 py-2">Société (CSV)</th>
                                                            <th className="text-left font-medium px-4 py-2">Trouvée dans</th>
                                                            <th className="text-left font-medium px-4 py-2">Statut CRM</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {simulation.sampleMatches.map((m) => (
                                                            <tr key={m.matchedCompanyId} className="hover:bg-slate-50">
                                                                <td className="px-4 py-2 text-slate-900">{m.csvName}</td>
                                                                <td className="px-4 py-2 text-slate-600">
                                                                    {m.listName ?? "—"}
                                                                    {m.crossList && (
                                                                        <Badge variant="outline" className="ml-2">Autre liste</Badge>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    {m.alreadyWorked
                                                                        ? <Badge variant="warning">Déjà travaillée</Badge>
                                                                        : <Badge variant="success">Jamais contactée</Badge>}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4">
                            <h3 className="font-medium text-slate-900 mb-2">Résumé de l&apos;import</h3>
                            <ul className="text-sm text-slate-600 space-y-1">
                                <li>• {importMode === "existing" ? "Liste existante: " : "Liste: "}<span className="text-slate-900 font-medium">{importMode === "existing" ? lists.find(l => l.id === listId)?.name ?? listId : listName}</span></li>
                                <li>• Mission: <span className="text-slate-900 font-medium">{missions.find(m => m.id === missionId)?.name}</span></li>
                                <li>• Type: <span className="text-slate-900 font-medium">
                                    {importType === "companies-only" ? "Sociétés uniquement" : "Sociétés + Contacts"}
                                </span></li>
                                <li>• Doublons: <span className="text-slate-900 font-medium">
                                    {duplicateScenario === "smart_merge" ? "Enrichir & compléter"
                                        : duplicateScenario === "skip" ? "Ignorer les doublons"
                                            : duplicateScenario === "overwrite" ? "Mettre à jour / écraser"
                                                : "Remplacement propre (archivage)"}
                                </span> — périmètre <span className="text-slate-900 font-medium">{duplicateScope === "mission" ? "mission entière" : "liste cible"}</span></li>
                                <li>• Fichier: <span className="text-slate-900 font-medium">{file?.name}</span></li>
                                <li>• Lignes: <span className="text-slate-900 font-medium">{validationResult.valid}</span></li>
                            </ul>
                        </div>

                        <div className="flex flex-col gap-3">
                            {isImporting && importProgress != null && (
                                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${importProgress}%` }}
                                    />
                                </div>
                            )}
                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => setStep(3)} className="gap-2" disabled={isImporting}>
                                    <ArrowLeft className="w-4 h-4" />
                                    Retour
                                </Button>
                                <Button
                                    variant="success"
                                    onClick={handleImport}
                                    disabled={isImporting}
                                    className="gap-2"
                                >
                                    {isImporting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {importProgress != null ? `Import… ${importProgress}%` : "Import en cours…"}
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            Lancer l&apos;import
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Step 5: Result */}
            {step === 5 && importResult && (
                <Card>
                    <div className="py-8">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-emerald-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-slate-900">Import terminé !</h2>
                            <p className="text-slate-500 mt-1">
                                {importResult.companies} sociétés et {importResult.contacts} contacts importés
                            </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
                            <StatCard
                                label="Sociétés créées"
                                value={importResult.companies}
                                icon={PlusCircle}
                                iconBg="bg-emerald-100"
                                iconColor="text-emerald-600"
                            />
                            <StatCard
                                label="Sociétés enrichies"
                                value={importResult.companiesUpdated}
                                icon={Sparkles}
                                iconBg="bg-indigo-100"
                                iconColor="text-indigo-600"
                            />
                            <StatCard
                                label="Doublons évités"
                                value={importResult.companiesSkipped}
                                icon={SkipForward}
                                iconBg="bg-slate-100"
                                iconColor="text-slate-500"
                            />
                            <StatCard
                                label="Contacts créés"
                                value={importResult.contacts}
                                icon={Users}
                                iconBg="bg-sky-100"
                                iconColor="text-sky-600"
                                subtitle={
                                    importResult.contactsUpdated > 0
                                        ? <span className="text-slate-500">+{importResult.contactsUpdated} complété{importResult.contactsUpdated > 1 ? "s" : ""}</span>
                                        : undefined
                                }
                            />
                        </div>

                        {(importResult.actions ?? 0) > 0 && (
                            <p className="text-sm text-slate-500 text-center mt-4">
                                {importResult.actions} action{(importResult.actions ?? 0) > 1 ? "s" : ""} d&apos;historique reconstituée{(importResult.actions ?? 0) > 1 ? "s" : ""}.
                            </p>
                        )}
                        {importResult.errors > 0 && (
                            <p className="text-sm text-amber-600 text-center mt-2">
                                {importResult.errors} ligne{importResult.errors > 1 ? "s" : ""} en erreur (ignorée{importResult.errors > 1 ? "s" : ""}).
                            </p>
                        )}

                        <div className="flex justify-center gap-4 mt-8">
                            <Link href="/manager/lists">
                                <Button variant="secondary" className="gap-2">
                                    <Table className="w-4 h-4" />
                                    Voir les listes
                                </Button>
                            </Link>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setStep(1);
                                    setFile(null);
                                    setMissionId("");
                                    setListName("");
                                    setCsvHeaders([]);
                                    setMappings([]);
                                    setPreviewData([]);
                                    setAssignedSdrId("");
                                    setValidationResult(null);
                                    setImportResult(null);
                                }}
                                className="gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                Nouvel import
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
            {/* Clean Replace confirmation */}
            <ConfirmModal
                isOpen={confirmCleanReplace}
                onClose={() => setConfirmCleanReplace(false)}
                onConfirm={() => {
                    setDuplicateScenario("clean_replace");
                    setConfirmCleanReplace(false);
                }}
                title="Remplacement propre de la liste"
                message={`La liste « ${lists.find(l => l.id === listId)?.name ?? ""} » sera archivée (conservée en historique, retirée des listes actives) et l'import créera une liste neuve à sa place. Les sociétés, contacts et actions existants restent consultables dans la liste archivée.`}
                confirmText="Archiver et remplacer"
                variant="danger"
            />

            {/* Custom Field Modal */}
            <Modal
                isOpen={customFieldPrompt !== null}
                onClose={() => setCustomFieldPrompt(null)}
                title={customFieldPrompt?.type === 'company' ? "Champ personnalisé société" : "Champ personnalisé contact"}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Saisissez le nom du champ personnalisé à utiliser. Ne mettez pas d'espaces.
                    </p>
                    <Input
                        label="Nom du champ"
                        placeholder={customFieldPrompt?.type === 'company' ? "ex: revenue, techStack" : "ex: department, seniority"}
                        value={customFieldValue}
                        onChange={(e) => setCustomFieldValue(e.target.value)}
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setCustomFieldPrompt(null)}>
                            Annuler
                        </Button>
                        <Button
                            variant="primary"
                            disabled={!customFieldValue.trim()}
                            onClick={() => {
                                if (customFieldPrompt && customFieldValue.trim()) {
                                    const newMappings = [...mappings];
                                    const prefix = customFieldPrompt.type === 'company' ? 'company' : 'contact';
                                    const sanitized = customFieldValue.trim().replace(/\s+/g, '_');
                                    newMappings[customFieldPrompt.index].targetField = `${prefix}.${sanitized}`;
                                    setMappings(newMappings);
                                    setCustomFieldPrompt(null);
                                }
                            }}
                        >
                            Valider
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
