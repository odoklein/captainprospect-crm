"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  HelpCircle,
  Lock,
  Phone,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  TO_VERIFY: "bg-amber-50 text-amber-800 border-amber-200",
  VALIDATED: "bg-primary-50 text-primary-700 border-primary-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_BAR: Record<HrMonthStatus, string> = {
  DRAFT: "bg-slate-300",
  TO_VERIFY: "bg-amber-400",
  VALIDATED: "bg-primary-500",
  PAID: "bg-emerald-500",
};

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

export default function HrPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    visibleRows.forEach((r) => {
      pay += r.totalAmountCents;
      calls += r.totalCalls;
      rdv += r.totalRdv;
    });
    return { count: visibleRows.length, pay, calls, rdv };
  }, [visibleRows]);

  const pipeline = useMemo(() => {
    const byStatus = Object.fromEntries(STATUS_FLOW.map((s) => [s, { count: 0, cents: 0 }])) as Record<
      HrMonthStatus,
      { count: number; cents: number }
    >;
    let unsaved = 0;
    baseRows.forEach((r) => {
      byStatus[r.status].count++;
      byStatus[r.status].cents += r.totalAmountCents;
      if (!r.id) unsaved++;
    });
    const locked = byStatus.VALIDATED.count + byStatus.PAID.count;
    return { byStatus, unsaved, total: baseRows.length, lockedPct: baseRows.length ? Math.round((locked / baseRows.length) * 100) : 0 };
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

  const rowActions = (row: HrMonthRowData, tour: (k: string) => object) => (
    <div className="flex items-center justify-end gap-1.5">
      <RowButton primary onClick={() => setDetailUserId(row.userId)} {...tour("row-detail")}>
        Détail
      </RowButton>
      <RowButton onClick={() => setProfileUserId(row.userId)} {...tour("row-rules")}>
        Règles
      </RowButton>
      <RowButton
        onClick={() => setStatusUserId(row.userId)}
        disabled={!row.id}
        title={row.id ? "Changer l’étape ou ajouter un ajustement" : "Cliquez d’abord sur « Recalculer le mois » pour enregistrer ce dossier"}
        {...tour("row-status")}
      >
        Statut
      </RowButton>
    </div>
  );

  const alertChips = (row: HrMonthRowData) => (
    <div className="flex flex-wrap gap-1">
      {!row.hasProfile && (
        <AlertChip tone="rose" onClick={() => setProfileUserId(row.userId)}>
          Règles à configurer
        </AlertChip>
      )}
      {row.pendingDecisionCount > 0 && (
        <AlertChip tone="amber" onClick={() => setDetailUserId(row.userId)}>
          {row.pendingDecisionCount} j à statuer
        </AlertChip>
      )}
      {row.isStale && <AlertChip tone="sky">À recalculer</AlertChip>}
      {!needsAttention(row) && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />OK</span>}
    </div>
  );

  return (
    <div className={`space-y-5 ${selectedRows.length ? "pb-24" : ""}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">Paie de l’équipe</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Jours travaillés, objectifs d’appels, salaire fixe, primes et validation mensuelle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-hr-tour="help"
            onClick={guide.start}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <HelpCircle className="h-3.5 w-3.5 text-primary-600" />
            Comment ça marche ?
          </button>

          <div data-hr-tour="month" className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Mois précédent" className="rounded-lg p-1.5 text-slate-600 hover:bg-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[130px] px-3 py-1 text-center text-xs font-semibold capitalize text-slate-800" aria-live="polite">
              {formatMonthLabel(month)}
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={month >= thisMonth}
              aria-label="Mois suivant"
              title={month >= thisMonth ? "Les mois futurs ne peuvent pas encore être calculés" : undefined}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {month !== thisMonth && (
              <button type="button" onClick={() => goToMonth(thisMonth)} className="ml-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary-700 hover:bg-white">
                Ce mois-ci
              </button>
            )}
          </div>

          <button
            type="button"
            data-hr-tour="export"
            onClick={() => exportRows(visibleRows)}
            disabled={visibleRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter
          </button>

          <button
            type="button"
            data-hr-tour="recalculate"
            onClick={handleBulkRecalculate}
            disabled={isBulkCalculating || isFetching}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBulkCalculating ? "animate-spin" : ""}`} />
            {isBulkCalculating ? "Calcul en cours…" : "Recalculer le mois"}
          </button>
        </div>
      </div>

      {/* Notices */}
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-xs ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{notice.title}</p>
            {notice.lines && notice.lines.length > 0 && (
              <ul className="max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4">
                {notice.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer" className="shrink-0 rounded p-0.5 hover:bg-black/5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
            {showingStaleMonth && " Les données affichées sont celles du mois précédemment chargé."}
          </span>
          <button type="button" onClick={refresh} className="self-start rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
            Réessayer
          </button>
        </div>
      )}

      {/* Summary */}
      <div data-hr-tour="summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4 text-primary-500" />} label="Personnes affichées" value={String(summary.count)} hint={`sur ${roleRows.length} au total`} />
        <SummaryCard
          icon={<CreditCard className="h-4 w-4 text-emerald-500" />}
          label={
            <span className="inline-flex items-center gap-1">
              Total estimé à verser
              <HrHelpTip title="Total estimé">
                <p>La somme des montants à payer des personnes affichées : fixe + primes + ajustements.</p>
                <p>C’est une estimation tant que les dossiers ne sont pas validés.</p>
              </HrHelpTip>
            </span>
          }
          value={formatEuros(summary.pay)}
          valueClass="text-emerald-700"
          hint="Brut, avant charges"
        />
        <SummaryCard
          icon={<Phone className="h-4 w-4 text-blue-500" />}
          label="Activité du mois"
          value={`${summary.calls.toLocaleString("fr-FR")} appels`}
          hint={`${summary.rdv} rendez-vous pris (hors annulés)`}
        />
        <button
          type="button"
          data-hr-tour="attention"
          onClick={() => setFilter("attentionOnly", !filters.attentionOnly)}
          aria-pressed={filters.attentionOnly}
          className={`rounded-xl border p-4 text-left shadow-xs transition-colors ${
            attentionCount > 0
              ? filters.attentionOnly
                ? "border-amber-400 bg-amber-100"
                : "border-amber-200 bg-amber-50 hover:bg-amber-100"
              : "border-slate-200/80 bg-white"
          }`}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>À traiter</span>
            {attentionCount > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <p className={`text-2xl font-bold ${attentionCount > 0 ? "text-amber-800" : "text-slate-900"}`}>{attentionCount}</p>
          <span className="mt-1 block text-[11px] text-slate-500">
            {attentionCount === 0
              ? "Rien à traiter, tout est en ordre"
              : filters.attentionOnly
              ? "Filtre actif : cliquez pour tout afficher"
              : "Cliquez pour n’afficher que ces personnes"}
          </span>
        </button>
      </div>

      {/* Month progress */}
      {!initialLoading && pipeline.total > 0 && (
        <div data-hr-tour="pipeline" className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-slate-700">
              Avancement du mois
              <HrHelpTip title="Avancement">
                <p>Où en sont les dossiers du mois. Cliquez sur une étape pour n’afficher que ces personnes.</p>
              </HrHelpTip>
            </p>
            <p className="text-[11px] text-slate-500">
              <strong className="text-slate-800">{pipeline.lockedPct} %</strong> des dossiers validés ou payés
            </p>
          </div>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {STATUS_FLOW.map((s) =>
              pipeline.byStatus[s].count ? (
                <div key={s} className={STATUS_BAR[s]} style={{ width: `${(pipeline.byStatus[s].count / pipeline.total) * 100}%` }} />
              ) : null
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUS_FLOW.map((s, i) => {
              const active = filters.status === s;
              const bucket = pipeline.byStatus[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter("status", active ? "ALL" : s)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    active ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                    <span className={`h-2 w-2 rounded-full ${STATUS_BAR[s]}`} />
                    {i + 1}. {STATUS_LABELS[s]}
                  </span>
                  <span className="mt-0.5 block text-lg font-bold tabular-nums text-slate-900">{bucket.count}</span>
                  <span className="block text-[10px] tabular-nums text-slate-400">
                    {formatEuros(bucket.cents)}
                    {s === HrMonthStatus.DRAFT && pipeline.unsaved > 0 && ` · ${pipeline.unsaved} non enregistré(s)`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div data-hr-tour="filters" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Rechercher</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Rechercher un nom ou un email…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <kbd className="pointer-events-none absolute right-3 top-2 hidden rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-400 sm:block">/</kbd>
        </label>
        <FilterSelect label="Rôle" value={filters.role} onChange={(v) => setFilter("role", v)}>
          <option value="SDR">SDR</option>
          <option value="MANAGER">Managers</option>
          <option value="ALL">Tout le monde</option>
        </FilterSelect>
        <FilterSelect label="Manager" value={filters.manager} onChange={(v) => setFilter("manager", v)}>
          <option value="ALL">Tous les managers</option>
          {availableManagers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Contrat" value={filters.contract} onChange={(v) => setFilter("contract", v)}>
          <option value="ALL">Tous contrats</option>
          <option value={ContractType.SALARIE}>Salarié</option>
          <option value={ContractType.INDEPENDANT}>Indépendant</option>
        </FilterSelect>
        <FilterSelect label="Étape" value={filters.status} onChange={(v) => setFilter("status", v)}>
          <option value="ALL">Toutes les étapes</option>
          {STATUS_FLOW.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Trier par" value={`${sort.key}:${sort.dir}`} onChange={(v) => { const [key, dir] = v.split(":"); setSort({ key: key as SortKey, dir: dir as Sort["dir"] }); }} className="md:hidden">
          <option value="name:asc">Nom (A → Z)</option>
          <option value="alerts:desc">Alertes d’abord</option>
          <option value="total:desc">Montant le plus élevé</option>
          <option value="calls:desc">Plus d’appels</option>
          <option value="status:asc">Étape</option>
        </FilterSelect>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, role: f.role }))}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* List */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {isFetching && !initialLoading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary-100" aria-hidden>
            <div className="h-full w-1/3 animate-pulse bg-primary-500" />
          </div>
        )}

        {initialLoading ? (
          <TableSkeleton />
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-xs text-slate-500">
            {rows.length === 0 && !error ? (
              <p>Aucun SDR ou manager actif pour le moment.</p>
            ) : (
              <>
                <p>Personne ne correspond à ces filtres.</p>
                {filtersActive && (
                  <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="font-semibold text-primary-700 hover:underline">
                    Réinitialiser les filtres
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            {/* Phones: cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {visibleRows.map((row, i) => {
                const tour = (key: string) => (i === 0 ? { "data-hr-tour": key } : {});
                return (
                  <li key={row.userId} className={`space-y-2.5 p-4 ${selected.has(row.userId) ? "bg-primary-50/40" : ""}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.userId)}
                        onChange={() => toggleRow(row.userId)}
                        aria-label={`Sélectionner ${row.userName}`}
                        className="mt-1 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        {...tour("row-select")}
                      />
                      <div className="min-w-0 flex-1" {...tour("row-person")}>
                        <Link href={`/manager/rh/${row.userId}`} className="font-semibold text-slate-900 hover:text-primary-700">
                          {row.userName}
                        </Link>
                        <p className="text-[11px] text-slate-500">
                          {row.managerName ? `Manager : ${row.managerName}` : "Sans manager"}
                        </p>
                      </div>
                      <div className="text-right" {...tour("row-total")}>
                        <p className="text-sm font-bold tabular-nums text-slate-900">{formatEuros(row.totalAmountCents)}</p>
                        <StatusBadge row={row} />
                      </div>
                    </div>
                    <div {...tour("row-alerts")}>{alertChips(row)}</div>
                    <p className="text-[11px] tabular-nums text-slate-500">
                      {row.workingDays}/{row.totalWorkingDays} j payés · {row.totalCalls.toLocaleString("fr-FR")} appels · {row.totalRdv} RDV
                    </p>
                    {rowActions(row, tour)}
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th scope="col" className="w-10 px-4 py-3">
                      <HeaderCheckbox checked={allVisibleSelected} indeterminate={someSelected} onChange={toggleAll} />
                    </th>
                    <SortHeader label="Collaborateur" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortHeader
                      label="Étape"
                      sortKey="status"
                      sort={sort}
                      onSort={toggleSort}
                      tip={
                        <HrHelpTip title="Les 4 étapes d’un mois">
                          <p><strong>Brouillon</strong> : le mois est en cours, les chiffres bougent.</p>
                          <p><strong>À vérifier</strong> : prêt à être relu.</p>
                          <p><strong>Validé</strong> : chiffres verrouillés pour la paie.</p>
                          <p><strong>Payé</strong> : le virement est fait.</p>
                        </HrHelpTip>
                      }
                    />
                    <SortHeader label="Alertes" sortKey="alerts" sort={sort} onSort={toggleSort} />
                    <SortHeader
                      label="Jours payés"
                      sortKey="days"
                      sort={sort}
                      onSort={toggleSort}
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
                      tip={
                        <HrHelpTip title="Activité">
                          <p>Appels passés et rendez-vous pris dans le mois (heure de Paris). Les rendez-vous annulés ne comptent pas.</p>
                          <p>L’objectif est le nombre d’appels attendus par jour.</p>
                        </HrHelpTip>
                      }
                    />
                    <th scope="col" className="px-4 py-3 text-right">Fixe</th>
                    <th scope="col" className="px-4 py-3 text-right">Variable</th>
                    <SortHeader label="Total à payer" sortKey="total" sort={sort} onSort={toggleSort} align="right" />
                    <th scope="col" className="sticky right-0 z-[1] bg-slate-50 px-4 py-3 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map((row, i) => {
                    const tour = (key: string) => (i === 0 ? { "data-hr-tour": key } : {});
                    const isSelected = selected.has(row.userId);
                    const rowBg = isSelected ? "bg-primary-50" : "bg-white group-hover:bg-slate-50";
                    return (
                      <tr key={row.userId} className={`group transition-colors ${isSelected ? "bg-primary-50" : "hover:bg-slate-50"}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.userId)}
                            aria-label={`Sélectionner ${row.userName}`}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                            {...tour("row-select")}
                          />
                        </td>
                        <td className="px-4 py-3" {...tour("row-person")}>
                          <Link href={`/manager/rh/${row.userId}`} className="font-semibold text-slate-900 hover:text-primary-700 hover:underline">
                            {row.userName}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${row.userRole === "MANAGER" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"}`}>
                              {row.userRole === "MANAGER" ? "Manager" : row.userRole}
                            </span>
                            <span>{row.contractType === ContractType.SALARIE ? "Salarié" : "Indépendant"}</span>
                            <span className="text-slate-400">·</span>
                            <span className={row.managerName ? "" : "italic text-slate-400"}>
                              {row.managerName ? `Manager : ${row.managerName}` : "Sans manager"}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge row={row} />
                        </td>

                        <td className="px-4 py-3" {...tour("row-alerts")}>
                          {alertChips(row)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="font-medium tabular-nums text-slate-800">
                            {row.workingDays} / {row.totalWorkingDays} j
                          </div>
                          <span className={`block text-[10px] ${row.absenceDays > 0 ? "text-amber-700" : "text-slate-400"}`}>
                            {row.absenceDays > 0 ? `${row.absenceDays} j d’absence` : "Aucune absence"}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          <div className="font-semibold text-slate-900">
                            {row.totalCalls.toLocaleString("fr-FR")} appels · <span className="text-emerald-700">{row.totalRdv} RDV</span>
                          </div>
                          <QuotaBar row={row} />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">{formatEuros(row.fixedAmountCents)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700">{formatEuros(row.variableAmountCents)}</td>

                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" {...tour("row-total")}>
                          <span className="text-sm font-bold text-slate-900">{formatEuros(row.totalAmountCents)}</span>
                          {row.adjustmentCents !== 0 && (
                            <span className="block text-[10px] text-primary-600" title={row.adjustmentNote ?? undefined}>
                              dont {row.adjustmentCents > 0 ? "+" : "−"}
                              {formatEuros(Math.abs(row.adjustmentCents))} d’ajustement
                            </span>
                          )}
                        </td>

                        <td className={`sticky right-0 px-4 py-3 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)] transition-colors ${rowBg}`}>
                          {rowActions(row, tour)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <tr>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" colSpan={4}>
                      Total · {summary.count} personne(s)
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{summary.calls.toLocaleString("fr-FR")} appels · {summary.rdv} RDV</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatEuros(visibleRows.reduce((s, r) => s + r.fixedAmountCents, 0))}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatEuros(visibleRows.reduce((s, r) => s + r.variableAmountCents, 0))}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-slate-900">{formatEuros(summary.pay)}</td>
                    <td className="sticky right-0 bg-slate-50 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)]" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedRows.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-4xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Actions groupées">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Tout désélectionner" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
            <span aria-live="polite">
              {bulkProgress ? (
                <>Mise à jour… <strong className="tabular-nums">{bulkProgress.done}/{bulkProgress.total}</strong></>
              ) : (
                <>
                  <strong>{selectedRows.length}</strong> sélectionné(s) · <strong className="tabular-nums">{formatEuros(selectedRows.reduce((s, r) => s + r.totalAmountCents, 0))}</strong>
                </>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {BULK_ACTIONS.map((a) => (
              <button
                key={a.status}
                type="button"
                onClick={() => startBulk(a)}
                disabled={Boolean(bulkProgress)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  a.status === HrMonthStatus.PAID ? "bg-emerald-600 text-white hover:bg-emerald-700" : a.status === HrMonthStatus.VALIDATED ? "bg-primary-600 text-white hover:bg-primary-700" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                }`}
              >
                {a.label}
              </button>
            ))}
            <button type="button" onClick={() => exportRows(selectedRows, "-selection")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" />
              Exporter
            </button>
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
          <div className="space-y-4 text-xs">
            {plan.eligible.length > 0 ? (
              <p className="text-slate-700">
                {plan.eligible.length} dossier(s) pour un total de{" "}
                <strong className="tabular-nums">{formatEuros(plan.eligible.reduce((s, r) => s + r.totalAmountCents, 0))}</strong> passeront en «{" "}
                {STATUS_LABELS[bulkPlan.status]} ».
                {bulkPlan.status === HrMonthStatus.VALIDATED && " Leurs chiffres seront verrouillés."}
                {bulkPlan.status === HrMonthStatus.PAID && " À faire uniquement après le virement."}
              </p>
            ) : (
              <p className="text-slate-700">Aucun des dossiers sélectionnés ne peut passer à cette étape.</p>
            )}
            {plan.skipped.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
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
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setBulkPlan(null)} disabled={Boolean(bulkProgress)} className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => executeBulk(bulkPlan.status, plan)}
                disabled={plan.eligible.length === 0 || Boolean(bulkProgress)}
                className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {bulkProgress ? `En cours… ${bulkProgress.done}/${bulkProgress.total}` : `Confirmer (${plan.eligible.length})`}
              </button>
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

function StatusBadge({ row }: { row: HrMonthRowData }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[row.status]}`}>
      {isLockedStatus(row.status) && <Lock className="h-2.5 w-2.5" aria-hidden />}
      {row.id ? STATUS_LABELS[row.status] : "Non enregistré"}
    </span>
  );
}

function QuotaBar({ row }: { row: HrMonthRowData }) {
  if (row.dailyQuota <= 0 || row.totalWorkingDays <= 0) {
    return <span className="block text-[10px] text-slate-400">Pas d’objectif d’appels</span>;
  }
  const judgedDays = row.underQuotaDaysCount;
  const tone = judgedDays === 0 ? "text-emerald-700" : judgedDays <= 2 ? "text-amber-700" : "text-rose-700";
  return (
    <span className={`block text-[10px] ${tone}`}>
      Objectif {row.dailyQuota}/j · {judgedDays === 0 ? "toujours atteint" : `${judgedDays} j sous l’objectif`}
    </span>
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
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1 rounded hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${active ? "text-slate-900" : ""}`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-primary-600" : "text-slate-300"}`} />
        </button>
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
      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
    />
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  valueClass = "text-slate-900",
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <p className={`truncate text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {children}
      </select>
    </label>
  );
}

function AlertChip({
  tone,
  onClick,
  children,
}: {
  tone: "rose" | "amber" | "sky";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const styles = {
    rose: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
    amber: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  }[tone];
  const className = `inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

function RowButton({
  primary,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; "data-hr-tour"?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? "bg-primary-50 text-primary-700 hover:bg-primary-100" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-4">
          <div className="h-3 w-4 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
