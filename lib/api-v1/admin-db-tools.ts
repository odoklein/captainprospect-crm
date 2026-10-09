import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Ctx } from "./serializers";
import type { ToolDef } from "./mcp-tools";
import { ApiError } from "./errors";
import { parseInput } from "./input";

// All 138 Prisma model names
const MODEL_NAMES = Object.keys(Prisma.ModelName) as (keyof typeof Prisma.ModelName)[];
const MODEL_LOOKUP = new Map<string, string>(MODEL_NAMES.map((m) => [m.toLowerCase(), m]));

// Model classification into functional CRM domains
const DOMAIN_MAP: Record<string, string[]> = {
  core_crm: ["Client", "ClientInterlocuteur", "Mission", "Campaign", "List", "Company", "Contact", "Opportunity", "Action", "Exclusion"],
  telephony_enrichment: ["IncomingCall", "PhoneEnrichmentLookup", "CompanyEnrichmentLookup", "LeexiCallImport"],
  outreach_messaging: [
    "Mailbox",
    "EmailSequence",
    "EmailSequenceStep",
    "EmailSequenceEnrollment",
    "EmailThread",
    "Email",
    "EmailAttachment",
    "EmailAnalyticsDaily",
    "CommsChannel",
    "CommsGroup",
    "CommsGroupMember",
    "CommsThread",
    "CommsMessage",
  ],
  planning_hr: [
    "ScheduleBlock",
    "MissionPlan",
    "MissionPlanSdr",
    "MissionMonthPlan",
    "SdrDayAllocation",
    "SdrMonthCapacity",
    "SdrAbsence",
    "SdrDayOverride",
    "PlanningConflict",
    "PlanningHoliday",
    "HrProfile",
    "HrProfileSnapshot",
    "HrMonthRecord",
    "HrDayDecisionRecord",
  ],
  billing_finance: ["BillingClient", "Invoice", "InvoiceItem", "InvoicePayment", "InvoiceAuditLog", "Engagement", "CompanyIssuer", "OffreTarif"],
  ai_intelligence: ["WeeklyAnalysis", "AssistantConversation", "AssistantMessage", "AssistantArtifact", "AssistantActionLog"],
  support_tickets: ["Ticket", "TicketComment", "TicketHistory", "TicketReleaseCheck", "SupportConversation", "SupportMessage"],
  audit_security: ["User", "UserSession", "AuthEvent", "AuthEventView", "AuditEvent", "ApiKey", "ApiKeyUsageLog", "RolePermission", "UserPermission"],
};

// Sensitive fields that MUST be redacted for security compliance
const SENSITIVE_FIELDS = new Set([
  "password",
  "passwordHash",
  "keyHash",
  "token",
  "resetToken",
  "refreshToken",
  "sessionToken",
  "vaultCredential",
  "secret",
]);

/** Recursively redact sensitive authentication secrets */
export function redactSensitive<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (data instanceof Date) return data.toISOString() as unknown as T;
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(redactSensitive) as unknown as T;

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(k)) {
      clean[k] = "[REDACTED_SECRET]";
    } else if (v && typeof v === "object") {
      clean[k] = redactSensitive(v);
    } else {
      clean[k] = v;
    }
  }
  return clean as T;
}

function resolveModel(inputName: string): string {
  const resolved = MODEL_LOOKUP.get(inputName.trim().toLowerCase());
  if (!resolved) {
    throw new ApiError(
      404,
      "table_not_found",
      `Table '${inputName}' does not exist. Call 'admin_db_overview' to see all 138 available tables.`,
    );
  }
  return resolved;
}

function getDelegate(db: PrismaClient, modelName: string): any {
  const prop = (modelName.charAt(0).toLowerCase() + modelName.slice(1)) as keyof PrismaClient;
  const delegate = db[prop];
  if (!delegate) {
    throw new ApiError(500, "delegate_missing", `Prisma delegate for '${modelName}' not found.`);
  }
  return delegate;
}

function tool<S extends z.ZodRawShape>(
  def: Omit<ToolDef, "shape" | "run"> & { shape: S; run: (ctx: Ctx, input: z.infer<z.ZodObject<S>>) => Promise<unknown> },
): ToolDef {
  return { ...def, run: (ctx, args) => def.run(ctx, parseInput(def.shape, args)) };
}

