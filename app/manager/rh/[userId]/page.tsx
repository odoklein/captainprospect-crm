"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Briefcase, Calendar, ChevronRight, History, ListChecks, RefreshCw, Wallet } from "lucide-react";
import { ContractType, HrMonthStatus, RemunerationMode } from "@/lib/hr/hr-types";
import { REMUNERATION_LABELS, STATUS_LABELS, formatEuros, formatMonthLabel } from "@/lib/hr/hr-rules";
import { AuditTone, HrAuditEntry, describeAuditEntry } from "@/lib/hr/hr-audit-labels";
import { HrProfileModal } from "@/components/hr/HrProfileModal";

interface MonthSummary {
  id: string;
  month: string;
  status: HrMonthStatus;
  workingDays: number;
  absenceDays: number;
  totalCalls: number;
  totalRdv: number;
  totalAmountCents: number;
  paidAt: string | null;
}

interface Snapshot {
  id: string;
  fixedSalaryCents: number;
  variablePerRdvCents: number;
  dailyQuota: number;
  reason: string | null;
  changedAt: string;
}

interface DossierData {
  user: { id: string; name: string; email: string; role: string; manager: { name: string } | null };
  profile: {
    id: string | null;
    contractType: ContractType;
    remunerationMode: RemunerationMode;
    fixedSalaryCents: number;
    variablePerRdvCents: number;
    dailyQuota: number;
    effectiveFrom: string;
    snapshots: Snapshot[];
  };
  months: MonthSummary[];
}

const STATUS_STYLES: Record<HrMonthStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  TO_VERIFY: "bg-amber-50 text-amber-800",
  VALIDATED: "bg-indigo-50 text-indigo-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const TONE_DOT: Record<AuditTone, string> = {
  slate: "bg-slate-300",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

const AUDIT_PAGE = 15;

