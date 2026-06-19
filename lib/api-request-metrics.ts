import { prisma } from "@/lib/prisma";

const MAX_ENDPOINT_LENGTH = 500;
const MAX_METHOD_LENGTH = 10;
const MAX_PROVIDER_LENGTH = 80;

let metricWritesDisabled = false;
let missingTableWarningLogged = false;

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.pathname.substring(0, MAX_ENDPOINT_LENGTH);
  } catch {
    return endpoint.substring(0, MAX_ENDPOINT_LENGTH);
  }
}

function isMissingMetricTableError(error: unknown): boolean {
  const maybeError = error as { code?: unknown; message?: unknown; meta?: { modelName?: unknown; table?: unknown } };
  const message = typeof maybeError?.message === "string" ? maybeError.message : "";
  const table = typeof maybeError?.meta?.table === "string" ? maybeError.meta.table : "";
  const modelName = typeof maybeError?.meta?.modelName === "string" ? maybeError.meta.modelName : "";

  return (
    maybeError?.code === "P2021" ||
    modelName === "ApiRequestDailyMetric" ||
    table.includes("ApiRequestDailyMetric") ||
    message.includes("ApiRequestDailyMetric") ||
    message.includes("public.ApiRequestDailyMetric")
  );
}

function emptyExternalApiCallSummary(date = startOfUtcDay()) {
  return {
    date: date.toISOString().slice(0, 10),
    totalCalls: 0,
    failedCalls: 0,
    topEndpoints: [],
    failedRequests: [],
  };
}

export async function logExternalApiCallMetric(
  provider: string,
  endpoint: string,
  method: string,
  statusCode: number,
): Promise<void> {
  if (metricWritesDisabled || process.env.EXTERNAL_API_METRICS_DISABLED === "1") return;

  const date = startOfUtcDay();
  const normalizedProvider = provider.substring(0, MAX_PROVIDER_LENGTH);
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedMethod = method.substring(0, MAX_METHOD_LENGTH);
  const now = new Date();

  try {
    await prisma.apiRequestDailyMetric.upsert({
      where: {
        date_provider_endpoint_method_statusCode: {
          date,
          provider: normalizedProvider,
          endpoint: normalizedEndpoint,
          method: normalizedMethod,
          statusCode,
        },
      },
      create: {
        date,
        provider: normalizedProvider,
        endpoint: normalizedEndpoint,
        method: normalizedMethod,
        statusCode,
        count: 1,
        lastSeenAt: now,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
      },
    });
  } catch (error) {
    if (isMissingMetricTableError(error)) {
      metricWritesDisabled = true;
      if (!missingTableWarningLogged) {
        missingTableWarningLogged = true;
        console.warn(
          "External API call metrics disabled: ApiRequestDailyMetric table is missing. Run the Prisma migration 20260512150000_add_api_request_daily_metrics to re-enable metrics.",
        );
      }
      return;
    }
    console.error("Failed to log external API call metric:", error);
  }
}

export async function getTodayExternalApiCallSummary() {
  const today = startOfUtcDay();

  if (metricWritesDisabled || process.env.EXTERNAL_API_METRICS_DISABLED === "1") {
    return emptyExternalApiCallSummary(today);
  }

  let rows;
  try {
    rows = await prisma.apiRequestDailyMetric.findMany({
      where: { date: today },
      orderBy: { count: "desc" },
    });
  } catch (error) {
    if (isMissingMetricTableError(error)) {
      metricWritesDisabled = true;
      return emptyExternalApiCallSummary(today);
    }
    throw error;
  }

  const totalCalls = rows.reduce((sum, row) => sum + row.count, 0);
  const failedCalls = rows
    .filter((row) => row.statusCode >= 400)
    .reduce((sum, row) => sum + row.count, 0);

  const endpointTotals = new Map<string, { provider: string; endpoint: string; method: string; count: number }>();
  for (const row of rows) {
    const key = `${row.provider} ${row.method} ${row.endpoint}`;
    const existing = endpointTotals.get(key);
    if (existing) {
      existing.count += row.count;
    } else {
      endpointTotals.set(key, {
        provider: row.provider,
        endpoint: row.endpoint,
        method: row.method,
        count: row.count,
      });
    }
  }

  return {
    date: today.toISOString().slice(0, 10),
    totalCalls,
    failedCalls,
    topEndpoints: Array.from(endpointTotals.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    failedRequests: rows
      .filter((row) => row.statusCode >= 400)
      .slice(0, 5)
      .map((row) => ({
        provider: row.provider,
        endpoint: row.endpoint,
        method: row.method,
        statusCode: row.statusCode,
        count: row.count,
      })),
  };
}
