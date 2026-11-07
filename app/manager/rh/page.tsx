"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { FOCUS_RING } from "@/components/ui/recipes";
import {
  FilterSelect,
  HubHeader,
  HubTabs,
  Metric,
  MetricPlaceholder,
  MetricStrip,
  Panel,
  PanelMessage,
  PanelToolbar,
  RefreshBar,
  SearchField,
  SkeletonRows,
  TextButton,
  ToolbarScroller,
  useSlashFocus,
} from "@/components/hr/HubUI";
import { ContractType, HrMonthRowData, HrMonthStatus } from "@/lib/hr/hr-types";
import {
  STATUS_LABELS,
  currentParisMonth,
  formatEuros,
  formatMonthLabel,
  isLockedStatus,
  planBulkTransition,
  shiftMonth,
} from "@/lib/hr/hr-rules";
import { buildPayrollCsv, downloadCsv } from "@/lib/hr/hr-export";
import { HrProfileModal } from "@/components/hr/HrProfileModal";
import { HrCalculationDetailModal } from "@/components/hr/HrCalculationDetailModal";
import { HrStatusModal } from "@/components/hr/HrStatusModal";
import { HrHelpTip } from "@/components/hr/HrHelpTip";
import { HrGuide, useHrGuide } from "@/components/hr/HrGuide";
import { HR_PAGE_GUIDE, HR_PAGE_GUIDE_KEY } from "@/components/hr/hr-guide-steps";

type Notice = { tone: "success" | "warning" | "error"; title: string; lines?: string[] };

type BulkResult = {
  updated: number;
  skipped: number;
  failed: number;
  results: { name: string; outcome: "updated" | "skipped" | "failed"; message?: string }[];
};

type SortKey = "name" | "status" | "alerts" | "days" | "calls" | "total";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_FILTERS = {
  search: "",
  role: "SDR",
  manager: "ALL",
  contract: "ALL",
  status: "ALL",
  attentionOnly: false,
};

const STATUS_FLOW: HrMonthStatus[] = [
  HrMonthStatus.DRAFT,
  HrMonthStatus.TO_VERIFY,
  HrMonthStatus.VALIDATED,
  HrMonthStatus.PAID,
];

const STATUS_STYLES: Record<HrMonthStatus, string> = {
  DRAFT: "bg-surface-3 text-ink-2 border-line",
  TO_VERIFY: "bg-warning-soft text-warning-ink border-warning-line",
  VALIDATED: "bg-primary-50 text-primary-700 border-primary-200",
  PAID: "bg-success-soft text-success-ink border-success-line",
};

const STATUS_BAR: Record<HrMonthStatus, string> = {
  DRAFT: "bg-line-strong",
  TO_VERIFY: "bg-warning",
  VALIDATED: "bg-primary-500",
  PAID: "bg-success",
};

const ROLE_LABELS: Record<string, string> = { SDR: "SDR", MANAGER: "Manager", BOOKER: "Booker" };

function needsAttention(r: HrMonthRowData) {
  return !r.hasProfile || r.pendingDecisionCount > 0 || r.isStale;
}

function attentionScore(r: HrMonthRowData) {
  return (r.hasProfile ? 0 : 1000) + r.pendingDecisionCount * 10 + (r.isStale ? 1 : 0);
}

function compareRows(a: HrMonthRowData, b: HrMonthRowData, key: SortKey): number {
  switch (key) {
    case "name":
      return a.userName.localeCompare(b.userName, "fr");
    case "status":
      return STATUS_FLOW.indexOf(a.status) - STATUS_FLOW.indexOf(b.status) || Number(Boolean(a.id)) - Number(Boolean(b.id));
    case "alerts":
      return attentionScore(a) - attentionScore(b);
    case "days":
      return a.workingDays - b.workingDays;
    case "calls":
      return a.totalCalls - b.totalCalls;
    case "total":
      return a.totalAmountCents - b.totalAmountCents;
  }
}

const BULK_ACTIONS: { status: HrMonthStatus; label: string; confirm: boolean }[] = [
  { status: HrMonthStatus.TO_VERIFY, label: "Passer « À vérifier »", confirm: false },
  { status: HrMonthStatus.VALIDATED, label: "Valider", confirm: true },
  { status: HrMonthStatus.PAID, label: "Marquer payé", confirm: true },
];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

export default function HrPage() {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <HrPageContent />
    </Suspense>
  );
}

function HrPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const thisMonth = useMemo(() => currentParisMonth(), []);
  const [month, setMonth] = useState(() => {
    const fromUrl = searchParams.get("month");
    return fromUrl && /^\d{4}-(0[1-9]|1[0-2])$/.test(fromUrl) && fromUrl <= thisMonth ? fromUrl : thisMonth;
  });
  const [rows, setRows] = useState<HrMonthRowData[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBulkCalculating, setIsBulkCalculating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlan, setBulkPlan] = useState<{ status: HrMonthStatus; label: string } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [statusUserId, setStatusUserId] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchRows = useCallback(async (targetMonth: string) => {
    const seq = ++requestSeq.current;
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/months?month=${encodeURIComponent(targetMonth)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Impossible de charger les données RH.");
      if (seq !== requestSeq.current) return;
      setRows(json.data.rows || []);
      setLoadedMonth(targetMonth);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError((err as Error).message || "Impossible de charger les données RH.");
    } finally {
      if (seq === requestSeq.current) setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(month);
  }, [month, fetchRows]);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // "/" jumps to search, like most list tools.
  useSlashFocus(searchRef);

  const refresh = () => fetchRows(month);

  const goToMonth = (target: string) => {
    setSelected(new Set());
    setMonth(target);
    router.replace(target === thisMonth ? "/manager/rh" : `/manager/rh?month=${target}`, { scroll: false });
  };

  const changeMonth = (delta: number) => goToMonth(shiftMonth(month, delta));

  const handleBulkRecalculate = async () => {
    setIsBulkCalculating(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/hr/months/calculate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Le recalcul a échoué.");
      const r = json.data as BulkResult;
      const others = r.results.filter((x) => x.outcome !== "updated");
      setNotice({
        tone: r.failed > 0 ? "error" : r.skipped > 0 ? "warning" : "success",
        title: `${r.updated} dossier(s) mis à jour${r.skipped ? ` · ${r.skipped} ignoré(s)` : ""}${
          r.failed ? ` · ${r.failed} en erreur` : ""
        }`,
        lines: others.map((x) => `${x.name} — ${x.message ?? (x.outcome === "failed" ? "Erreur" : "Ignoré")}`),
      });
      await fetchRows(month);
    } catch (err) {
      setNotice({ tone: "error", title: (err as Error).message || "Le recalcul a échoué." });
    } finally {
      setIsBulkCalculating(false);
    }
  };

  const availableManagers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.managerId && r.managerName && map.set(r.managerId, r.managerName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const roleRows = useMemo(
    () => rows.filter((r) => filters.role === "ALL" || r.userRole === filters.role),
    [rows, filters.role]
  );

  // Everything except the step filter: the pipeline counts from this.
  const baseRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return roleRows.filter((r) => {
      if (q && !r.userName.toLowerCase().includes(q) && !r.userEmail.toLowerCase().includes(q)) return false;
      if (filters.manager !== "ALL" && r.managerId !== filters.manager) return false;
      if (filters.contract !== "ALL" && r.contractType !== filters.contract) return false;
      if (filters.attentionOnly && !needsAttention(r)) return false;
      return true;
    });
  }, [roleRows, filters.search, filters.manager, filters.contract, filters.attentionOnly]);

  const visibleRows = useMemo(() => {
    const list = filters.status === "ALL" ? baseRows : baseRows.filter((r) => r.status === filters.status);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => compareRows(a, b, sort.key) * dir || a.userName.localeCompare(b.userName, "fr"));
  }, [baseRows, filters.status, sort]);

  const summary = useMemo(() => {
    let pay = 0;
    let calls = 0;
    let rdv = 0;
    let fixed = 0;
    let variable = 0;
    visibleRows.forEach((r) => {
      pay += r.totalAmountCents;
      calls += r.totalCalls;
      rdv += r.totalRdv;
      fixed += r.fixedAmountCents;
      variable += r.variableAmountCents;
    });
    return { count: visibleRows.length, pay, calls, rdv, fixed, variable };
  }, [visibleRows]);

  const pipeline = useMemo(() => {
    const byStatus = Object.fromEntries(STATUS_FLOW.map((s) => [s, { count: 0, cents: 0 }])) as Record<
      HrMonthStatus,
      { count: number; cents: number }
    >;
    let unsaved = 0;
    let cents = 0;
    baseRows.forEach((r) => {
      byStatus[r.status].count++;
      byStatus[r.status].cents += r.totalAmountCents;
      cents += r.totalAmountCents;
      if (!r.id) unsaved++;
    });
    const locked = byStatus.VALIDATED.count + byStatus.PAID.count;
    return { byStatus, unsaved, cents, total: baseRows.length, lockedPct: baseRows.length ? Math.round((locked / baseRows.length) * 100) : 0 };
  }, [baseRows]);

  const attentionCount = useMemo(() => roleRows.filter(needsAttention).length, [roleRows]);

  const filtersActive =
    filters.search !== "" ||
    filters.manager !== "ALL" ||
    filters.contract !== "ALL" ||
    filters.status !== "ALL" ||
    filters.attentionOnly;

  const setFilter = <K extends keyof typeof DEFAULT_FILTERS>(key: K, value: (typeof DEFAULT_FILTERS)[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  // Selection only keeps people still on screen.
  const selectedRows = useMemo(() => visibleRows.filter((r) => selected.has(r.userId)), [visibleRows, selected]);
  const allVisibleSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const someSelected = selectedRows.length > 0 && !allVisibleSelected;

  const toggleRow = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visibleRows.map((r) => r.userId)));

  const exportRows = (list: HrMonthRowData[], suffix = "") => {
    downloadCsv(`paie-${month}${suffix}.csv`, buildPayrollCsv(list, month));
    setNotice({ tone: "success", title: `${list.length} ligne(s) exportée(s). Le fichier s’ouvre directement dans Excel.` });
  };

  const plan = useMemo(() => (bulkPlan ? planBulkTransition(selectedRows, bulkPlan.status) : null), [bulkPlan, selectedRows]);

  const executeBulk = async (status: HrMonthStatus, p: ReturnType<typeof planBulkTransition<HrMonthRowData>>) => {
    const targets = p.eligible;
    const failures: string[] = [];
    setBulkProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      try {
        const res = await fetch(`/api/hr/months/${r.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          failures.push(`${r.userName} — ${res.status === 403 ? "droit manquant" : json.error || "erreur"}`);
        }
      } catch {
        failures.push(`${r.userName} — connexion interrompue`);
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    const ok = targets.length - failures.length;
    setNotice({
      tone: failures.length ? "error" : p.skipped.length ? "warning" : "success",
      title: `${ok} dossier(s) passé(s) en « ${STATUS_LABELS[status]} »${
        p.skipped.length ? ` · ${p.skipped.length} ignoré(s)` : ""
      }${failures.length ? ` · ${failures.length} en erreur` : ""}`,
      lines: [...failures, ...p.skipped.map((s) => `${s.row.userName} — ${s.reason}`)],
    });
    setBulkPlan(null);
    setBulkProgress(null);
    setSelected(new Set());
    await fetchRows(month);
  };

  // Safe, fully-eligible moves run straight away; anything else is confirmed first.
  const startBulk = (action: (typeof BULK_ACTIONS)[number]) => {
    const p = planBulkTransition(selectedRows, action.status);
    if (!action.confirm && p.skipped.length === 0) {
      executeBulk(action.status, p);
      return;
    }
    setBulkPlan({ status: action.status, label: action.label });
  };

  const findRow = (userId: string | null) => (userId ? rows.find((r) => r.userId === userId) : undefined);
  const statusRow = findRow(statusUserId);
  const profileRow = findRow(profileUserId);

  const detailIndex = detailUserId ? visibleRows.findIndex((r) => r.userId === detailUserId) : -1;
  const detailNav =
    detailIndex >= 0
      ? {
          position: detailIndex + 1,
          total: visibleRows.length,
          prev: visibleRows[detailIndex - 1] ? { id: visibleRows[detailIndex - 1].userId, name: visibleRows[detailIndex - 1].userName } : undefined,
          next: visibleRows[detailIndex + 1] ? { id: visibleRows[detailIndex + 1].userId, name: visibleRows[detailIndex + 1].userName } : undefined,
        }
      : undefined;

  const initialLoading = isFetching && loadedMonth === null;
  const showingStaleMonth = loadedMonth !== null && loadedMonth !== month;
  const guide = useHrGuide(HR_PAGE_GUIDE_KEY, !initialLoading && !error);

  // Nothing has loaded yet (first fetch running or failed): figures are not zeros.
  const neverLoaded = loadedMonth === null;
  const figure = (value: React.ReactNode, wide?: boolean) =>
    neverLoaded ? error ? <span className="text-ink-4">—</span> : <MetricPlaceholder wide={wide} /> : value;

  // The line under the title says what the month needs next.
  const finding = neverLoaded
    ? error
      ? "Le mois n’a pas pu être chargé."
      : "Chargement du mois…"
    : roleRows.length === 0
    ? "Personne à payer pour ce mois."
    : attentionCount > 0
    ? `${plural(attentionCount, "dossier à traiter", "dossiers à traiter")} avant de valider · ${pipeline.lockedPct} % des dossiers validés ou payés`
    : pipeline.lockedPct === 100
    ? "Tous les dossiers du mois sont validés ou payés."
    : `Rien à traiter · ${pipeline.lockedPct} % des dossiers validés ou payés`;

  const statusTabs = [
    { value: "ALL", label: "Tous", count: pipeline.total, sub: formatEuros(pipeline.cents) },
    ...STATUS_FLOW.map((s) => ({
      value: s as string,
      label: STATUS_LABELS[s],
      count: pipeline.byStatus[s].count,
      dot: STATUS_BAR[s],
      sub:
        s === HrMonthStatus.DRAFT && pipeline.unsaved > 0
          ? `${formatEuros(pipeline.byStatus[s].cents)} · ${pipeline.unsaved} non enregistré(s)`
          : formatEuros(pipeline.byStatus[s].cents),
    })),
  ];

  const rowActions = (row: HrMonthRowData, tour: (k: string) => object) => (
    <div className="flex items-center justify-end gap-0.5">
      <RowAction primary onClick={() => setDetailUserId(row.userId)} {...tour("row-detail")}>
        Détail
      </RowAction>
      <RowAction onClick={() => setProfileUserId(row.userId)} {...tour("row-rules")}>
        Règles
      </RowAction>
    </div>
  );

  const alertChips = (row: HrMonthRowData) =>
    needsAttention(row) ? (
      <div className="flex flex-wrap gap-1">
        {!row.hasProfile && (
          <AlertChip tone="danger" onClick={() => setProfileUserId(row.userId)}>
            Règles à configurer
          </AlertChip>
        )}
        {row.pendingDecisionCount > 0 && (
          <AlertChip tone="warning" onClick={() => setDetailUserId(row.userId)}>
            {row.pendingDecisionCount} j à statuer
          </AlertChip>
        )}
        {row.isStale && <AlertChip tone="info">À recalculer</AlertChip>}
      </div>
    ) : null;

  const personLine = (row: HrMonthRowData) =>
    [
      ROLE_LABELS[row.userRole] ?? row.userRole,
      row.contractType === ContractType.SALARIE ? "Salarié" : "Indépendant",
      row.managerName ? `Manager : ${row.managerName}` : "Sans manager",
    ].join(" · ");

  return (
    <div className={cn("space-y-4", selectedRows.length ? "pb-28" : "pb-2")}>
      <HubHeader
        title="Paie de l’équipe"
        finding={finding}
        beside={
          <div data-hr-tour="month" className="flex h-9 items-center rounded-[10px] border border-line bg-surface">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Mois précédent"
              className={cn("flex size-9 items-center justify-center rounded-l-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink", FOCUS_RING)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[124px] select-none px-1 text-center text-[13px] font-semibold capitalize tabular-nums text-ink" aria-live="polite">
              {formatMonthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={month >= thisMonth}
              aria-label="Mois suivant"
              title={month >= thisMonth ? "Les mois futurs ne peuvent pas encore être calculés" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-r-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent",
                FOCUS_RING
              )}
            >
              <ChevronRight className="size-4" />
            </button>
            {month !== thisMonth && (
              <button
                type="button"
                onClick={() => goToMonth(thisMonth)}
                className={cn("h-9 border-l border-line px-3 text-[12px] font-semibold text-primary-700 hover:bg-primary-50", FOCUS_RING)}
              >
                Ce mois-ci
              </button>
            )}
          </div>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              data-hr-tour="help"
              onClick={guide.start}
              aria-label="Comment ça marche ?"
              leftIcon={<CircleHelp className="size-4" />}
            >
              <span className="hidden sm:inline">Comment ça marche ?</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-hr-tour="export"
              onClick={() => exportRows(visibleRows)}
              disabled={visibleRows.length === 0}
              leftIcon={<Download className="size-4" />}
            >
              Exporter
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-hr-tour="recalculate"
              onClick={handleBulkRecalculate}
              disabled={isBulkCalculating || isFetching}
              leftIcon={<RefreshCw className={cn("size-4", isBulkCalculating && "animate-spin")} />}
            >
              {isBulkCalculating ? "Calcul en cours…" : "Recalculer le mois"}
            </Button>
          </>
        }
      />

      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}

      {/* Data from another month is still on screen: say so above it. A first load that fails says so in the list. */}
      {error && !neverLoaded && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}
              {showingStaleMonth && " Les données affichées sont celles du mois précédemment chargé."}
            </span>
          </span>
          <Button variant="secondary" size="xs" onClick={refresh} className="self-start sm:self-auto">
            Réessayer
          </Button>
        </div>
      )}

      {/* Headline figures */}
      <MetricStrip data-hr-tour="summary">
        <Metric
          lead
          label={
            <>
              Total estimé à verser
              <HrHelpTip title="Total estimé">
                <p>La somme des montants à payer des personnes affichées : fixe + primes + ajustements.</p>
                <p>C’est une estimation tant que les dossiers ne sont pas validés.</p>
              </HrHelpTip>
            </>
          }
          value={figure(formatEuros(summary.pay), true)}
          hint="Brut, avant charges"
        />
        <Metric
          label="Personnes affichées"
          value={figure(summary.count)}
          hint={neverLoaded ? undefined : `sur ${roleRows.length} au total`}
        />
        <Metric
          label="Activité du mois"
          value={figure(summary.calls.toLocaleString("fr-FR"))}
          unit={neverLoaded ? undefined : "appels"}
          hint={neverLoaded ? undefined : `${summary.rdv} rendez-vous pris (hors annulés)`}
        />
        <Metric
          data-hr-tour="attention"
          label={
            <>
              <span className={cn("size-1.5 rounded-full", neverLoaded ? "bg-line-strong" : attentionCount > 0 ? "bg-warning" : "bg-success")} aria-hidden />À traiter
            </>
          }
          value={figure(attentionCount)}
          tone={attentionCount > 0 ? "warning" : "neutral"}
          onClick={() => setFilter("attentionOnly", !filters.attentionOnly)}
          pressed={filters.attentionOnly}
          hint={
            neverLoaded
              ? undefined
              : attentionCount === 0
              ? "Rien à traiter, tout est en ordre"
              : filters.attentionOnly
              ? "Filtre actif : cliquez pour tout afficher"
              : "Cliquez pour n’afficher que ces personnes"
          }
        />
      </MetricStrip>

      {/* The list, with the month's steps as its tabs */}
      <Panel>
        <RefreshBar active={isFetching && !initialLoading} />

        <div data-hr-tour="pipeline" className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-2 pt-2">
          <HubTabs
            ariaLabel="Étapes du mois"
            tabs={statusTabs}
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
          />
          {pipeline.total > 0 && (
            <div className="mb-3 mr-3 flex min-w-[200px] items-center gap-3">
              <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                {STATUS_FLOW.map((s) =>
                  pipeline.byStatus[s].count ? (
                    <div key={s} className={STATUS_BAR[s]} style={{ width: `${(pipeline.byStatus[s].count / pipeline.total) * 100}%` }} />
                  ) : null
                )}
              </div>
              <p className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-3">
                <strong className="font-semibold tabular-nums text-ink">{pipeline.lockedPct} %</strong> validés ou payés
                <HrHelpTip title="Avancement">
                  <p>Où en sont les dossiers du mois. Cliquez sur une étape pour n’afficher que ces personnes.</p>
                </HrHelpTip>
              </p>
            </div>
          )}
        </div>

        <PanelToolbar data-hr-tour="filters">
          <SearchField ref={searchRef} value={filters.search} onChange={(v) => setFilter("search", v)} placeholder="Rechercher un nom ou un email…" />
          <ToolbarScroller>
            <FilterSelect label="Rôle" value={filters.role} onChange={(v) => setFilter("role", v)} active={filters.role !== "SDR"}>
              <option value="SDR">SDR</option>
              <option value="MANAGER">Managers</option>
              <option value="ALL">Tout le monde</option>
            </FilterSelect>
            <FilterSelect label="Manager" value={filters.manager} onChange={(v) => setFilter("manager", v)} active={filters.manager !== "ALL"}>
              <option value="ALL">Tous les managers</option>
              {availableManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Contrat" value={filters.contract} onChange={(v) => setFilter("contract", v)} active={filters.contract !== "ALL"}>
              <option value="ALL">Tous contrats</option>
              <option value={ContractType.SALARIE}>Salarié</option>
              <option value={ContractType.INDEPENDANT}>Indépendant</option>
            </FilterSelect>
            <FilterSelect
              label="Trier par"
              value={`${sort.key}:${sort.dir}`}
              onChange={(v) => {
                const [key, dir] = v.split(":");
                setSort({ key: key as SortKey, dir: dir as Sort["dir"] });
              }}
              className="md:hidden"
            >
              <option value="name:asc">Nom (A → Z)</option>
              <option value="alerts:desc">Alertes d’abord</option>
              <option value="total:desc">Montant le plus élevé</option>
              <option value="calls:desc">Plus d’appels</option>
              <option value="status:asc">Étape</option>
            </FilterSelect>
            {filtersActive && (
              <TextButton onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, role: f.role }))}>Réinitialiser</TextButton>
            )}
          </ToolbarScroller>
          <span className="ml-auto hidden text-xs tabular-nums text-ink-3 sm:block">
            {plural(visibleRows.length, "personne", "personnes")}
          </span>
        </PanelToolbar>

        {initialLoading ? (
          <SkeletonRows columns={[22, 10, 8, 14, 8, 8, 10]} />
        ) : neverLoaded && error ? (
          <PanelMessage tone="error" action={<TextButton onClick={refresh}>Réessayer</TextButton>}>
            Les dossiers de {formatMonthLabel(month)} n’ont pas pu être chargés : {error}
          </PanelMessage>
        ) : visibleRows.length === 0 ? (
          rows.length === 0 ? (
            <PanelMessage>Aucun SDR ou manager actif pour le moment.</PanelMessage>
          ) : (
            <PanelMessage
              action={filtersActive ? <TextButton onClick={() => setFilters(DEFAULT_FILTERS)}>Réinitialiser les filtres</TextButton> : undefined}
            >
              Personne ne correspond à ces filtres.
            </PanelMessage>
          )
        ) : (
          <div className={cn("transition-opacity duration-150", isFetching && "opacity-60")}>
            {/* Phones: one card per person */}
            <ul className="divide-y divide-line-subtle md:hidden">
              {visibleRows.map((row, i) => {
                const tour = (key: string) => (i === 0 ? { "data-hr-tour": key } : {});
                const isSelected = selected.has(row.userId);
                return (
                  <li key={row.userId} className={cn("space-y-3 px-4 py-4", isSelected && "bg-primary-50/50")}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.userId)}
                        aria-label={`Sélectionner ${row.userName}`}
                        className="mt-2 size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
                        {...tour("row-select")}
                      />
                      <div className="flex min-w-0 flex-1 items-start gap-2.5" {...tour("row-person")}>
                        <Avatar name={row.userName} size="sm" shape="circle" />
                        <div className="min-w-0">
                          <Link href={`/manager/rh/${row.userId}`} className="block truncate text-sm font-semibold text-ink hover:text-primary-700">
                            {row.userName}
                          </Link>
                          <p className="truncate text-xs text-ink-3">{row.managerName ? `Manager : ${row.managerName}` : "Sans manager"}</p>
                        </div>
                      </div>
                      <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-ink" {...tour("row-total")}>
                        {formatEuros(row.totalAmountCents)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-7" {...tour("row-alerts")}>
                      <StatusPill row={row} onOpen={() => setStatusUserId(row.userId)} {...tour("row-status")} />
                      {alertChips(row)}
                    </div>
                    <p className="pl-7 text-xs tabular-nums text-ink-3">
                      {row.workingDays}/{row.totalWorkingDays} j payés · {row.totalCalls.toLocaleString("fr-FR")} appels · {row.totalRdv} RDV
                    </p>
                    <div className="pl-5">{rowActions(row, tour)}</div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                <thead className="border-b border-line text-xs text-ink-3">
                  <tr>
                    <th scope="col" className="w-11 py-2.5 pl-5 pr-1">
                      <HeaderCheckbox checked={allVisibleSelected} indeterminate={someSelected} onChange={toggleAll} />
                    </th>
                    <SortHeader label="Collaborateur" sortKey="name" sort={sort} onSort={toggleSort} />
                    <th scope="col" className="px-3 py-2.5 font-medium" aria-sort={sort.key === "status" || sort.key === "alerts" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <span className="inline-flex items-center gap-1.5">
                        <SortButton label="Étape" sortKey="status" sort={sort} onSort={toggleSort} />
                        <HrHelpTip title="Les 4 étapes d’un mois">
                          <p><strong>Brouillon</strong> : le mois est en cours, les chiffres bougent.</p>
                          <p><strong>À vérifier</strong> : prêt à être relu.</p>
                          <p><strong>Validé</strong> : chiffres verrouillés pour la paie.</p>
                          <p><strong>Payé</strong> : le virement est fait.</p>
                          <p>Cliquez sur l’étape d’une personne pour la changer ou ajouter un ajustement.</p>
                        </HrHelpTip>
                        <span className="text-line-strong" aria-hidden>·</span>
                        <SortButton label="Alertes" sortKey="alerts" sort={sort} onSort={toggleSort} />
                      </span>
                    </th>
                    <SortHeader
                      label="Jours payés"
                      sortKey="days"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                      tip={
                        <HrHelpTip title="Jours payés">
                          <p>Jours ouvrés du mois (hors week-ends et jours fériés), moins les absences et les journées que vous avez décidé de ne pas payer.</p>
                        </HrHelpTip>
                      }
                    />
                    <SortHeader
                      label="Activité"
                      sortKey="calls"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                      tip={
                        <HrHelpTip title="Activité">
                          <p>Appels passés et rendez-vous pris dans le mois (heure de Paris). Les rendez-vous annulés ne comptent pas.</p>
                          <p>L’objectif est le nombre d’appels attendus par jour.</p>
                        </HrHelpTip>
                      }
                    />
                    <th scope="col" className="hidden px-3 py-2.5 text-right font-medium 2xl:table-cell">Fixe</th>
                    <th scope="col" className="hidden px-3 py-2.5 text-right font-medium 2xl:table-cell">Variable</th>
                    <SortHeader label="Total à payer" sortKey="total" sort={sort} onSort={toggleSort} align="right" />
                    <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, i) => {
                    const tour = (key: string) => (i === 0 ? { "data-hr-tour": key } : {});
                    const isSelected = selected.has(row.userId);
                    return (
                      <tr
                        key={row.userId}
                        className={cn(
                          "border-b border-line-subtle align-top transition-colors duration-100 last:border-b-0",
                          isSelected ? "bg-primary-50/60" : "hover:bg-surface-2/70"
                        )}
                      >
                        <td className="py-3.5 pl-5 pr-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.userId)}
                            aria-label={`Sélectionner ${row.userName}`}
                            className="mt-2 size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
                            {...tour("row-select")}
                          />
                        </td>

                        <td className="px-3 py-3.5" {...tour("row-person")}>
                          <div className="flex w-[210px] items-center gap-3 lg:w-[250px] 2xl:w-[280px]">
                            <Avatar name={row.userName} size="sm" shape="circle" />
                            <div className="min-w-0">
                              <Link
                                href={`/manager/rh/${row.userId}`}
                                className={cn("block truncate rounded-sm font-semibold text-ink hover:text-primary-700", FOCUS_RING)}
                              >
                                {row.userName}
                              </Link>
                              <p className={cn("truncate text-xs text-ink-3", !row.managerName && "italic")} title={personLine(row)}>
                                {personLine(row)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3.5">
                          <div className="flex flex-col items-start gap-1.5" {...tour("row-alerts")}>
                            <StatusPill row={row} onOpen={() => setStatusUserId(row.userId)} {...tour("row-status")} />
                            {alertChips(row)}
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                          <div className="font-medium text-ink">
                            {row.workingDays}
                            <span className="text-ink-3"> / {row.totalWorkingDays} j</span>
                          </div>
                          <span className={cn("block text-xs", row.absenceDays > 0 ? "text-warning-ink" : "text-ink-3")}>
                            {row.absenceDays > 0 ? `${row.absenceDays} j d’absence` : "Aucune absence"}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                          <div className="font-medium text-ink">
                            {row.totalCalls.toLocaleString("fr-FR")} <span className="font-normal text-ink-3">appels</span>
                            <span className="text-ink-4"> · </span>
                            {row.totalRdv} <span className="font-normal text-ink-3">RDV</span>
                          </div>
                          <QuotaLine row={row} />
                        </td>

                        <td className="hidden whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-ink-2 2xl:table-cell">{formatEuros(row.fixedAmountCents)}</td>
                        <td className="hidden whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-ink-2 2xl:table-cell">{formatEuros(row.variableAmountCents)}</td>

                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums" {...tour("row-total")}>
                          <span className="text-[14px] font-semibold text-ink">{formatEuros(row.totalAmountCents)}</span>
                          <span className="block text-xs text-ink-3 2xl:hidden">
                            {formatEuros(row.fixedAmountCents)} + {formatEuros(row.variableAmountCents)}
                          </span>
                          {row.adjustmentCents !== 0 && (
                            <span className="block text-xs text-primary-700" title={row.adjustmentNote ?? undefined}>
                              dont {row.adjustmentCents > 0 ? "+" : "−"}
                              {formatEuros(Math.abs(row.adjustmentCents))} d’ajustement
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right">{rowActions(row, tour)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-line bg-surface-2 text-[13px] text-ink-2">
                  <tr>
                    <td className="py-3 pl-5 pr-1" />
                    <td className="px-3 py-3 font-semibold text-ink" colSpan={3}>
                      Total · {plural(summary.count, "personne", "personnes")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {summary.calls.toLocaleString("fr-FR")} appels · {summary.rdv} RDV
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums 2xl:table-cell">{formatEuros(summary.fixed)}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums 2xl:table-cell">{formatEuros(summary.variable)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-[14px] font-semibold tabular-nums text-ink">{formatEuros(summary.pay)}</td>
                    <td className="py-3 pl-3 pr-5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* Bulk action bar */}
      {selectedRows.length > 0 && (
        <div
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-overlay animate-ds-pop sm:flex-row sm:items-center sm:justify-between"
          role="region"
          aria-label="Actions groupées"
        >
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Tout désélectionner"
              className={cn("flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink", FOCUS_RING)}
            >
              <X className="size-4" />
            </button>
            <span aria-live="polite">
              {bulkProgress ? (
                <>
                  Mise à jour… <strong className="tabular-nums text-ink">{bulkProgress.done}/{bulkProgress.total}</strong>
                </>
              ) : (
                <>
                  <strong className="text-ink">{selectedRows.length}</strong> sélectionné(s) ·{" "}
                  <strong className="tabular-nums text-ink">{formatEuros(selectedRows.reduce((s, r) => s + r.totalAmountCents, 0))}</strong>
                </>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {BULK_ACTIONS.map((a) => (
              <Button
                key={a.status}
                size="xs"
                variant={a.status === HrMonthStatus.PAID ? "success" : a.status === HrMonthStatus.VALIDATED ? "primary" : "secondary"}
                onClick={() => startBulk(a)}
                disabled={Boolean(bulkProgress)}
              >
                {a.label}
              </Button>
            ))}
            <Button size="xs" variant="ghost" onClick={() => exportRows(selectedRows, "-selection")} leftIcon={<Download className="size-3.5" />}>
              Exporter
            </Button>
          </div>
        </div>
      )}

      {/* Bulk confirmation */}
      {bulkPlan && plan && (
        <Modal
          isOpen
          onClose={() => !bulkProgress && setBulkPlan(null)}
          title={`${bulkPlan.label} : ${plan.eligible.length} dossier(s)`}
          description={formatMonthLabel(month)}
          size="md"
        >
          <div className="space-y-4 text-[13px]">
            {plan.eligible.length > 0 ? (
              <p className="leading-relaxed text-ink-2">
                {plan.eligible.length} dossier(s) pour un total de{" "}
                <strong className="tabular-nums text-ink">{formatEuros(plan.eligible.reduce((s, r) => s + r.totalAmountCents, 0))}</strong> passeront en «{" "}
                {STATUS_LABELS[bulkPlan.status]} ».
                {bulkPlan.status === HrMonthStatus.VALIDATED && " Leurs chiffres seront verrouillés."}
                {bulkPlan.status === HrMonthStatus.PAID && " À faire uniquement après le virement."}
              </p>
            ) : (
              <p className="text-ink-2">Aucun des dossiers sélectionnés ne peut passer à cette étape.</p>
            )}
            {plan.skipped.length > 0 && (
              <div className="rounded-xl border border-warning-line bg-warning-soft p-3 text-warning-ink">
                <p className="mb-1 font-semibold">{plan.skipped.length} dossier(s) ne seront pas modifiés :</p>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {plan.skipped.map((s) => (
                    <li key={s.row.userId}>
                      {s.row.userName} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-line-subtle pt-4">
              <Button variant="ghost" size="sm" onClick={() => setBulkPlan(null)} disabled={Boolean(bulkProgress)}>
                Annuler
              </Button>
              <Button
                size="sm"
                variant={bulkPlan.status === HrMonthStatus.PAID ? "success" : "primary"}
                onClick={() => executeBulk(bulkPlan.status, plan)}
                disabled={plan.eligible.length === 0 || Boolean(bulkProgress)}
              >
                {bulkProgress ? `En cours… ${bulkProgress.done}/${bulkProgress.total}` : `Confirmer (${plan.eligible.length})`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {profileUserId && (
        <HrProfileModal
          isOpen
          onClose={() => setProfileUserId(null)}
          userId={profileUserId}
          userName={profileRow?.userName ?? ""}
          onProfileSaved={() => {
            setNotice({ tone: "success", title: "Règles enregistrées. Cliquez sur « Recalculer le mois » pour les appliquer." });
            refresh();
          }}
        />
      )}

      {detailUserId && (
        <HrCalculationDetailModal
          isOpen
          onClose={() => setDetailUserId(null)}
          userId={detailUserId}
          month={month}
          onCalculationUpdated={refresh}
          onOpenRules={() => {
            setDetailUserId(null);
            setProfileUserId(detailUserId);
          }}
          navigation={detailNav}
          onNavigate={setDetailUserId}
        />
      )}

      {statusRow?.id && (
        <HrStatusModal
          isOpen
          onClose={() => setStatusUserId(null)}
          monthRecordId={statusRow.id}
          userName={statusRow.userName}
          month={month}
          currentStatus={statusRow.status}
          currentAdjustmentCents={statusRow.adjustmentCents}
          currentAdjustmentNote={statusRow.adjustmentNote ?? ""}
          baseAmountCents={statusRow.fixedAmountCents + statusRow.variableAmountCents}
          pendingDecisionCount={statusRow.pendingDecisionCount}
          isStale={statusRow.isStale}
          onStatusUpdated={(label) => {
            setNotice({ tone: "success", title: `${statusRow.userName} : dossier passé en « ${label} ».` });
            refresh();
          }}
        />
      )}

      <HrGuide steps={HR_PAGE_GUIDE} open={guide.open} onClose={guide.close} />
    </div>
  );
}

/** The step is also the control that changes it. */
function StatusPill({
  row,
  onOpen,
  ...rest
}: {
  row: HrMonthRowData;
  onOpen: () => void;
  "data-hr-tour"?: string;
}) {
  const base = "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium";
  if (!row.id) {
    return (
      <span
        {...rest}
        className={cn(base, "border-dashed border-line-strong bg-surface text-ink-3")}
        title="Cliquez d’abord sur « Recalculer le mois » pour enregistrer ce dossier"
      >
        Non enregistré
      </span>
    );
  }
  return (
    <button
      {...rest}
      type="button"
      onClick={onOpen}
      title="Changer l’étape ou ajouter un ajustement"
      className={cn(base, "transition-[filter,box-shadow] duration-150 hover:brightness-[0.97] hover:shadow-xs", FOCUS_RING, STATUS_STYLES[row.status])}
    >
      {isLockedStatus(row.status) && <Lock className="size-3" aria-hidden />}
      {STATUS_LABELS[row.status]}
      <ChevronDown className="size-3 opacity-60" aria-hidden />
    </button>
  );
}

function QuotaLine({ row }: { row: HrMonthRowData }) {
  if (row.dailyQuota <= 0 || row.totalWorkingDays <= 0) {
    return <span className="block text-xs text-ink-3">Pas d’objectif d’appels</span>;
  }
  const judgedDays = row.underQuotaDaysCount;
  const tone = judgedDays === 0 ? "text-ink-3" : judgedDays <= 2 ? "text-warning-ink" : "text-danger-ink";
  return (
    <span className={cn("block text-xs", tone)}>
      Objectif {row.dailyQuota}/j · {judgedDays === 0 ? "toujours atteint" : `${judgedDays} j sous l’objectif`}
    </span>
  );
}

/** Header sort control. On a right-aligned column the glyph leads, so the label stays flush with the figures. */
function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  iconFirst,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  iconFirst?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  const glyph = <Icon className={cn("size-3", active ? "text-ink-2" : "text-transparent group-hover:text-ink-4")} aria-hidden />;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn("group inline-flex items-center gap-1 rounded hover:text-ink", FOCUS_RING, active && "text-ink")}
    >
      {iconFirst && glyph}
      {label}
      {!iconFirst && glyph}
    </button>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  tip,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  tip?: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        <SortButton label={label} sortKey={sortKey} sort={sort} onSort={onSort} iconFirst={align === "right"} />
        {tip}
      </span>
    </th>
  );
}

function HeaderCheckbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label="Tout sélectionner"
      className="size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
    />
  );
}


function NoticeBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const tone =
    notice.tone === "success"
      ? "border-success-line bg-success-soft text-success-ink"
      : notice.tone === "warning"
      ? "border-warning-line bg-warning-soft text-warning-ink"
      : "border-danger-line bg-danger-soft text-danger-ink";
  return (
    <div role="status" className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] animate-ds-pop", tone)}>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{notice.title}</p>
        {notice.lines && notice.lines.length > 0 && (
          <ul className="max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs">
            {notice.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Fermer" className={cn("shrink-0 rounded-md p-1 hover:bg-black/5", FOCUS_RING)}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function AlertChip({
  tone,
  onClick,
  children,
}: {
  tone: "danger" | "warning" | "info";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const styles = {
    danger: "bg-danger-soft text-danger-ink border-danger-line",
    warning: "bg-warning-soft text-warning-ink border-warning-line",
    info: "bg-info-soft text-info-ink border-info-line",
  }[tone];
  const className = cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 text-[11px] font-medium", styles);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, "transition-[filter] hover:brightness-95", FOCUS_RING)}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

function RowAction({
  primary,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; "data-hr-tour"?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "h-8 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        FOCUS_RING,
        primary ? "text-primary-700 hover:bg-primary-50" : "text-ink-3 hover:bg-surface-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