export default function UserHrPage() {
  const params = useParams();
  const userId = params.userId as string;

  const [data, setData] = useState<DossierData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [audit, setAudit] = useState<HrAuditEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/profiles/${userId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Impossible de charger le dossier RH.");
      setData(json.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchAudit = useCallback(
    async (page: number) => {
      setAuditLoading(true);
      try {
        const res = await fetch(`/api/hr/audit?userId=${encodeURIComponent(userId)}&page=${page}&limit=${AUDIT_PAGE}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) return;
        setAudit((prev) => (page === 1 ? json.data : [...prev, ...json.data]));
        setAuditPage(page);
        setAuditHasMore(Boolean(json.pagination?.hasMore));
      } finally {
        setAuditLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    fetchProfile();
    fetchAudit(1);
  }, [userId, fetchProfile, fetchAudit]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
        <p className="text-xs text-slate-500">Chargement du dossier…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <BackLink />
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error || "Collaborateur introuvable"}
          <button type="button" onClick={fetchProfile} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-rose-200 hover:bg-rose-100">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { user, profile, months } = data;
  const configured = Boolean(profile.id);
  const maxTotal = Math.max(1, ...months.map((m) => m.totalAmountCents));
  const paidTotal = months.filter((m) => m.status === HrMonthStatus.PAID).reduce((s, m) => s + m.totalAmountCents, 0);
  const avgTotal = months.length ? Math.round(months.reduce((s, m) => s + m.totalAmountCents, 0) / months.length) : 0;
  const chronological = [...months].reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <button
          type="button"
          onClick={() => setIsEditOpen(true)}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
        >
          {configured ? "Modifier les règles de paie" : "Configurer les règles de paie"}
        </button>
      </div>

      {/* Identity */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-lg font-bold text-indigo-700" aria-hidden>
            {user.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">{user.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <span className="truncate">{user.email}</span>
              <span aria-hidden>·</span>
              <span className="font-semibold text-indigo-600">{user.role === "MANAGER" ? "Manager" : user.role}</span>
            </p>
          </div>
        </div>
        <div className="sm:text-right">
          <span className="block text-[11px] text-slate-400">Manager</span>
          <span className="text-xs font-semibold text-slate-800">{user.manager?.name || "Aucun"}</span>
        </div>
      </div>

      {!configured && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          Les règles de paie ne sont pas encore renseignées : la paie de {user.name} est calculée à 0 €.
        </div>
      )}

      {/* Rules */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoCard icon={<Briefcase className="h-4 w-4 text-indigo-500" />} label="Contrat">
          <p className="text-sm font-bold text-slate-900">{profile.contractType === ContractType.SALARIE ? "Salarié (CDI / CDD)" : "Indépendant"}</p>
          <span className="block text-xs text-slate-500">{REMUNERATION_LABELS[profile.remunerationMode]}</span>
        </InfoCard>
        <InfoCard icon={<Wallet className="h-4 w-4 text-emerald-500" />} label="Rémunération">
          <p className="text-lg font-bold tabular-nums text-emerald-700">
            {profile.remunerationMode === RemunerationMode.VARIABLE ? "Pas de fixe" : `${formatEuros(profile.fixedSalaryCents)} / mois`}
          </p>
          <span className="block text-xs text-slate-500">
            {profile.remunerationMode === RemunerationMode.FIXE ? "Pas de prime par rendez-vous" : `+ ${formatEuros(profile.variablePerRdvCents)} par rendez-vous pris`}
          </span>
        </InfoCard>
        <InfoCard icon={<Calendar className="h-4 w-4 text-purple-500" />} label="Objectif">
          <p className="text-sm font-bold text-slate-900">{profile.dailyQuota > 0 ? `${profile.dailyQuota} appels / jour` : "Pas d’objectif d’appels"}</p>
          <span className="block text-xs text-slate-500">
            {configured
              ? `En vigueur depuis le ${new Date(profile.effectiveFrom).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
              : "Règles pas encore configurées"}
          </span>
        </InfoCard>
      </div>

      {/* Pay history */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="pay-history">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="pay-history" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 text-indigo-600" />
            Historique de paie
          </h2>
          {months.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Moyenne : <strong className="tabular-nums text-slate-800">{formatEuros(avgTotal)}</strong> · Déjà versé :{" "}
              <strong className="tabular-nums text-emerald-700">{formatEuros(paidTotal)}</strong>
            </p>
          )}
        </div>

        {months.length === 0 ? (
          <p className="text-xs italic text-slate-400">Aucun mois enregistré pour l’instant. Il apparaîtra après « Recalculer le mois ».</p>
        ) : (
          <>
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Montant à payer par mois">
              {chronological.map((m) => (
                <Link
                  key={m.id}
                  href={`/manager/rh?month=${m.month}`}
                  title={`${formatMonthLabel(m.month)} : ${formatEuros(m.totalAmountCents)} (${STATUS_LABELS[m.status]})`}
                  className="group flex h-full flex-1 flex-col justify-end"
                >
                  <div
                    className={`w-full rounded-t-md transition-opacity group-hover:opacity-80 ${
                      m.status === HrMonthStatus.PAID ? "bg-emerald-500" : m.status === HrMonthStatus.VALIDATED ? "bg-indigo-500" : "bg-slate-300"
                    }`}
                    style={{ height: `${Math.max(4, (m.totalAmountCents / maxTotal) * 100)}%` }}
                  />
                  <span className="mt-1 block truncate text-center text-[9px] capitalize text-slate-400">
                    {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}
                  </span>
                </Link>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Mois</th>
                    <th scope="col" className="px-3 py-2 font-medium">Étape</th>
                    <th scope="col" className="px-3 py-2 font-medium">Jours payés</th>
                    <th scope="col" className="px-3 py-2 font-medium">Activité</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Ouvrir</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {months.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium capitalize text-slate-900">{formatMonthLabel(m.month)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[m.status]}`}>{STATUS_LABELS[m.status]}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">
                        {m.workingDays} j{m.absenceDays > 0 && <span className="text-amber-700"> · {m.absenceDays} abs.</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">
                        {m.totalCalls.toLocaleString("fr-FR")} appels · {m.totalRdv} RDV
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{formatEuros(m.totalAmountCents)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/manager/rh?month=${m.month}`} aria-label={`Ouvrir ${formatMonthLabel(m.month)}`} className="inline-flex rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-700">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Rule changes */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="rule-history">
          <h2 id="rule-history" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <History className="h-4 w-4 text-indigo-600" />
            Anciennes règles
          </h2>
          {profile.snapshots.length > 0 ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 text-xs">
              {profile.snapshots.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-800">
                      Fixe {formatEuros(s.fixedSalaryCents)} · Prime {formatEuros(s.variablePerRdvCents)} · {s.dailyQuota} appels/j
                    </p>
                    <p className="text-[11px] text-slate-400">{s.reason || "Modification"}</p>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-400" dateTime={s.changedAt}>
                    {new Date(s.changedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-slate-400">Aucune modification depuis la première configuration.</p>
          )}
        </section>

        {/* Activity log */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="activity-log">
          <h2 id="activity-log" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ListChecks className="h-4 w-4 text-indigo-600" />
            Qui a fait quoi
          </h2>
          {audit.length === 0 && !auditLoading ? (
            <p className="text-xs italic text-slate-400">Aucune action enregistrée pour l’instant.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {audit.map((entry) => {
                const d = describeAuditEntry(entry);
                return (
                  <li key={entry.id} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${TONE_DOT[d.tone]}`} aria-hidden />
                    <p className="text-xs font-semibold text-slate-800">{d.title}</p>
                    {d.detail && <p className="text-[11px] text-slate-500">{d.detail}</p>}
                    <p className="text-[10px] text-slate-400">
                      {entry.actorName ?? "Système"} ·{" "}
                      {new Date(entry.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {auditHasMore && (
            <button
              type="button"
              onClick={() => fetchAudit(auditPage + 1)}
              disabled={auditLoading}
              className="w-full rounded-lg bg-slate-50 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {auditLoading ? "Chargement…" : "Voir plus"}
            </button>
          )}
        </section>
      </div>

      {isEditOpen && (
        <HrProfileModal
          isOpen
          onClose={() => setIsEditOpen(false)}
          userId={user.id}
          userName={user.name}
          onProfileSaved={() => {
            fetchProfile();
            fetchAudit(1);
          }}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/manager/rh" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
      <ArrowLeft className="h-4 w-4" />
      Retour à la paie de l’équipe
    </Link>
  );
}

function InfoCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}
