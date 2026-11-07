"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Callout } from "@/components/ui/Callout";
import { FOCUS_RING } from "@/components/ui/recipes";
import {
  HubBackLink,
  HubHeader,
  Metric,
  MetricPlaceholder,
  MetricStrip,
  Panel,
  PanelHeader,
  PanelMessage,
  SkeletonRows,
  TextButton,
} from "@/components/hr/HubUI";
import { ContractType, HrMonthStatus, RemunerationMode } from "@/lib/hr/hr-types";
import { REMUNERATION_LABELS, STATUS_LABELS, formatEuros, formatMonthLabel, isLockedStatus } from "@/lib/hr/hr-rules";
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

// Same step marks as the Paie list.
const STATUS_STYLES: Record<HrMonthStatus, string> = {
  DRAFT: "bg-surface-3 text-ink-2 border-line",
  TO_VERIFY: "bg-warning-soft text-warning-ink border-warning-line",
  VALIDATED: "bg-primary-50 text-primary-700 border-primary-200",
  PAID: "bg-success-soft text-success-ink border-success-line",
};

const BAR: Record<HrMonthStatus, string> = {
  DRAFT: "bg-line-strong",
  TO_VERIFY: "bg-line-strong",
  VALIDATED: "bg-primary-500",
  PAID: "bg-success",
};

