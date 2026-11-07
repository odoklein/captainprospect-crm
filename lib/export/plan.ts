// ============================================
// DATA EXPORT PLAN (pure) — which tables and columns leave the instance, and
// how a row becomes a CSV line. No database, no Prisma import: tests and the
// runner feed it the Prisma DMMF models.
//
// Rule: business data in, credentials and security logs out. An agency that
// leaves (or is deleted) takes its prospects, calls, emails, invoices, planning
// and settings; it does not take password hashes, OAuth tokens, API keys,
// session or login logs, or the internal AI run traces.
// ============================================

/** Models never exported (credentials, sessions, security and AI internals). */
export const EXCLUDED_MODELS: Record<string, string> = {
    UserSession: "sessions",
    AuthEvent: "journal de connexion",
    AuthEventView: "journal de connexion",
    PasswordResetToken: "jetons de réinitialisation",
    ApiKey: "clés d'API",
    ApiKeyUsageLog: "journal des clés d'API",
    ApiRequestDailyMetric: "métriques techniques",
    VaultCredential: "identifiants chiffrés",
    VaultAuditEvent: "journal du coffre",
    ClientCalCredential: "identifiants Cal",
    EmailAccount: "identifiants de messagerie",
    MessagingWorkspace: "jetons de messagerie",
    MessagingOutbox: "file technique",
    MessagingInboundEvent: "file technique",
    AssistantRun: "traces internes de l'assistant",
    AssistantEvidence: "traces internes de l'assistant",
    AssistantActionLog: "traces internes de l'assistant",
};

/** Columns never exported, whatever the table. */
export const SENSITIVE_COLUMN = /password|token(?!s?used|expiry)|secret|apikey|api_key|keyhash|encrypted|credential|private_?key/i;

export type ExportField = { name: string; kind: string; type: string; isList?: boolean; dbName?: string | null; isId?: boolean };
export type ExportModel = { name: string; dbName?: string | null; fields: readonly ExportField[] };

export type TablePlan = {
    model: string;
    table: string;
    columns: { name: string; sql: string }[];
    orderBy: string[];
    droppedColumns: string[];
};

export type ExportPlan = {
    tables: TablePlan[];
    excludedModels: { model: string; reason: string }[];
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdent(name: string): string {
    if (!IDENT.test(name)) throw new Error(`unsafe_identifier:${name}`);
    return `"${name}"`;
}

export function planExport(models: readonly ExportModel[]): ExportPlan {
    const tables: TablePlan[] = [];
    const excludedModels: ExportPlan["excludedModels"] = [];
    for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
        if (EXCLUDED_MODELS[model.name]) {
            excludedModels.push({ model: model.name, reason: EXCLUDED_MODELS[model.name] });
            continue;
        }
        const columns: TablePlan["columns"] = [];
        const droppedColumns: string[] = [];
        for (const f of model.fields) {
            // Relations are not columns; Bytes columns are binary blobs, not data an agency can read.
            if (f.kind !== "scalar" && f.kind !== "enum") continue;
            if (f.type === "Bytes") continue;
            if (SENSITIVE_COLUMN.test(f.name)) {
                droppedColumns.push(f.name);
                continue;
            }
            columns.push({ name: f.name, sql: quoteIdent(f.dbName ?? f.name) });
        }
        if (columns.length === 0) continue;
        const ids = model.fields.filter((f) => f.isId).map((f) => f.dbName ?? f.name);
        tables.push({
            model: model.name,
            table: quoteIdent(model.dbName ?? model.name),
            columns,
            orderBy: ids.map(quoteIdent),
            droppedColumns,
        });
    }
    return { tables, excludedModels };
}

// ---------- CSV ----------

/** One cell. Dates as ISO, JSON and arrays as JSON text, null as empty. */
export function csvCell(value: unknown): string {
    let s: string;
    if (value == null) return "";
    else if (value instanceof Date) s = Number.isNaN(value.getTime()) ? "" : value.toISOString();
    else if (typeof value === "bigint") s = value.toString();
    else if (typeof value === "object") s = value.constructor?.name === "Decimal" ? String(value) : JSON.stringify(value);
    else s = String(value);
    // Spreadsheet formula injection: a cell starting with = + - @ or a control char is read as a formula.
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s) && !/^\+\d[\d\s]*$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: unknown[]): string {
    return cells.map(csvCell).join(",") + "\r\n";
}

/** UTF-8 BOM so Excel opens accents correctly. */
export const CSV_BOM = "﻿";
