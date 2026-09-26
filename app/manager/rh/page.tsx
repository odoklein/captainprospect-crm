"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Calendar,
  Phone,
  Target,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Sliders,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Briefcase,
  UserCheck,
} from "lucide-react";
import { HrMonthRowData, HrMonthStatus, ContractType } from "@/lib/hr/hr-types";
import { HrProfileModal } from "@/components/hr/HrProfileModal";
import { HrCalculationDetailModal } from "@/components/hr/HrCalculationDetailModal";
import { HrStatusModal } from "@/components/hr/HrStatusModal";

export default function HrPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState<string>(defaultMonth);
  const [rows, setRows] = useState<HrMonthRowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBulkCalculating, setIsBulkCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [managerFilter, setManagerFilter] = useState<string>("ALL");
  const [contractFilter, setContractFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals state
  const [profileModalUser, setProfileModalUser] = useState<{ id: string; name: string } | null>(null);
  const [detailModalRow, setDetailModalRow] = useState<HrMonthRowData | null>(null);
  const [statusModalRow, setStatusModalRow] = useState<HrMonthRowData | null>(null);

  const fetchRows = async (targetMonth = month) => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/hr/months?month=${targetMonth}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de charger les données RH");
      }

      setRows(json.data.rows || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(month);
  }, [month]);

  const handleBulkRecalculate = async () => {
    try {
      setIsBulkCalculating(true);
      const res = await fetch(`/api/hr/months/calculate-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erreur lors du recalcul groupé");
      }
      await fetchRows(month);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsBulkCalculating(false);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    setMonth(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  // Distinct managers for filter dropdown
  const availableManagers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.managerId && r.managerName) {
        map.set(r.managerId, r.managerName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = r.userName.toLowerCase().includes(q);
        const matchEmail = r.userEmail.toLowerCase().includes(q);
        if (!matchName && !matchEmail) return false;
      }

      // Role
      if (roleFilter !== "ALL") {
        if (roleFilter === "BOOKER") {
          if (r.userRole !== "SDR" && r.userRole !== "BOOKER") return false;
        } else if (r.userRole !== roleFilter) {
          return false;
        }
      }

      // Manager
      if (managerFilter !== "ALL") {
        if (r.managerId !== managerFilter) return false;
      }

      // Contract
      if (contractFilter !== "ALL") {
        if (r.contractType !== contractFilter) return false;
      }

      // Status
      if (statusFilter !== "ALL") {
        if (r.status !== statusFilter) return false;
      }

      return true;
    });
  }, [rows, searchQuery, roleFilter, managerFilter, contractFilter, statusFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalPayCents = 0;
    let totalCalls = 0;
    let totalRdv = 0;
    let validatedCount = 0;

    filteredRows.forEach((r) => {
      totalPayCents += r.totalAmountCents;
      totalCalls += r.totalCalls;
      totalRdv += r.totalRdv;
      if (r.status === HrMonthStatus.VALIDATED || r.status === HrMonthStatus.PAID) {
        validatedCount++;
      }
    });

    return {
      totalCollaborateurs: filteredRows.length,
      totalPayEuros: (totalPayCents / 100).toFixed(2),
      totalCalls,
      totalRdv,
      validatedCount,
    };
  }, [filteredRows]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, 1));
    return dateObj.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }, [month]);

  const getRoleBadge = (role: string) => {
    // User requirement: Replace "SDR" with visible label "Booker"
    if (role === "SDR" || role === "BOOKER") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          Booker
        </span>
      );
    }
    if (role === "BUSINESS_DEVELOPER") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          BD
        </span>
      );
    }
    if (role === "DEVELOPER") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Dev
        </span>
      );
    }
    if (role === "MANAGER") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          Manager
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
        {role}
      </span>
    );
  };

  const getStatusBadge = (status: HrMonthStatus) => {
    switch (status) {
      case HrMonthStatus.DRAFT:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Brouillon
          </span>
        );
      case HrMonthStatus.TO_VERIFY:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            À vérifier
          </span>
        );
      case HrMonthStatus.VALIDATED:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            Validé
          </span>
        );
      case HrMonthStatus.PAID:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Payé
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Centre de Gestion RH & Équipe</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi des jours travaillés, quotas, rémunération fixe, variable et validation de paie
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Switcher */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              onClick={handlePrevMonth}
              title="Mois précédent"
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 text-xs font-semibold text-slate-800 capitalize min-w-[130px] text-center">
              {monthLabel}
            </div>
            <button
              onClick={handleNextMonth}
              title="Mois suivant"
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Bulk Recalculate */}
          <button
            onClick={handleBulkRecalculate}
            disabled={isBulkCalculating}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBulkCalculating ? "animate-spin" : ""}`} />
            <span>{isBulkCalculating ? "Calcul en cours..." : "Recalculer le mois"}</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Collaborateurs</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary.totalCollaborateurs}</p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {summary.validatedCount} dossier(s) validé(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Masse salariale estimée</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600">{summary.totalPayEuros} €</p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Fixe proratisé + variable calculé
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Appels réalisés</span>
            <Phone className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary.totalCalls}</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Sur le mois en cours</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>RDV validés</span>
            <Target className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-purple-600">{summary.totalRdv}</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Rendez-vous confirmés</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">Tous les rôles</option>
          <option value="BOOKER">Booker (SDR)</option>
          <option value="BUSINESS_DEVELOPER">Business Developer</option>
          <option value="DEVELOPER">Développeur</option>
          <option value="MANAGER">Manager</option>
        </select>

        {/* Manager Filter */}
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">Tous les managers</option>
          {availableManagers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {/* Contract Filter */}
        <select
          value={contractFilter}
          onChange={(e) => setContractFilter(e.target.value)}
          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">Tous contrats</option>
          <option value={ContractType.SALARIE}>Salarié</option>
          <option value={ContractType.INDEPENDANT}>Indépendant</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">Tous les statuts</option>
          <option value={HrMonthStatus.DRAFT}>Brouillon</option>
          <option value={HrMonthStatus.TO_VERIFY}>À vérifier</option>
          <option value={HrMonthStatus.VALIDATED}>Validé</option>
          <option value={HrMonthStatus.PAID}>Payé</option>
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            <span>Chargement des collaborateurs et calculs RH...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500">
            Aucun collaborateur ne correspond aux filtres sélectionnés.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Collaborateur</th>
                  <th className="py-3 px-4">Manager</th>
                  <th className="py-3 px-4">Contrat</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Jours travaillés & Absences</th>
                  <th className="py-3 px-4">Appels</th>
                  <th className="py-3 px-4">RDV</th>
                  <th className="py-3 px-4">Quota</th>
                  <th className="py-3 px-4">Salaire Fixe</th>
                  <th className="py-3 px-4">Variable</th>
                  <th className="py-3 px-4">Total à payer</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr key={row.userId} className="hover:bg-slate-50/60 transition-colors">
                    {/* Collaborateur */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{row.userName}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {getRoleBadge(row.userRole)}
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          {row.userEmail}
                        </span>
                      </div>
                    </td>

                    {/* Manager */}
                    <td className="py-3 px-4 text-slate-600">
                      {row.managerName ? (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                          {row.managerName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Non assigné</span>
                      )}
                    </td>

                    {/* Contrat */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                        {row.contractType === ContractType.SALARIE ? "Salarié" : "Indépendant"}
                      </span>
                    </td>

                    {/* Statut */}
                    <td className="py-3 px-4">{getStatusBadge(row.status)}</td>

                    {/* Jours travaillés & absences */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">
                        {row.workingDays} / {row.totalWorkingDays} j
                      </div>
                      {row.absenceDays > 0 ? (
                        <span className="text-[10px] text-amber-600 block">
                          +{row.absenceDays} j abs.
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 block">0 absence</span>
                      )}
                    </td>

                    {/* Appels */}
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900">{row.totalCalls}</span>
                    </td>

                    {/* RDV */}
                    <td className="py-3 px-4">
                      <span className="font-bold text-emerald-600">
                        {row.totalRdv > 0 ? `+${row.totalRdv}` : "0"}
                      </span>
                    </td>

                    {/* Quota */}
                    <td className="py-3 px-4">
                      {row.dailyQuota > 0 ? (
                        <span className="text-slate-700 font-medium">{row.dailyQuota} / j</span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Fixe */}
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {(row.fixedAmountCents / 100).toFixed(2)} €
                    </td>

                    {/* Variable */}
                    <td className="py-3 px-4 font-medium text-emerald-600">
                      {(row.variableAmountCents / 100).toFixed(2)} €
                    </td>

                    {/* Total estimé */}
                    <td className="py-3 px-4">
                      <span className="font-black text-slate-900 text-sm">
                        {(row.totalAmountCents / 100).toFixed(2)} €
                      </span>
                      {row.adjustmentCents !== 0 && (
                        <span className="block text-[10px] text-indigo-600">
                          {row.adjustmentCents > 0 ? "+" : ""}
                          {(row.adjustmentCents / 100).toFixed(2)} € aj.
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setDetailModalRow(row)}
                          title="Voir la formule et le détail transparent"
                          className="px-2.5 py-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          Détail
                        </button>

                        <button
                          onClick={() =>
                            setProfileModalUser({ id: row.userId, name: row.userName })
                          }
                          title="Configurer les règles RH du collaborateur"
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Règles
                        </button>

                        {row.id && (
                          <button
                            onClick={() => setStatusModalRow(row)}
                            title="Modifier le statut de paie ou ajouter un ajustement"
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            Statut
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {profileModalUser && (
        <HrProfileModal
          isOpen={Boolean(profileModalUser)}
          onClose={() => setProfileModalUser(null)}
          userId={profileModalUser.id}
          userName={profileModalUser.name}
          onProfileSaved={() => fetchRows(month)}
        />
      )}

      {/* Calculation Detail Modal */}
      {detailModalRow && (
        <HrCalculationDetailModal
          isOpen={Boolean(detailModalRow)}
          onClose={() => setDetailModalRow(null)}
          userId={detailModalRow.userId}
          month={month}
          monthRecordId={detailModalRow.id}
          onCalculationUpdated={() => fetchRows(month)}
        />
      )}

      {/* Status Modal */}
      {statusModalRow && statusModalRow.id && (
        <HrStatusModal
          isOpen={Boolean(statusModalRow)}
          onClose={() => setStatusModalRow(null)}
          monthRecordId={statusModalRow.id}
          userName={statusModalRow.userName}
          month={month}
          currentStatus={statusModalRow.status}
          currentAdjustmentCents={statusModalRow.adjustmentCents}
          onStatusUpdated={() => fetchRows(month)}
        />
      )}
    </div>
  );
}
