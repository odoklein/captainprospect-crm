"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Phone,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { ContractType, HrMonthRowData, HrMonthStatus } from "@/lib/hr/hr-types";
import {
  STATUS_LABELS,
  currentParisMonth,
  formatEuros,
  formatMonthLabel,
  isLockedStatus,
  shiftMonth,
} from "@/lib/hr/hr-rules";
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

const DEFAULT_FILTERS = {
  search: "",
  role: "SDR",
  manager: "ALL",
  contract: "ALL",
  status: "ALL",
  attentionOnly: false,
};

function needsAttention(r: HrMonthRowData) {
  return !r.hasProfile || r.pendingDecisionCount > 0 || r.isStale;
}

const STATUS_STYLES: Record<HrMonthStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
  TO_VERIFY: "bg-amber-50 text-amber-800 border-amber-200",
  VALIDATED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function HrPage() {
  const thisMonth = useMemo(() => currentParisMonth(), []);
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<HrMonthRowData[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBulkCalculating, setIsBulkCalculating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [statusUserId, setStatusUserId] = useState<string | null>(null);

  const requestSeq = useRef(0);

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

  const refresh = () => fetchRows(month);

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

  const filteredRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return roleRows.filter((r) => {
      if (q && !r.userName.toLowerCase().includes(q) && !r.userEmail.toLowerCase().includes(q)) return false;
      if (filters.manager !== "ALL" && r.managerId !== filters.manager) return false;
      if (filters.contract !== "ALL" && r.contractType !== filters.contract) return false;
      if (filters.status !== "ALL" && r.status !== filters.status) return false;
      if (filters.attentionOnly && !needsAttention(r)) return false;
      return true;
    });
  }, [roleRows, filters]);

  const summary = useMemo(() => {
    let pay = 0;
    let calls = 0;
    let rdv = 0;
    let locked = 0;
    filteredRows.forEach((r) => {
      pay += r.totalAmountCents;
      calls += r.totalCalls;
      rdv += r.totalRdv;
      if (isLockedStatus(r.status)) locked++;
    });
    return { count: filteredRows.length, pay, calls, rdv, locked };
  }, [filteredRows]);

  const attentionCount = useMemo(() => roleRows.filter(needsAttention).length, [roleRows]);

  const filtersActive =
    filters.search !== "" ||
    filters.manager !== "ALL" ||
    filters.contract !== "ALL" ||
    filters.status !== "ALL" ||
    filters.attentionOnly;

  const setFilter = <K extends keyof typeof DEFAULT_FILTERS>(key: K, value: (typeof DEFAULT_FILTERS)[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const findRow = (userId: string | null) => (userId ? rows.find((r) => r.userId === userId) : undefined);
  const statusRow = findRow(statusUserId);
  const profileRow = findRow(profileUserId);

  const initialLoading = isFetching && loadedMonth === null;
  const showingStaleMonth = loadedMonth !== null && loadedMonth !== month;
  const guide = useHrGuide(HR_PAGE_GUIDE_KEY, !initialLoading && !error);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
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
            <HelpCircle className="h-3.5 w-3.5 text-indigo-600" />
            Comment ça marche ?
          </button>

          <div data-hr-tour="month" className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Mois précédent"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[130px] px-3 py-1 text-center text-xs font-semibold capitalize text-slate-800" aria-live="polite">
              {formatMonthLabel(month)}
            </div>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month >= thisMonth}
              aria-label="Mois suivant"
              title={month >= thisMonth ? "Les mois futurs ne peuvent pas encore être calculés" : undefined}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            data-hr-tour="recalculate"
            onClick={handleBulkRecalculate}
            disabled={isBulkCalculating || isFetching}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
        <SummaryCard icon={<Users className="h-4 w-4 text-indigo-500" />} label="Personnes" value={String(summary.count)} hint={`${summary.locked} dossier(s) validé(s) ou payé(s)`} />
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

      {/* Filters */}
      <div data-hr-tour="filters" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Rechercher</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Rechercher un nom ou un email…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
          {Object.values(HrMonthStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, role: f.role }))}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {isFetching && !initialLoading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-indigo-100" aria-hidden>
            <div className="h-full w-1/3 animate-pulse bg-indigo-500" />
          </div>
        )}

        {initialLoading ? (
          <TableSkeleton />
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-xs text-slate-500">
            {rows.length === 0 && !error ? (
              <p>Aucun SDR ou manager actif pour le moment.</p>
            ) : (
              <>
                <p>Personne ne correspond à ces filtres.</p>
                {filtersActive && (
                  <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="font-semibold text-indigo-700 hover:underline">
                    Réinitialiser les filtres
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Collaborateur</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      Étape
                      <HrHelpTip title="Les 4 étapes d’un mois">
                        <p><strong>Brouillon</strong> : le mois est en cours, les chiffres bougent.</p>
                        <p><strong>À vérifier</strong> : prêt à être relu.</p>
                        <p><strong>Validé</strong> : chiffres verrouillés pour la paie.</p>
                        <p><strong>Payé</strong> : le virement est fait.</p>
                      </HrHelpTip>
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3">Alertes</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      Jours payés
                      <HrHelpTip title="Jours payés">
                        <p>Jours ouvrés du mois (hors week-ends et jours fériés), moins les absences et les journées que vous avez décidé de ne pas payer.</p>
                      </HrHelpTip>
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      Activité
                      <HrHelpTip title="Activité">
                        <p>Appels passés et rendez-vous pris dans le mois (heure de Paris). Les rendez-vous annulés ne comptent pas.</p>
                        <p>L’objectif est le nombre d’appels attendus par jour.</p>
                      </HrHelpTip>
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">Fixe</th>
                  <th scope="col" className="px-4 py-3 text-right">Variable</th>
                  <th scope="col" className="px-4 py-3 text-right">Total à payer</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, i) => {
                  const tour = (key: string) => (i === 0 ? { "data-hr-tour": key } : {});
                  return (
                    <tr key={row.userId} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3" {...tour("row-person")}>
                        <Link
                          href={`/manager/rh/${row.userId}`}
                          className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline"
                        >
                          {row.userName}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${row.userRole === "MANAGER" ? "bg-purple-50 text-purple-700" : "bg-indigo-50 text-indigo-700"}`}>
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
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[row.status]}`}>
                          {row.id ? STATUS_LABELS[row.status] : "Non enregistré"}
                        </span>
                      </td>

                      <td className="px-4 py-3" {...tour("row-alerts")}>
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
                          {!needsAttention(row) && <span className="text-[11px] text-slate-400">—</span>}
                        </div>
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
                        <span className="block text-[10px] text-slate-400">
                          {row.dailyQuota > 0 ? `Objectif : ${row.dailyQuota} appels / jour` : "Pas d’objectif d’appels"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">{formatEuros(row.fixedAmountCents)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-700">{formatEuros(row.variableAmountCents)}</td>

                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums" {...tour("row-total")}>
                        <span className="text-sm font-bold text-slate-900">{formatEuros(row.totalAmountCents)}</span>
                        {row.adjustmentCents !== 0 && (
                          <span className="block text-[10px] text-indigo-600" title={row.adjustmentNote ?? undefined}>
                            dont {row.adjustmentCents > 0 ? "+" : "−"}
                            {formatEuros(Math.abs(row.adjustmentCents))} d’ajustement
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        primary ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