export const ADMIN_DB_TOOLS: ToolDef[] = [
  // ============================================
  // 1. OVERVIEW: All 138 tables with counts and domains
  // ============================================
  tool({
    name: "admin_db_overview",
    description:
      "SUPER-ADMINISTRATOR ONLY: Complete census of all 138 database tables in the CRM, categorized by domain (core_crm, billing, outreach, planning, ai, security) with live record counts.",
    scope: null,
    shape: {},
    run: async ({ db, p }) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const tableCounts: Record<string, number> = {};
      await Promise.all(
        MODEL_NAMES.map(async (m) => {
          try {
            const delegate = getDelegate(db, m);
            if (typeof delegate.count === "function") {
              tableCounts[m] = await delegate.count();
            } else {
              tableCounts[m] = -1;
            }
          } catch {
            tableCounts[m] = -1;
          }
        }),
      );

      const domainBreakdown: Record<string, Record<string, number>> = {};
      const categorized = new Set<string>();

      for (const [domain, models] of Object.entries(DOMAIN_MAP)) {
        domainBreakdown[domain] = {};
        for (const m of models) {
          if (m in tableCounts) {
            domainBreakdown[domain][m] = tableCounts[m];
            categorized.add(m);
          }
        }
      }

      domainBreakdown.other_modules = {};
      for (const m of MODEL_NAMES) {
        if (!categorized.has(m)) {
          domainBreakdown.other_modules[m] = tableCounts[m] ?? 0;
        }
      }

      return {
        total_tables: MODEL_NAMES.length,
        domains: domainBreakdown,
        usage_instructions: "Use 'admin_db_inspect' to view fields/types of any table, and 'admin_db_query' to fetch data.",
      };
    },
  }),

  // ============================================
  // 2. INSPECT: Full schema of any model
  // ============================================
  tool({
    name: "admin_db_inspect",
    description:
      "SUPER-ADMINISTRATOR ONLY: Inspect the schema, column types, required fields, relations, primary key, and indexes of ANY of the 138 tables.",
    scope: null,
    shape: {
      table: z.string().describe("Table name (e.g. 'User', 'Action', 'Invoice', 'ScheduleBlock', 'WeeklyAnalysis')"),
    },
    run: async ({ p }, { table }) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const resolved = resolveModel(table);
      const modelMeta = Prisma.dmmf?.datamodel?.models?.find((m) => m.name === resolved);
      if (!modelMeta) {
        throw new ApiError(404, "not_found", `Schema definition for table '${resolved}' not found.`);
      }

      return {
        table: modelMeta.name,
        primary_key: modelMeta.primaryKey?.name ?? "id",
        unique_constraints: modelMeta.uniqueFields,
        fields: modelMeta.fields.map((f) => ({
          name: f.name,
          type: f.type,
          kind: f.kind, // 'scalar' | 'object' (relation) | 'enum'
          is_required: f.isRequired,
          is_list: f.isList,
          is_id: f.isId,
          is_unique: f.isUnique,
          is_relation: f.kind === "object",
          relation_to: f.type,
          relation_from_fields: f.relationFromFields,
          relation_to_fields: f.relationToFields,
          has_default: f.hasDefaultValue,
        })),
      };
    },
  }),

  // ============================================
  // 3. QUERY: Universal query engine across all 138 tables
  // ============================================
  tool({
    name: "admin_db_query",
    description:
      "SUPER-ADMINISTRATOR ONLY: Query ANY of the 138 tables with full Prisma filters, relational joins (include/select), sorting, and pagination. Sensitive secrets (passwords/hashes) are automatically redacted.",
    scope: null,
    shape: {
      table: z.string().describe("Table name (e.g. 'User', 'Action', 'Company', 'Invoice', 'WeeklyAnalysis')"),
      where: z.record(z.string(), z.unknown()).optional().describe("Prisma WHERE filter as JSON, e.g. {'role': 'SDR', 'isActive': true}"),
      select: z.record(z.string(), z.unknown()).optional().describe("Optional Prisma SELECT object to project specific fields"),
      include: z.record(z.string(), z.unknown()).optional().describe("Optional Prisma INCLUDE object to join related models"),
      order_by: z.record(z.string(), z.unknown()).optional().describe("Prisma ORDER BY as JSON, e.g. {'createdAt': 'desc'}"),
      limit: z.coerce.number().int().min(1).max(100).default(50).describe("Max records to return (1-100, default 50)"),
      offset: z.coerce.number().int().min(0).default(0).describe("Skip offset for pagination"),
    },
    run: async ({ db, p }, input) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const resolved = resolveModel(input.table);
      const delegate = getDelegate(db, resolved);

      const queryArgs: Record<string, unknown> = {
        take: input.limit,
        skip: input.offset,
      };

      if (input.where) queryArgs.where = input.where;
      if (input.order_by) queryArgs.orderBy = input.order_by;
      if (input.select) queryArgs.select = input.select;
      else if (input.include) queryArgs.include = input.include;

      const [rows, totalMatching] = await Promise.all([
        delegate.findMany(queryArgs),
        delegate.count(input.where ? { where: input.where } : undefined),
      ]);

      return {
        table: resolved,
        total_matching: totalMatching,
        returned: rows.length,
        offset: input.offset,
        limit: input.limit,
        has_more: input.offset + rows.length < totalMatching,
        data: redactSensitive(rows),
      };
    },
  }),

  // ============================================
  // 4. GET RECORD: Single record with relations by ID
  // ============================================
  tool({
    name: "admin_db_get_record",
    description:
      "SUPER-ADMINISTRATOR ONLY: Fetch a specific record by primary key (ID) from ANY of the 138 tables, with optional relational inclusion.",
    scope: null,
    shape: {
      table: z.string().describe("Table name (e.g. 'User', 'Action', 'Company', 'Mission')"),
      id: z.string().min(1).max(100).describe("Primary key ID of the record"),
      include: z.record(z.string(), z.unknown()).optional().describe("Optional Prisma INCLUDE object to fetch relations"),
    },
    idArg: "id",
    run: async ({ db, p }, { table, id, include }) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const resolved = resolveModel(table);
      const delegate = getDelegate(db, resolved);

      const row = await delegate.findUnique({
        where: { id },
        ...(include ? { include } : {}),
      });

      if (!row) {
        throw new ApiError(404, "record_not_found", `Record with id '${id}' not found in table '${resolved}'.`);
      }

      return {
        table: resolved,
        id,
        record: redactSensitive(row),
      };
    },
  }),

  // ============================================
  // 5. AGGREGATE: GroupBy & Metrics (sum, avg, count)
  // ============================================
  tool({
    name: "admin_db_aggregate",
    description:
      "SUPER-ADMINISTRATOR ONLY: Compute aggregations (count, sum, avg, min, max, groupBy) on any table across the entire database.",
    scope: null,
    shape: {
      table: z.string().describe("Table name (e.g. 'Action', 'Invoice', 'TaskTimeEntry')"),
      where: z.record(z.string(), z.unknown()).optional().describe("Prisma WHERE filter as JSON"),
      group_by: z.array(z.string()).optional().describe("Optional list of fields to group by"),
      count: z.boolean().default(true).describe("Compute count"),
      sum: z.record(z.string(), z.boolean()).optional().describe("Numeric fields to sum, e.g. {'totalTtc': true}"),
      avg: z.record(z.string(), z.boolean()).optional().describe("Numeric fields to average"),
      min: z.record(z.string(), z.boolean()).optional().describe("Fields for min value"),
      max: z.record(z.string(), z.boolean()).optional().describe("Fields for max value"),
    },
    run: async ({ db, p }, input) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const resolved = resolveModel(input.table);
      const delegate = getDelegate(db, resolved);

      if (input.group_by && input.group_by.length > 0) {
        const result = await delegate.groupBy({
          by: input.group_by,
          where: input.where,
          _count: input.count ? { _all: true } : undefined,
          _sum: input.sum,
          _avg: input.avg,
          _min: input.min,
          _max: input.max,
        });
        return { table: resolved, grouped_by: input.group_by, groups_count: result.length, data: result };
      }

      const result = await delegate.aggregate({
        where: input.where,
        _count: input.count ? { _all: true } : undefined,
        _sum: input.sum,
        _avg: input.avg,
        _min: input.min,
        _max: input.max,
      });

      return { table: resolved, metrics: result };
    },
  }),

  // ============================================
  // 6. RAW SQL: Read-only query execution
  // ============================================
  tool({
    name: "admin_db_sql",
    description:
      "SUPER-ADMINISTRATOR ONLY: Execute parameterized read-only raw SQL queries (SELECT or WITH only) across the entire database. Destructive statements are strictly rejected.",
    scope: null,
    shape: {
      sql: z.string().trim().min(5).max(10_000).describe("Read-only SQL query starting with SELECT or WITH"),
      params: z.array(z.unknown()).optional().describe("Optional array of parameter values for $1, $2, etc."),
    },
    run: async ({ db, p }, { sql, params }) => {
      if (!p.allClients) {
        throw new ApiError(403, "forbidden", "Requires super-administrator privileges (all-clients key).");
      }

      const normalized = sql.trim().toLowerCase();
      if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
        throw new ApiError(400, "invalid_query", "Only SELECT and WITH read-only queries are permitted.");
      }

      const forbiddenWords = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "truncate",
        "create",
        "grant",
        "revoke",
        "execute",
        "exec",
      ];

      for (const word of forbiddenWords) {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (regex.test(sql)) {
          throw new ApiError(400, "forbidden_keyword", `The SQL keyword '${word.toUpperCase()}' is forbidden.`);
        }
      }

      const rows = params && params.length > 0 ? await db.$queryRawUnsafe(sql, ...params) : await db.$queryRawUnsafe(sql);

      return {
        query_executed: sql,
        row_count: Array.isArray(rows) ? rows.length : 1,
        data: redactSensitive(rows),
      };
    },
  }),
];
