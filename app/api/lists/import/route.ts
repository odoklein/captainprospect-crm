import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { ActionResult } from "@prisma/client";
import { calculateContactCompleteness } from "@/lib/scoring";

// ============================================
// CSV IMPORT API (streaming + batched for performance)
// ============================================
// Accepts multipart/form-data: file (raw CSV), mappings (JSON), importType.
// Either: listId (add to existing list) OR missionId + listName (create new list).
// whenAlreadyWorkedOn: "skip" | "add_anyway" — when adding to existing list, skip rows whose company already has actions.
// Streams CSV from the uploaded file and processes rows in batches to avoid loading
// the full file and to reduce per-row DB round-trips.
// ============================================

// Bigger batches => fewer DB round-trips (each batch does multiple queries).
// Keep it reasonably small to avoid heavy per-batch CPU/memory usage.
const BATCH_SIZE = 1000;

// ----- Server-side CSV parsing (same logic as client for consistent behavior) -----
function parseCSVLine(line: string, delimiter: string = ","): string[] {
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
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
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

function splitMultiActionCell(raw: string | undefined): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];

    return trimmed
        .split(/(?:\r?\n|;|\||=>|->|→|»)+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function normalizeCompanyName(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePersonName(value: string | null | undefined): string {
    return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(value: string | null | undefined): string | null {
    const normalized = (value ?? "").trim().toLowerCase();
    return normalized || null;
}

function splitPhoneValues(value: string | null | undefined): string[] {
    return (value ?? "")
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

type ActionColumnMode = "single" | "multi-column";
type ActionColumnGroup = {
    id?: string;
    statusColumn?: string;
    dateColumn?: string;
    noteColumn?: string;
    channelColumn?: string;
    callbackDateColumn?: string;
};

/** Consume a Web ReadableStream and yield lines (split by \n or \r\n). */
async function* streamToLines(
    stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
    const reader = stream.getReader();
    const dec = new TextDecoder("utf-8", { fatal: false });
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() ?? "";
            for (const line of parts) {
                yield line;
            }
        }
        if (buffer.trim()) yield buffer;
    } finally {
        reader.releaseLock();
    }
}

/** Parse a single batch of CSV lines into row objects keyed by header. */
function parseBatch(
    lines: string[],
    headers: string[],
    delimiter: string,
    startRowIndex: number
): { rowIndex: number; row: Record<string, string> }[] {
    const rows: { rowIndex: number; row: Record<string, string> }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter).map((v) =>
            v.replace(/^"|"$/g, "")
        );
        const row: Record<string, string> = {};
        headers.forEach((h, j) => {
            row[h] = values[j] ?? "";
        });
        rows.push({ rowIndex: startRowIndex + i, row });
    }
    return rows;
}

/** Extract company data from a row using mappings (unchanged business logic). */
function extractCompanyFromRow(
    row: Record<string, string>,
    mappings: { csvColumn: string; targetField: string }[]
): {
    companyData: Record<string, string>;
    companyCustomData: Record<string, string>;
    hasCompanyData: boolean;
    additionalPhones: string[];
} {
    const companyData: Record<string, string> = {};
    const companyCustomData: Record<string, string> = {};
    let hasCompanyData = false;
    const standardFields = ["name", "industry", "country", "website", "size", "phone"];
    const additionalPhones: string[] = [];

    for (const mapping of mappings) {
        if (!mapping.targetField.startsWith("company.")) continue;
        const field = mapping.targetField.replace("company.", "");
        const value = row[mapping.csvColumn];
        if (!value) continue;
        if (field === "additionalPhones") {
            additionalPhones.push(value.trim());
        } else if (standardFields.includes(field)) {
            companyData[field] = value.trim();
        } else {
            companyCustomData[field] = value.trim();
        }
        hasCompanyData = true;
    }
    return { companyData, companyCustomData, hasCompanyData, additionalPhones };
}