const TONE_DOT: Record<AuditTone, string> = {
  slate: "bg-line-strong",
  indigo: "bg-primary-500",
  emerald: "bg-success",
  amber: "bg-warning",
  rose: "bg-danger",
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
  const [auditFailedPage, setAuditFailedPage] = useState<number | null>(null);

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
      setAuditFailedPage(null);
      try {
        const res = await fetch(`/api/hr/audit?userId=${encodeURIComponent(userId)}&page=${page}&limit=${AUDIT_PAGE}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          setAuditFailedPage(page);
          return;
        }
        setAudit((prev) => (page === 1 ? json.data : [...prev, ...json.data]));
        setAuditPage(page);
        setAuditHasMore(Boolean(json.pagination?.hasMore));
      } catch {
        setAuditFailedPage(page);
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

  const backLink = <HubBackLink href="/manager/rh">Paie de l’équipe</HubBackLink>;

  if (isLoading && !data) {
    return (
      <div className="space-y-4 pb-2" aria-busy="true" aria-label="Chargement du dossier">
        {backLink}
        <div className="flex items-center gap-4">
          <span className="size-11 shrink-0 rounded-full bg-surface-3" />
          <div className="min-w-0 space-y-2">
            <span className="block h-6 w-48 rounded bg-surface-3" />
            <span className="block h-3.5 w-72 max-w-[60vw] rounded bg-surface-3" />
          </div>
        </div>
        <MetricStrip className="grid-cols-1 sm:grid-cols-3">
          {["Contrat", "Rémunération", "Objectif"].map((label) => (
            <Metric key={label} label={label} value={<MetricPlaceholder wide />} />
          ))}
        </MetricStrip>
        <Panel>
          <SkeletonRows rows={5} columns={[20, 10, 12, 18, 12]} pitch="py-3.5" />
        </Panel>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 pb-2">
        {backLink}
        <Panel>
          <PanelMessage tone="error" action={<TextButton onClick={fetchProfile}>Réessayer</TextButton>}>
            {error || "Collaborateur introuvable"}
          </PanelMessage>
        </Panel>
      </div>
    );
  }

  const { user, profile, months } = data;
  const configured = Boolean(profile.id);
  const maxTotal = Math.max(1, ...months.map((m) => m.totalAmountCents));
  const paidTotal = months.filter((m) => m.status === HrMonthStatus.PAID).reduce((s, m) => s + m.totalAmountCents, 0);
  const avgTotal = months.length ? Math.round(months.reduce((s, m) => s + m.totalAmountCents, 0) / months.length) : 0;
  const chronological = [...months].reverse();
  const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-4 pb-2">
      {backLink}

      {/* Identity */}
      <div className="flex items-start gap-4">
        <Avatar name={user.name} size="lg" shape="circle" className="mt-0.5" />
        <HubHeader
          className="min-w-0 flex-1"
          title={user.name}
          finding={
            <>
              {user.role === "MANAGER" ? "Manager" : user.role}
              {" · "}
              <span className="break-all">{user.email}</span>
              {" · "}Manager : {user.manager?.name || "Aucun"}
            </>
          }
          actions={
            <Button size="sm" onClick={() => setIsEditOpen(true)}>
              {configured ? "Modifier les règles de paie" : "Configurer les règles de paie"}
            </Button>
          }
        />
      </div>

      {!configured && (
        <Callout tone="danger">
          Les règles de paie ne sont pas encore renseignées : la paie de {user.name} est calculée à 0 €.
        </Callout>
      )}

      {/* Rules */}
      <MetricStrip className="grid-cols-1 sm:grid-cols-3">
        <Metric
          label="Contrat"
          value={profile.contractType === ContractType.SALARIE ? "Salarié (CDI / CDD)" : "Indépendant"}
          hint={REMUNERATION_LABELS[profile.remunerationMode]}
        />
        <Metric
          label="Rémunération"
          value={profile.remunerationMode === RemunerationMode.VARIABLE ? "Pas de fixe" : formatEuros(profile.fixedSalaryCents)}
          unit={profile.remunerationMode === RemunerationMode.VARIABLE ? undefined : "/ mois"}
          hint={profile.remunerationMode === RemunerationMode.FIXE ? "Pas de prime par rendez-vous" : `+ ${formatEuros(profile.variablePerRdvCents)} par rendez-vous pris`}
        />
        <Metric
          label="Objectif"
          value={profile.dailyQuota > 0 ? profile.dailyQuota : "Pas d’objectif d’appels"}
          unit={profile.dailyQuota > 0 ? "appels / jour" : undefined}
          hint={
            configured
              ? `En vigueur depuis le ${new Date(profile.effectiveFrom).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
              : "Règles pas encore configurées"
          }
        />
      </MetricStrip>

      {/* Pay history */}
      <Panel>
        <PanelHeader
          title="Historique de paie"
          meta={
            months.length > 0 ? (
              <>
                Moyenne : <strong className="font-semibold text-ink">{formatEuros(avgTotal)}</strong> · Déjà versé :{" "}
                <strong className="font-semibold text-ink">{formatEuros(paidTotal)}</strong>
              </>
            ) : undefined
          }
        />

        {months.length === 0 ? (
          <PanelMessage>Aucun mois enregistré pour l’instant. Il apparaîtra après « Recalculer le mois ».</PanelMessage>
        ) : (
          <>
            <div className="border-b border-line-subtle px-5 pb-3 pt-4">
              <div className="flex h-28 items-end gap-1.5" aria-label="Montant à payer par mois">
                {chronological.map((m) => {
                  const label = `${formatMonthLabel(m.month)} : ${formatEuros(m.totalAmountCents)} (${STATUS_LABELS[m.status]})`;
                  return (
                    <Link
                      key={m.id}
                      href={`/manager/rh?month=${m.month}`}
                      title={label}
                      aria-label={label}
                      className={cn("group flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm", FOCUS_RING)}
                    >
                      <div
                        className={cn("mx-auto w-full max-w-10 rounded-t transition-opacity group-hover:opacity-80", BAR[m.status])}
                        style={{ height: `${Math.max(4, (m.totalAmountCents / maxTotal) * 100)}%` }}
                      />
                      <span className="mt-1 block truncate text-center text-[10px] capitalize text-ink-3">{shortMonth(m.month)}</span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-success" aria-hidden />Payé</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary-500" aria-hidden />Validé</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-line-strong" aria-hidden />Brouillon ou à vérifier</span>
              </p>
            </div>

            {/* Phones: one line per month */}
            <ul className="divide-y divide-line-subtle md:hidden">
              {months.map((m) => (
                <li key={m.id}>
                  <Link href={`/manager/rh?month=${m.month}`} className={cn("flex items-start justify-between gap-3 px-4 py-3.5", FOCUS_RING, "focus-visible:ring-inset focus-visible:ring-offset-0")}>
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm font-semibold capitalize text-ink">{formatMonthLabel(m.month)}</p>
                      <StatusPill status={m.status} />
                      <p className="text-xs tabular-nums text-ink-3">
                        {m.workingDays} j{m.absenceDays > 0 && <span className="text-warning-ink"> · {m.absenceDays} abs.</span>} ·{" "}
                        {m.totalCalls.toLocaleString("fr-FR")} appels · {m.totalRdv} RDV
                      </p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{formatEuros(m.totalAmountCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full border-collapse text-left text-[13px] md:table">
              <thead className="border-b border-line text-xs text-ink-3">
                <tr>
                  <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Mois</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Étape</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Jours payés</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Activité</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="w-12 py-2.5 pl-1 pr-4">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.id} className="border-b border-line-subtle transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70">
                    <td className="py-3 pl-5 pr-3">
                      <Link href={`/manager/rh?month=${m.month}`} className={cn("rounded-sm font-medium capitalize text-ink hover:text-primary-700", FOCUS_RING)}>
                        {formatMonthLabel(m.month)}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={m.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink">
                      {m.workingDays} j
                      {m.absenceDays > 0 && <span className="text-warning-ink"> · {m.absenceDays} abs.</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink-2">
                      {m.totalCalls.toLocaleString("fr-FR")} <span className="text-ink-3">appels</span>
                      <span className="text-ink-4"> · </span>
                      {m.totalRdv} <span className="text-ink-3">RDV</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-[14px] font-semibold tabular-nums text-ink">{formatEuros(m.totalAmountCents)}</td>
                    <td className="py-2 pl-1 pr-4 text-right">
                      <Link
                        href={`/manager/rh?month=${m.month}`}
                        aria-label={`Ouvrir ${formatMonthLabel(m.month)}`}
                        className={cn("inline-flex size-8 items-center justify-center rounded-lg text-ink-4 hover:bg-surface-3 hover:text-ink", FOCUS_RING)}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Rule changes */}
        <Panel>
          <PanelHeader title="Anciennes règles" />
          {profile.snapshots.length > 0 ? (
            <ul className="divide-y divide-line-subtle">
              {profile.snapshots.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[13px] font-medium tabular-nums text-ink">
                      Fixe {formatEuros(s.fixedSalaryCents)} · Prime {formatEuros(s.variablePerRdvCents)} · {s.dailyQuota} appels/j
                    </p>
                    <p className="text-xs text-ink-3">{s.reason || "Modification"}</p>
                  </div>
                  <time className="shrink-0 text-xs tabular-nums text-ink-3" dateTime={s.changedAt}>
                    {new Date(s.changedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <PanelMessage className="py-10">Aucune modification depuis la première configuration.</PanelMessage>
          )}
        </Panel>

        {/* Activity log */}
        <Panel>
          <PanelHeader title="Qui a fait quoi" />
          {audit.length === 0 && auditLoading ? (
            <SkeletonRows rows={3} columns={[40, 24]} pitch="py-3" />
          ) : audit.length === 0 && auditFailedPage !== null ? (
            <PanelMessage className="py-10" tone="error" action={<TextButton onClick={() => fetchAudit(1)}>Réessayer</TextButton>}>
              L’historique des actions n’a pas pu être chargé.
            </PanelMessage>
          ) : audit.length === 0 ? (
            <PanelMessage className="py-10">Aucune action enregistrée pour l’instant.</PanelMessage>
          ) : (
            <ol className="divide-y divide-line-subtle">
              {audit.map((entry) => {
                const d = describeAuditEntry(entry);
                return (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[d.tone])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink first-letter:uppercase">{d.title}</p>
                      {d.detail && <p className="text-xs text-ink-2">{d.detail}</p>}
                      <p className="mt-0.5 text-xs tabular-nums text-ink-3">
                        {entry.actorName ?? "Système"} ·{" "}
                        {new Date(entry.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {audit.length > 0 && (auditHasMore || auditFailedPage !== null) && (
            <div className="flex items-center justify-center gap-2 border-t border-line-subtle px-5 py-2.5 text-[13px]">
              {auditFailedPage !== null && <span className="text-danger-ink">La suite n’a pas pu être chargée.</span>}
              <TextButton onClick={() => fetchAudit(auditFailedPage ?? auditPage + 1)} disabled={auditLoading}>
                {auditLoading ? "Chargement…" : auditFailedPage !== null ? "Réessayer" : "Voir plus"}
              </TextButton>
            </div>
          )}
        </Panel>
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

function StatusPill({ status }: { status: HrMonthStatus }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium", STATUS_STYLES[status])}>
      {isLockedStatus(status) && <Lock className="size-3" aria-hidden />}
      {STATUS_LABELS[status]}
    </span>
  );
}