/** Extract contact data from a row using mappings (unchanged business logic). */
function extractContactFromRow(
    row: Record<string, string>,
    mappings: { csvColumn: string; targetField: string }[]
): {
    contactData: Record<string, string>;
    contactCustomData: Record<string, string>;
    hasContactData: boolean;
    additionalPhones: string[];
} {
    const contactData: Record<string, string> = {};
    const contactCustomData: Record<string, string> = {};
    let hasContactData = false;
    const standardFields = ["firstName", "lastName", "email", "phone", "title", "linkedin"];
    const phoneColumns: string[] = [];
    const additionalPhones: string[] = [];

    for (const mapping of mappings) {
        if (!mapping.targetField.startsWith("contact.")) continue;
        const field = mapping.targetField.replace("contact.", "");
        const value = row[mapping.csvColumn];
        if (!value) continue;
        const trimmed = value.trim();

        if (field === "phone") {
            phoneColumns.push(trimmed);
        } else if (field === "additionalPhones") {
            additionalPhones.push(trimmed);
        } else if (standardFields.includes(field)) {
            contactData[field] = trimmed;
        } else {
            contactCustomData[field] = trimmed;
        }
        hasContactData = true;
    }

    // Primary phone from the first mapped phone column, extras into additionalPhones
    if (phoneColumns.length > 0) {
        contactData.phone = phoneColumns[0];
        if (phoneColumns.length > 1) {
            additionalPhones.push(...phoneColumns.slice(1));
        }
    }

    return { contactData, contactCustomData, hasContactData, additionalPhones };
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== "MANAGER") {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        // Accept multipart/form-data only (no JSON body) to avoid loading full CSV in memory
        const contentType = req.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json(
                { success: false, error: "Content-Type doit être multipart/form-data" },
                { status: 400 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const listIdParam = formData.get("listId") as string | null;
        const missionIdParam = formData.get("missionId") as string | null;
        const listName = formData.get("listName") as string | null;
        const mappingsStr = formData.get("mappings") as string | null;
        const importType = (formData.get("importType") as string) || "companies-contacts";
        const totalRowsStr = formData.get("totalRows") as string | null;
        const totalRows = totalRowsStr ? parseInt(totalRowsStr, 10) : null;
        const importActionsStr = formData.get("importActions") as string | null;
        const actionColumnMappingStr = formData.get("actionColumnMapping") as string | null;
        const actionColumnModeStr = formData.get("actionColumnMode") as string | null;
        const actionColumnGroupsStr = formData.get("actionColumnGroups") as string | null;
        const statusMappingsStr = formData.get("statusMappings") as string | null;
        const channelMappingsStr = formData.get("channelMappings") as string | null;
        const whenAlreadyWorkedOn = (formData.get("whenAlreadyWorkedOn") as string) || "add_anyway";
        const assignedSdrIdParam = (formData.get("assignedSdrId") as string | null)?.trim() || null;

        if (!file || !mappingsStr) {
            return NextResponse.json(
                { success: false, error: "Données manquantes (file, mappings)" },
                { status: 400 }
            );
        }
        const addToExistingList = !!listIdParam?.trim();
        if (addToExistingList) {
            if (!listIdParam?.trim()) {
                return NextResponse.json(
                    { success: false, error: "listId requis pour ajouter à une liste existante" },
                    { status: 400 }
                );
            }
        } else {
            if (!missionIdParam?.trim() || !listName?.trim()) {
                return NextResponse.json(
                    { success: false, error: "Données manquantes (missionId et listName pour une nouvelle liste)" },
                    { status: 400 }
                );
            }
        }

        let mappings: { csvColumn: string; targetField: string }[];
        try {
            mappings = JSON.parse(mappingsStr) as { csvColumn: string; targetField: string }[];
        } catch {
            return NextResponse.json(
                { success: false, error: "mappings invalide (JSON attendu)" },
                { status: 400 }
            );
        }

        const importActions = importActionsStr === "true";
        let actionColumnMapping: {
            statusColumn?: string;
            dateColumn?: string;
            callbackDateColumn?: string;
            noteColumn?: string;
            channelColumn?: string;
        } | null = null;
        let actionColumnMode: ActionColumnMode = "single";
        let actionColumnGroups: ActionColumnGroup[] = [];
        let statusMappings: { csvValue: string; actionResult: ActionResult; count: number }[] = [];
        let channelMappings: { csvValue: string; channel: "CALL" | "EMAIL" | "LINKEDIN"; count: number }[] = [];

        if (actionColumnMappingStr) {
            try {
                actionColumnMapping = JSON.parse(actionColumnMappingStr) as typeof actionColumnMapping;
            } catch {
                actionColumnMapping = null;
            }
        }
        if (statusMappingsStr) {
            try {
                statusMappings = JSON.parse(statusMappingsStr) as typeof statusMappings;
            } catch {
                statusMappings = [];
            }
        }
        if (channelMappingsStr) {
            try {
                channelMappings = JSON.parse(channelMappingsStr) as typeof channelMappings;
            } catch {
                channelMappings = [];
            }
        }
        if (actionColumnModeStr === "multi-column") {
            actionColumnMode = "multi-column";
        }
        if (actionColumnGroupsStr) {
            try {
                const parsed = JSON.parse(actionColumnGroupsStr) as ActionColumnGroup[];
                actionColumnGroups = Array.isArray(parsed) ? parsed : [];
            } catch {
                actionColumnGroups = [];
            }
        }

        let assignedSdrId = session.user.id;
        if (assignedSdrIdParam) {
            const assignee = await prisma.user.findFirst({
                where: {
                    id: assignedSdrIdParam,
                    isActive: true,
                    role: { in: ["SDR", "BUSINESS_DEVELOPER"] },
                },
                select: { id: true },
            });
            if (!assignee) {
                return NextResponse.json(
                    { success: false, error: "SDR d'assignation invalide" },
                    { status: 400 }
                );
            }
            assignedSdrId = assignee.id;
        }

        let list: { id: string; missionId: string };
        let missionId: string;

        if (addToExistingList) {
            const existingList = await prisma.list.findUnique({
                where: { id: listIdParam!.trim() },
                select: { id: true, missionId: true },
            });
            if (!existingList) {
                return NextResponse.json(
                    { success: false, error: "Liste existante non trouvée" },
                    { status: 404 }
                );
            }
            list = existingList;
            missionId = existingList.missionId;
        } else {
            const mission = await prisma.mission.findUnique({
                where: { id: missionIdParam! },
            });
            if (!mission) {
                return NextResponse.json(
                    { success: false, error: "Mission non trouvée" },
                    { status: 404 }
                );
            }
            missionId = missionIdParam!;
            const created = await prisma.list.create({
                data: {
                    name: listName!,
                    type: "CLIENT",
                    source: "CSV Import",
                    missionId,
                    importConfig: {
                        importType,
                        mappings,
                        importedAt: new Date().toISOString(),
                        actionHistory: {
                            importActions,
                            actionColumnMapping,
                                actionColumnMode,
                                actionColumnGroups,
                            statusMappings,
                            channelMappings,
                        },
                    },
                },
            });
            list = created;
        }

        let companiesCreated = 0;
        let contactsCreated = 0;
        let actionsCreated = 0;
        const errors: string[] = [];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const send = (obj: object) => {
                    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
                };
                try {
                    const fileStream = file.stream();
                    const lineIterator = streamToLines(fileStream);
                    let first = true;
                    let headers: string[] = [];
                    let delimiter = ",";
                    let lineBuffer: string[] = [];
                    let globalRowIndex = 0;

                    for await (const line of lineIterator) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        if (first) {
                            first = false;
                            delimiter = detectDelimiter(trimmed);
                            headers = parseCSVLine(trimmed, delimiter).map((h) => h.replace(/^"|"$/g, ""));
                            continue;
                        }

                        lineBuffer.push(trimmed);
                        if (lineBuffer.length >= BATCH_SIZE) {
                            const rows = parseBatch(lineBuffer, headers, delimiter, globalRowIndex);
                            globalRowIndex += rows.length;
                            const { companies: batchCompanies, contacts: batchContacts, actions: batchActions, errs } =
                                await processBatch(
                                    list.id,
                                    rows,
                                    mappings,
                                    importType,
                                    {
                                        importActions,
                                        actionColumnMapping,
                                        actionColumnMode,
                                        actionColumnGroups,
                                        statusMappings,
                                        channelMappings,
                                        missionId,
                                        sdrId: assignedSdrId,
                                        whenAlreadyWorkedOn: addToExistingList ? (whenAlreadyWorkedOn === "skip" ? "skip" : "add_anyway") : "add_anyway",
                                    }
                                );
                            companiesCreated += batchCompanies;
                            contactsCreated += batchContacts;
                            actionsCreated += batchActions;
                            errors.push(...errs);
                            lineBuffer = [];
                            const percent =
                                totalRows != null && totalRows > 0
                                    ? Math.min(100, Math.round((globalRowIndex / totalRows) * 100))
                                    : null;
                            send({ type: "progress", percent, processed: globalRowIndex });
                        }
                    }

                    if (lineBuffer.length > 0) {
                        const rows = parseBatch(lineBuffer, headers, delimiter, globalRowIndex);
                        globalRowIndex += rows.length;
                        const { companies: batchCompanies, contacts: batchContacts, actions: batchActions, errs } =
                            await processBatch(
                                list.id,
                                rows,
                                mappings,
                                importType,
                                {
                                    importActions,
                                    actionColumnMapping,
                                    actionColumnMode,
                                    actionColumnGroups,
                                    statusMappings,
                                    channelMappings,
                                    missionId,
                                    sdrId: assignedSdrId,
                                    whenAlreadyWorkedOn: addToExistingList ? (whenAlreadyWorkedOn === "skip" ? "skip" : "add_anyway") : "add_anyway",
                                }
                            );
                        companiesCreated += batchCompanies;
                        contactsCreated += batchContacts;
                        actionsCreated += batchActions;
                        errors.push(...errs);
                        send({ type: "progress", percent: 100, processed: globalRowIndex });
                    }

                    send({
                        type: "done",
                        data: {
                            listId: list.id,
                            companiesCreated,
                            contactsCreated,
                            actionsCreated,
                            errors: errors.length,
                            errorDetails: errors.slice(0, 10),
                        },
                    });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Erreur lors de l'import";
                    console.error("CSV import error:", err);
                    send({ type: "error", error: message });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: { "Content-Type": "application/x-ndjson" },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Erreur lors de l'import";
        console.error("CSV import error:", error);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}

/** Process one batch of rows with batched DB queries (same business rules as before). */
async function processBatch(
    listId: string,
    rows: { rowIndex: number; row: Record<string, string> }[],
    mappings: { csvColumn: string; targetField: string }[],
    importType: string,
    options?: {
        importActions: boolean;
        actionColumnMode?: ActionColumnMode;
        actionColumnGroups?: ActionColumnGroup[];
        actionColumnMapping: {
            statusColumn?: string;
            dateColumn?: string;
            callbackDateColumn?: string;
            noteColumn?: string;
            channelColumn?: string;
        } | null;
        statusMappings: { csvValue: string; actionResult: ActionResult; count: number }[];
        channelMappings: { csvValue: string; channel: "CALL" | "EMAIL" | "LINKEDIN"; count: number }[];
        missionId: string | null;
        sdrId: string;
        whenAlreadyWorkedOn?: "skip" | "add_anyway";
    }
): Promise<{ companies: number; contacts: number; actions: number; errs: string[] }> {
    const errs: string[] = [];
    let companiesCreated = 0;
    let contactsCreated = 0;
    let actionsCreated = 0;

    // 1) Build parsed rows with company/contact extraction (same validation as before)
    type RowInfo = {
        rowIndex: number;
        row: Record<string, string>;
        companyData: Record<string, string>;
        companyCustomData: Record<string, string>;
        companyName: string;
        contactData?: Record<string, string>;
        contactCustomData?: Record<string, string>;
        contactAdditionalPhones?: string[];
        companyAdditionalPhones?: string[];
    };
    const validRows: RowInfo[] = [];

    for (const { rowIndex, row } of rows) {
        const {
            companyData,
            companyCustomData,
            hasCompanyData,
            additionalPhones: companyAdditionalPhones,
        } = extractCompanyFromRow(row, mappings);
        if (!hasCompanyData || !companyData.name) {
            errs.push(`Ligne ${rowIndex + 1}: Nom de société manquant`);
            continue;
        }
        const info: RowInfo = {
            rowIndex,
            row,
            companyData,
            companyCustomData,
            companyName: companyData.name,
            companyAdditionalPhones,
        };
        if (importType === "companies-contacts") {
            const {
                contactData,
                contactCustomData,
                hasContactData,
                additionalPhones: contactAdditionalPhones,
            } = extractContactFromRow(row, mappings);
            if (hasContactData && (contactData.email || contactData.firstName || contactData.lastName)) {
                info.contactData = contactData;
                info.contactCustomData = contactCustomData;
                info.contactAdditionalPhones = contactAdditionalPhones;
            }
        }
        validRows.push(info);
    }

    const uniqueNames = [...new Set(validRows.map((r) => r.companyName))];
    const uniqueNormalizedNames = [...new Set(uniqueNames.map((n) => normalizeCompanyName(n)))];
    const skipAlreadyWorked = options?.whenAlreadyWorkedOn === "skip";

    // 2) Preload existing companies for this list and batch names (and action count when skipping "already worked")
    const existingCompanies = await prisma.company.findMany({
        where: { listId },
        select: { id: true, name: true, _count: { select: { actions: true } } },
    });
    const companyMap = new Map<string, { id: string; hasActions: boolean }>();
    for (const c of existingCompanies) {
        companyMap.set(normalizeCompanyName(c.name), {
            id: c.id,
            hasActions: (c._count?.actions ?? 0) > 0,
        });
    }

    // When "skip": exclude company names that already have actions from this batch (no new company, no new contacts)
    const namesToConsider = skipAlreadyWorked
        ? uniqueNormalizedNames.filter((n) => {
            const existing = companyMap.get(n);
            return !existing || !existing.hasActions;
        })
        : uniqueNormalizedNames;

    // 3) Create missing companies: merge duplicate company rows so later rows can
    // fill missing phone/custom data instead of losing them when the first row is sparse.
    const namesToCreate = namesToConsider.filter((n) => !companyMap.has(n));
    const companyPayloadByName = new Map<
        string,
        {
            companyData: Record<string, string>;
            companyCustomData: Record<string, string>;
            companyAdditionalPhones: string[];
        }
    >();
    for (const r of validRows) {
        const companyKey = normalizeCompanyName(r.companyName);
        if (companyMap.has(companyKey)) {
            continue;
        }

        const existingPayload = companyPayloadByName.get(companyKey);
        if (!existingPayload) {
            companyPayloadByName.set(companyKey, {
                companyData: r.companyData,
                companyCustomData: r.companyCustomData,
                companyAdditionalPhones: r.companyAdditionalPhones ?? [],
            });
            continue;
        }

        for (const [key, value] of Object.entries(r.companyData)) {
            if (!existingPayload.companyData[key] && value) {
                existingPayload.companyData[key] = value;
            }
        }

        for (const [key, value] of Object.entries(r.companyCustomData)) {
            if (!existingPayload.companyCustomData[key] && value) {
                existingPayload.companyCustomData[key] = value;
            }
        }

        if (r.companyAdditionalPhones && r.companyAdditionalPhones.length > 0) {
            existingPayload.companyAdditionalPhones.push(...r.companyAdditionalPhones);
        }
    }

    // Create missing companies in batch (avoids long sequential DB calls and Vercel 300s timeouts)
    if (namesToCreate.length > 0) {
        const companiesCreateData = namesToCreate
            .map((name) => {
                const payload = companyPayloadByName.get(name);
                if (!payload) return null;
                const { companyData, companyCustomData, companyAdditionalPhones } = payload;

                // Normalize company phone: allow multiple numbers in one cell, separated by ; or ,
                let companyPhone: string | null = null;
                let companyExtraPhones: string[] = [];
                if (companyData.phone) {
                    const parts = splitPhoneValues(companyData.phone);
                    if (parts.length > 0) {
                        companyPhone = parts[0];
                        if (parts.length > 1) companyExtraPhones = parts.slice(1);
                    }
                }

                const extraFromColumns = companyAdditionalPhones.flatMap((raw) =>
                    splitPhoneValues(raw)
                );
                if (!companyPhone && extraFromColumns.length > 0) {
                    companyPhone = extraFromColumns[0];
                    companyExtraPhones.push(...extraFromColumns.slice(1));
                } else {
                    companyExtraPhones.push(...extraFromColumns);
                }

                const normalizedCompanyExtraPhones = Array.from(
                    new Set(companyExtraPhones.filter((p) => !companyPhone || p !== companyPhone))
                );

                const createData: Record<string, unknown> = {
                    name: companyData.name,
                    industry: companyData.industry || null,
                    country: companyData.country || null,
                    website: companyData.website || null,
                    size: companyData.size || null,
                    listId,
                };

                if (companyPhone) (createData as Record<string, unknown>).phone = companyPhone;

                const customData: Record<string, unknown> = { ...companyCustomData };
                if (normalizedCompanyExtraPhones.length > 0) {
                    customData.additionalPhones = normalizedCompanyExtraPhones;
                }
                if (Object.keys(customData).length > 0) createData.customData = customData;

                return createData as Parameters<typeof prisma.company.createMany>[0]["data"][number];
            })
            .filter(Boolean);

        if (companiesCreateData.length > 0) {
            const created = await prisma.company.createMany({
                data: companiesCreateData,
            });
            companiesCreated += created.count;

            // Fetch inserted IDs so contacts/actions can link to the right company.
            const createdCompanies = await prisma.company.findMany({
                where: {
                    listId,
                    name: { in: uniqueNames },
                },
                select: { id: true, name: true },
            });
            for (const c of createdCompanies) {
                // hasActions=false for newly created records in this batch
                companyMap.set(normalizeCompanyName(c.name), { id: c.id, hasActions: false });
            }
        }
    }


    // 4) Contacts: preload existing for all companies in this batch (same dedup as original: email OR firstName+lastName)
    const companyIds = [...companyMap.values()].map((c) => c.id);
    const existingContacts = await prisma.contact.findMany({
        where: { companyId: { in: companyIds } },
        select: { companyId: true, email: true, firstName: true, lastName: true },
    });
    const existingContactKeys = new Set<string>();
    for (const c of existingContacts) {
        const normalizedExistingEmail = normalizeEmail(c.email);
        if (normalizedExistingEmail) {
            existingContactKeys.add(`${c.companyId}:email:${normalizedExistingEmail}`);
        }
        if (c.firstName != null || c.lastName != null) {
            existingContactKeys.add(
                `${c.companyId}:name:${normalizePersonName(c.firstName)}:${normalizePersonName(c.lastName)}`
            );
        }
    }

    const contactExists = (companyId: string, email: string | null, firstName: string | null, lastName: string | null) =>
        (!!normalizeEmail(email) && existingContactKeys.has(`${companyId}:email:${normalizeEmail(email)}`)) ||
        existingContactKeys.has(
            `${companyId}:name:${normalizePersonName(firstName)}:${normalizePersonName(lastName)}`
        );

    const contactsToCreate: {
        companyId: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        additionalPhones?: string[] | undefined;
        title: string | null;
        linkedin: string | null;
        customData: Record<string, string> | undefined;
    }[] = [];

    for (const r of validRows) {
        const company = companyMap.get(normalizeCompanyName(r.companyName));
        if (!company || !r.contactData) continue;
        if (skipAlreadyWorked && company.hasActions) continue;
        const cd = r.contactData;
        const email = cd.email || null;
        const firstName = cd.firstName || null;
        const lastName = cd.lastName || null;
        if (contactExists(company.id, email, firstName, lastName)) continue;
        // Mark as seen for this batch (avoid duplicate contacts within batch)
        const normalizedEmail = normalizeEmail(email);
        if (normalizedEmail) existingContactKeys.add(`${company.id}:email:${normalizedEmail}`);
        existingContactKeys.add(
            `${company.id}:name:${normalizePersonName(firstName)}:${normalizePersonName(lastName)}`
        );
        // Normalize contact phone: allow multiple numbers in one cell, separated by ; or ,
        let phone: string | null = null;
        let additionalPhones: string[] = [];
        if (cd.phone) {
            const parts = cd.phone
                .split(/[;,]/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
            if (parts.length > 0) {
                phone = parts[0];
                if (parts.length > 1) {
                    additionalPhones = parts.slice(1);
                }
            }
        }

        // Also merge additional phones coming from separately mapped columns
        if (r.contactAdditionalPhones && r.contactAdditionalPhones.length > 0) {
            const extraFromColumns = r.contactAdditionalPhones
                .flatMap((raw) =>
                    raw
                        .split(/[;,]/)
                        .map((p) => p.trim())
                        .filter((p) => p.length > 0)
                );
            additionalPhones = [...additionalPhones, ...extraFromColumns];
        }

        // Deduplicate additional phones and ensure they don't include the primary phone
        const additionalSet = new Set(
            additionalPhones.filter((p) => !phone || p !== phone)
        );
        const normalizedAdditionalPhones = Array.from(additionalSet);

        contactsToCreate.push({
            companyId: company.id,
            firstName,
            lastName,
            email,
            phone,
            additionalPhones:
                normalizedAdditionalPhones.length > 0 ? normalizedAdditionalPhones : undefined,
            title: cd.title || null,
            linkedin: cd.linkedin || null,
            customData:
                r.contactCustomData && Object.keys(r.contactCustomData).length > 0 ? r.contactCustomData : undefined,
        });
    }

    if (contactsToCreate.length > 0) {
        await prisma.contact.createMany({
            data: contactsToCreate.map((c) => ({
                companyId: c.companyId,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                phone: c.phone,
                title: c.title,
                linkedin: c.linkedin,
                // Compute completeness at import time so the queue and stats are immediately accurate
                status: calculateContactCompleteness({
                    firstName: c.firstName,
                    lastName: c.lastName,
                    title: c.title,
                    email: c.email,
                    phone: c.phone,
                    linkedin: c.linkedin,
                }),
                ...(c.additionalPhones ? { additionalPhones: c.additionalPhones } : {}),
                ...(c.customData ? { customData: c.customData } : {}),
            })),
        });
        contactsCreated = contactsToCreate.length;

        // Update company statuses to reflect newly imported contacts
        const affectedCompanyIds = [...new Set(contactsToCreate.map((c) => c.companyId))];
        const contactsByCompany = await prisma.contact.findMany({
            where: { companyId: { in: affectedCompanyIds } },
            select: { companyId: true, status: true },
        });
        const statusByCompany = new Map<string, 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE'>();
        for (const row of contactsByCompany) {
            const prev = statusByCompany.get(row.companyId) ?? 'INCOMPLETE';
            if (row.status === 'ACTIONABLE') statusByCompany.set(row.companyId, 'ACTIONABLE');
            else if (row.status === 'PARTIAL' && prev !== 'ACTIONABLE') statusByCompany.set(row.companyId, 'PARTIAL');
            else if (!statusByCompany.has(row.companyId)) statusByCompany.set(row.companyId, 'INCOMPLETE');
        }
        if (statusByCompany.size > 0) {
            await Promise.all(
                [...statusByCompany.entries()].map(([companyId, status]) =>
                    prisma.company.update({ where: { id: companyId }, data: { status } })
                )
            );
        }
    }

    // 5) Actions: create historical actions if configured
    const shouldCreateActions =
        options &&
        options.importActions &&
        (
            (options.actionColumnMode === "multi-column" &&
                !!options.actionColumnGroups?.some((g) => !!g.statusColumn)) ||
            (options.actionColumnMode !== "multi-column" &&
                options.actionColumnMapping &&
                !!options.actionColumnMapping.statusColumn)
        ) &&
        options.statusMappings &&
        options.statusMappings.length > 0;

    if (shouldCreateActions && options) {
        const actionColumnMapping = options.actionColumnMapping;
        const actionColumnMode: ActionColumnMode = options.actionColumnMode === "multi-column" ? "multi-column" : "single";
        const actionColumnGroups: ActionColumnGroup[] = options.actionColumnGroups ?? [];
        const { statusMappings, channelMappings, sdrId } = options;

        // Reload contacts with IDs so we can link actions
        const allContacts = await prisma.contact.findMany({
            where: { companyId: { in: companyIds } },
            select: { id: true, companyId: true, email: true, firstName: true, lastName: true },
        });
        const contactIdByKey = new Map<string, string>();
        for (const c of allContacts) {
            const normalizedEmail = normalizeEmail(c.email);
            const emailKey = normalizedEmail ? `${c.companyId}:email:${normalizedEmail}` : null;
            const nameKey = `${c.companyId}:name:${normalizePersonName(c.firstName)}:${normalizePersonName(c.lastName)}`;
            if (emailKey && !contactIdByKey.has(emailKey)) contactIdByKey.set(emailKey, c.id);
            if (!contactIdByKey.has(nameKey)) contactIdByKey.set(nameKey, c.id);
        }

        const findContactIdForRow = (companyId: string, rowInfo: RowInfo): string | undefined => {
            const cd = rowInfo.contactData;
            if (!cd) return undefined;
            const email = normalizeEmail(cd.email);
            const firstName = normalizePersonName(cd.firstName);
            const lastName = normalizePersonName(cd.lastName);
            if (email) {
                const key = `${companyId}:email:${email}`;
                const id = contactIdByKey.get(key);
                if (id) return id;
            }
            const nameKey = `${companyId}:name:${firstName}:${lastName}`;
            return contactIdByKey.get(nameKey);
        };

        const actionsToCreate: {
            contactId?: string | null;
            companyId: string;
            sdrId: string;
            campaignId: string;
            channel: "CALL" | "EMAIL" | "LINKEDIN";
            result: ActionResult;
            note?: string | null;
            createdAt?: Date;
            callbackDate?: Date;
        }[] = [];

        const normalizeMappingValue = (value: string): string => value.trim().toLowerCase();

        const statusMap = new Map<string, ActionResult>();
        for (const m of statusMappings) {
            if (m.actionResult) {
                statusMap.set(normalizeMappingValue(m.csvValue), m.actionResult);
            }
        }
        const channelMap = new Map<string, "CALL" | "EMAIL" | "LINKEDIN">();
        for (const m of channelMappings) {
            channelMap.set(normalizeMappingValue(m.csvValue), m.channel);
        }

        const statusColumn = actionColumnMapping?.statusColumn;
        const dateColumn = actionColumnMapping?.dateColumn;
        const callbackDateColumn = actionColumnMapping?.callbackDateColumn;
        const noteColumn = actionColumnMapping?.noteColumn;
        const channelColumn = actionColumnMapping?.channelColumn;

        const defaultChannel: "CALL" | "EMAIL" | "LINKEDIN" = "CALL";

        // Determine or create campaign for this import (one per list)
        let campaignName = "Historique import";
        const listWithMission = await prisma.list.findUnique({
            where: { id: listId },
            select: {
                missionId: true,
                mission: { select: { name: true } },
            },
        });
        campaignName = listWithMission?.mission?.name?.trim() || campaignName;
        let campaignId: string | null = null;
        if (listWithMission?.missionId) {
            const existingCampaign = await prisma.campaign.findFirst({
                where: {
                    missionId: listWithMission.missionId,
                    name: campaignName,
                },
                select: { id: true },
            });
            if (existingCampaign) {
                campaignId = existingCampaign.id;
            } else {
                const createdCampaign = await prisma.campaign.create({
                    data: {
                        missionId: listWithMission.missionId,
                        name: campaignName,
                        icp: "Import CSV historique",
                        pitch: "Campagne générée automatiquement pour l'import d'historique d'actions depuis un CSV.",
                        isActive: true,
                    },
                    select: { id: true },
                });
                campaignId = createdCampaign.id;
            }
        }

        if (campaignId) {
            for (const info of validRows) {
                const company = companyMap.get(normalizeCompanyName(info.companyName));
                if (!company) continue;

                const statuses = actionColumnMode === "multi-column"
                    ? actionColumnGroups
                        .map((g) => (g.statusColumn ? (info.row[g.statusColumn] ?? "").trim() : ""))
                        .filter((v) => v.length > 0)
                    : (statusColumn ? splitMultiActionCell(info.row[statusColumn]) : []);
                if (statuses.length === 0) continue;
                const dateValues = actionColumnMode === "multi-column"
                    ? actionColumnGroups
                        .map((g) => (g.dateColumn ? (info.row[g.dateColumn] ?? "").trim() : ""))
                        .filter((v) => v.length > 0)
                    : (dateColumn ? splitMultiActionCell(info.row[dateColumn]) : []);
                const callbackDateValues = actionColumnMode === "multi-column"
                    ? actionColumnGroups
                        .map((g) => (g.callbackDateColumn ? (info.row[g.callbackDateColumn] ?? "").trim() : ""))
                        .filter((v) => v.length > 0)
                    : (callbackDateColumn ? splitMultiActionCell(info.row[callbackDateColumn]) : []);
                const noteValues = actionColumnMode === "multi-column"
                    ? actionColumnGroups
                        .map((g) => (g.noteColumn ? (info.row[g.noteColumn] ?? "").trim() : ""))
                        .filter((v) => v.length > 0)
                    : (noteColumn ? splitMultiActionCell(info.row[noteColumn]) : []);
                const channelValues = actionColumnMode === "multi-column"
                    ? actionColumnGroups
                        .map((g) => (g.channelColumn ? (info.row[g.channelColumn] ?? "").trim() : ""))
                        .filter((v) => v.length > 0)
                    : (channelColumn ? splitMultiActionCell(info.row[channelColumn]) : []);
                const contactId = findContactIdForRow(company.id, info);

                for (let i = 0; i < statuses.length; i++) {
                    const result = statusMap.get(normalizeMappingValue(statuses[i]));
                    if (!result) continue;

                    let channel: "CALL" | "EMAIL" | "LINKEDIN" = defaultChannel;
                    const rawChannel = channelValues[i] ?? channelValues[0];
                    if (rawChannel) {
                        const mapped = channelMap.get(normalizeMappingValue(rawChannel));
                        if (mapped) channel = mapped;
                    }

                    let createdAt: Date | undefined;
                    const rawDate = dateValues[i] ?? dateValues[0];
                    if (rawDate) {
                        const parsed = parseCsvDate(rawDate);
                        if (parsed) createdAt = parsed;
                    }

                    const rawNote = noteValues[i] ?? noteValues[0];
                    const note = rawNote?.trim() ? rawNote.trim() : undefined;

                    let callbackDate: Date | undefined;
                    const rawCallbackDate = callbackDateValues[i] ?? callbackDateValues[0];
                    if (rawCallbackDate) {
                        const parsedCallback = parseCsvDate(rawCallbackDate);
                        if (parsedCallback) callbackDate = parsedCallback;
                    }

                    // Backward-compatible fallback when no explicit callback date is provided
                    if (!callbackDate && (result === "MEETING_BOOKED" || result === "CALLBACK_REQUESTED" || result === "MEETING_CANCELLED")) {
                        callbackDate = createdAt;
                    }

                    actionsToCreate.push({
                        companyId: company.id,
                        contactId: contactId ?? null,
                        sdrId,
                        campaignId,
                        channel,
                        result,
                        note: note ?? null,
                        createdAt,
                        callbackDate,
                    });
                }
            }

            if (actionsToCreate.length > 0) {
                await prisma.action.createMany({
                    data: actionsToCreate,
                });
                actionsCreated = actionsToCreate.length;
            }
        }
    }

    return { companies: companiesCreated, contacts: contactsCreated, actions: actionsCreated, errs };
}

/**
 * Parse CSV date values coming from customer files.
 * - Supporte d'abord les formats français usuels: JJ/MM/AAAA, JJ/MM/AA, JJ/MM/AAAA HH:MM.
 * - Sinon, retombe sur le parser natif (ISO, RFC, etc.).
 */
function parseCsvDate(raw: string): Date | undefined {
    const value = raw.trim();
    if (!value) return undefined;

    // Format français classique: 31/12/2025 ou 31-12-2025, avec éventuellement une heure " 14:30"
    const frMatch = value.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/
    );
    if (frMatch) {
        const day = parseInt(frMatch[1], 10);
        const month = parseInt(frMatch[2], 10);
        let year = parseInt(frMatch[3], 10);
        const hours = frMatch[4] ? parseInt(frMatch[4], 10) : 0;
        const minutes = frMatch[5] ? parseInt(frMatch[5], 10) : 0;

        if (year < 100) {
            // 2 chiffres -> bascule simple sur 2000+
            year = 2000 + year;
        }

        if (
            Number.isNaN(day) ||
            Number.isNaN(month) ||
            Number.isNaN(year) ||
            day < 1 ||
            day > 31 ||
            month < 1 ||
            month > 12
        ) {
            return undefined;
        }

        const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
        if (Number.isNaN(d.getTime())) return undefined;
        return d;
    }

    // Fallback: laisser le moteur JS gérer (ISO, US, etc.)
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
}
