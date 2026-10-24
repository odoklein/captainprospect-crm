"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
    CalendarClock,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    MoreHorizontal,
    Power,
    Settings2,
} from "lucide-react";
import {
    Badge,
    Button,
    Callout,
    Card,
    Chip,
    ContextMenu,
    EmptyState,
    IconButton,
    Input,
    LoadingState,
    Modal,
    ModalFooter,
    PageHeader,
    Textarea,
    useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { LateReason, RowStatus, ScheduleRow, ScheduleSettings, Tick } from "@/lib/billing/cycle-schedule";
import type { BillingSchedule, BillingScheduleClient } from "@/lib/billing/schedule-service";

// ============================================
// Échéancier de facturation
// Each client is billed monthly from its first call; the invoice is due 14 days
// before each cycle. Invoices are made in the accounting tool, this page only
// tracks "facturé" / "payé". Data: /api/billing/schedule.
// ============================================

type Filter = "todo" | "all" | "disabled";
type BadgeVariant = "default" | "warning" | "info" | "success" | "danger";

const STATUS_META: Record<RowStatus, { label: string; variant: BadgeVariant }> = {
    UPCOMING: { label: "À venir", variant: "default" },
    TO_INVOICE: { label: "À facturer", variant: "warning" },
    INVOICED: { label: "Facturé – en attente de paiement", variant: "info" },
    PAID: { label: "Payé", variant: "success" },
    LATE: { label: "En retard", variant: "danger" },
    SETUP_TO_INVOICE: { label: "Setup à facturer", variant: "warning" },
    SETUP_INVOICED: { label: "Setup facturé – en attente de paiement", variant: "info" },
    SETUP_PAID: { label: "Setup payé", variant: "success" },
};

const LATE_LABEL: Record<LateReason, string> = {
    NOT_INVOICED: "non facturé",
    UNPAID: "impayé",
};

function statusLabel(status: RowStatus, lateReason?: LateReason): string {
    const base = STATUS_META[status].label;
    return status === "LATE" && lateReason ? `${base} · ${LATE_LABEL[lateReason]}` : base;
}

function StatusBadge({ row }: { row: Pick<ScheduleRow, "status" | "lateReason"> }) {
    return (
        <Badge variant={STATUS_META[row.status].variant} size="sm" dot>
            {statusLabel(row.status, row.lateReason)}
        </Badge>
    );
}

function toDate(day: string): Date {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function fmtDay(day: string | null | undefined, withYear = true): string {
    if (!day) return "—";
    return toDate(day).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
    });
}

function fmtRange(start: string | null, end: string | null): string {
    if (!start || !end) return "—";
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${fmtDay(start, !sameYear)} → ${fmtDay(end)}`;
}

function rowLabel(row: ScheduleRow): string {
    if (row.kind === "SETUP") return "Frais de setup";
    const label = toDate(row.cycleStart!).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `Cycle ${row.index + 1} · ${label}`;
}

function fmtAmount(amount: number | undefined): string {
    if (amount === undefined) return "";
    return amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) + " HT";
}

/** The row the list view acts on: the oldest one waiting on the manager. */
function focusRow(client: BillingScheduleClient): ScheduleRow | null {
    return client.schedule.open[0] ?? null;
}

function needsInvoice(row: ScheduleRow): boolean {
    return row.status === "TO_INVOICE" || row.status === "SETUP_TO_INVOICE" || (row.status === "LATE" && row.lateReason === "NOT_INVOICED");
}

function needsPayment(row: ScheduleRow): boolean {
    return row.status === "INVOICED" || row.status === "SETUP_INVOICED" || (row.status === "LATE" && row.lateReason === "UNPAID");
}

const SEVERITY: Record<string, number> = { LATE: 0, SETUP_TO_INVOICE: 1, TO_INVOICE: 1, SETUP_INVOICED: 2, INVOICED: 2 };

type RowModal = { client: BillingScheduleClient; row: ScheduleRow; mode: "invoice" | "pay" };

export default function BillingSchedulePage() {
    const toast = useToast();
    const [data, setData] = useState<BillingSchedule | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("todo");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [menu, setMenu] = useState<{ client: BillingScheduleClient; position: { x: number; y: number } } | null>(null);
    const [rowModal, setRowModal] = useState<RowModal | null>(null);
    const [anchorClient, setAnchorClient] = useState<BillingScheduleClient | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/billing/schedule");
            const json = await res.json();
            if (!json.success) {
                setError(json.error ?? "Impossible de charger l'échéancier");
                return;
            }
            setData(json.data as BillingSchedule);
        } catch {
            setError("Erreur réseau");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const patch = useCallback(
        async (url: string, body: unknown, successTitle: string): Promise<boolean> => {
            try {
                const res = await fetch(url, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = await res.json();
                if (!json.success) {
                    toast.error("Échec de l'enregistrement", json.error);
                    if (res.status === 409) void load();
                    return false;
                }
                toast.success(successTitle);
                void load();
                return true;
            } catch {
                toast.error("Erreur réseau");
                return false;
            }
        },
        [load, toast],
    );

    const counts = useMemo(() => {
        const clients = data?.clients ?? [];
        return {
            todo: clients.filter((c) => !c.schedule.disabled && c.schedule.open.length > 0).length,
            all: clients.filter((c) => !c.schedule.disabled).length,
            disabled: clients.filter((c) => c.schedule.disabled).length,
        };
    }, [data]);

    const visible = useMemo(() => {
        const clients = data?.clients ?? [];
        if (filter === "disabled") return clients.filter((c) => c.schedule.disabled);
        if (filter === "all") return clients.filter((c) => !c.schedule.disabled);
        return clients
            .filter((c) => !c.schedule.disabled && c.schedule.open.length > 0)
            .sort(
                (a, b) =>
                    (SEVERITY[a.schedule.headline] ?? 9) - (SEVERITY[b.schedule.headline] ?? 9) ||
                    a.clientName.localeCompare(b.clientName, "fr"),
            );
    }, [data, filter]);

    const toggle = (clientId: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(clientId)) next.delete(clientId);
            else next.add(clientId);
            return next;
        });

    const setDisabled = (client: BillingScheduleClient, disabled: boolean) =>
        patch(
            `/api/billing/schedule/${client.clientId}`,
            { disabled },
            disabled ? `Suivi désactivé pour ${client.clientName}` : `Suivi réactivé pour ${client.clientName}`,
        );

    const unmark = (client: BillingScheduleClient, row: ScheduleRow, action: "unmark-invoice" | "unmark-pay") =>
        patch(
            `/api/billing/schedule/${client.clientId}/rows/${row.key}`,
            { action },
            action === "unmark-pay" ? "Paiement annulé" : "Facturation annulée",
        );

    const settings = data?.settings;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Échéancier de facturation"
                subtitle={`Chaque client est facturé tous les mois à partir de son premier appel. La facture est à émettre ${settings?.leadDays ?? 14} jours avant chaque cycle.`}
                icon={<CalendarClock />}
                onRefresh={load}
                isRefreshing={loading}
                actions={
                    <Button variant="secondary" size="sm" leftIcon={<Settings2 className="size-3.5" />} onClick={() => setShowSettings(true)} disabled={!settings}>
                        Réglages
                    </Button>
                }
            />

            {settings && (
                <p className="text-xs text-ink-3">
                    {settings.trackFrom ? `Suivi des cycles commençant à partir du ${fmtDay(settings.trackFrom)}` : "Tous les cycles sont suivis"}
                    {` · facture à J−${settings.leadDays} · ${settings.firstCycleGraceDays} jours de délai sur le premier cycle avant retard.`}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Chip selected={filter === "todo"} onClick={() => setFilter("todo")} count={counts.todo}>
                    À traiter
                </Chip>
                <Chip selected={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
                    Tous
                </Chip>
                <Chip selected={filter === "disabled"} onClick={() => setFilter("disabled")} count={counts.disabled}>
                    Suivi désactivé
                </Chip>
            </div>

            {error && (
                <Callout
                    tone="danger"
                    title="Impossible de charger l'échéancier"
                    action={
                        <Button size="xs" variant="secondary" onClick={load}>
                            Réessayer
                        </Button>
                    }
                >
                    {error}
                </Callout>
            )}

            {loading && !data ? (
                <LoadingState message="Chargement de l'échéancier…" />
            ) : data && visible.length === 0 ? (
                <EmptyState
                    icon={CalendarDays}
                    title={
                        filter === "todo"
                            ? "Rien à facturer pour le moment"
                            : filter === "disabled"
                              ? "Aucun client avec le suivi désactivé"
                              : "Aucun client suivi"
                    }
                    description={
                        filter === "todo"
                            ? "Les cycles apparaissent ici 14 jours avant leur début, et restent tant qu'ils ne sont pas payés."
                            : undefined
                    }
                />
            ) : data ? (
                <Card padding="none" className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-sm">
                        <thead>
                            <tr className="border-b border-line text-left text-xs font-medium text-ink-3">
                                <th className="w-10 px-3 py-2.5" />
                                <th className="px-3 py-2.5">Client</th>
                                <th className="px-3 py-2.5">Premier appel</th>
                                <th className="px-3 py-2.5">Cycle en cours</th>
                                <th className="px-3 py-2.5">Prochain cycle</th>
                                <th className="px-3 py-2.5">Statut</th>
                                <th className="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((client) => {
                                const open = expanded.has(client.clientId);
                                return (
                                    <Fragment key={client.clientId}>
                                        <ClientRow
                                            client={client}
                                            expanded={open}
                                            onToggle={() => toggle(client.clientId)}
                                            onAction={(row, mode) => setRowModal({ client, row, mode })}
                                            onMenu={(position) => setMenu({ client, position })}
                                        />
                                        {open && (
                                            <tr className="border-b border-line bg-surface-2">
                                                <td colSpan={7} className="px-4 py-3">
                                                    <CycleHistory
                                                        client={client}
                                                        users={data.users}
                                                        onAction={(row, mode) => setRowModal({ client, row, mode })}
                                                        onUnmark={(row, action) => unmark(client, row, action)}
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            ) : null}

            <ContextMenu
                position={menu?.position ?? null}
                onClose={() => setMenu(null)}
                items={
                    menu
                        ? [
                              {
                                  label: "Modifier la date de départ",
                                  icon: <CalendarDays className="size-4" />,
                                  onClick: () => setAnchorClient(menu.client),
                              },
                              menu.client.schedule.disabled
                                  ? {
                                        label: "Réactiver le suivi",
                                        icon: <Power className="size-4" />,
                                        onClick: () => void setDisabled(menu.client, false),
                                    }
                                  : {
                                        label: "Désactiver le suivi",
                                        icon: <Power className="size-4" />,
                                        variant: "danger" as const,
                                        onClick: () => void setDisabled(menu.client, true),
                                    },
                          ]
                        : []
                }
            />

            {rowModal && data && (
                <RowActionModal
                    key={`${rowModal.client.clientId}:${rowModal.row.key}:${rowModal.mode}`}
                    modal={rowModal}
                    today={data.today}
                    onClose={() => setRowModal(null)}
                    onSubmit={async (body) => {
                        const ok = await patch(
                            `/api/billing/schedule/${rowModal.client.clientId}/rows/${rowModal.row.key}`,
                            body,
                            rowModal.mode === "invoice" ? "Marqué facturé" : "Marqué payé",
                        );
                        if (ok) setRowModal(null);
                    }}
                />
            )}

            {anchorClient && (
                <AnchorModal
                    key={anchorClient.clientId}
                    client={anchorClient}
                    onClose={() => setAnchorClient(null)}
                    onSubmit={async (anchorOverride) => {
                        const ok = await patch(
                            `/api/billing/schedule/${anchorClient.clientId}`,
                            { anchorOverride },
                            "Date de départ enregistrée",
                        );
                        if (ok) setAnchorClient(null);
                    }}
                />
            )}

            {showSettings && settings && (
                <SettingsModal
                    settings={settings}
                    onClose={() => setShowSettings(false)}
                    onSubmit={async (body) => {
                        const ok = await patch("/api/billing/schedule/settings", body, "Réglages enregistrés");
                        if (ok) setShowSettings(false);
                    }}
                />
            )}
        </div>
    );
}

// ============================================
// LIST ROW
// ============================================

function ClientRow({
    client,
    expanded,
    onToggle,
    onAction,
    onMenu,
}: {
    client: BillingScheduleClient;
    expanded: boolean;
    onToggle: () => void;
    onAction: (row: ScheduleRow, mode: "invoice" | "pay") => void;
    onMenu: (position: { x: number; y: number }) => void;
}) {
    const { schedule } = client;
    const focus = focusRow(client);
    const current = schedule.current;
    const next = schedule.next;

    return (
        <tr className={cn("border-b border-line align-top", !expanded && "hover:bg-surface-2")}>
            <td className="px-3 py-3">
                <IconButton
                    icon={expanded ? ChevronDown : ChevronRight}
                    label={expanded ? "Masquer l'historique" : "Voir l'historique des cycles"}
                    size="xs"
                    onClick={onToggle}
                />
            </td>
            <td className="px-3 py-3">
                <div className="font-medium text-ink">{client.clientName}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                    {client.clientStatus !== "ACTIVE" && (
                        <Badge size="xs" variant="outline">
                            {client.clientStatus === "PAUSED" ? "Client en pause" : "Client arrêté"}
                        </Badge>
                    )}
                    {schedule.anchorSource === "OVERRIDE" && (
                        <span className="text-xs text-ink-3">Départ fixé au {fmtDay(schedule.anchor)}</span>
                    )}
                </div>
            </td>
            <td className="px-3 py-3 text-ink-2">
                {client.firstCallDay ? fmtDay(client.firstCallDay) : <span className="text-ink-3">Pas encore d&apos;appel</span>}
            </td>
            <td className="px-3 py-3 text-ink-2">
                {current ? (
                    <>
                        <div>{fmtRange(current.cycleStart, current.cycleEnd)}</div>
                        <div className="mt-1">
                            {current.tracked ? <StatusBadge row={current} /> : <span className="text-xs text-ink-3">Avant le début du suivi</span>}
                        </div>
                    </>
                ) : (
                    <span className="text-ink-3">—</span>
                )}
            </td>
            <td className="px-3 py-3 text-ink-2">
                {next ? (
                    <>
                        <div>{fmtDay(next.cycleStart)}</div>
                        <div className="mt-0.5 text-xs text-ink-3">À facturer dès le {fmtDay(next.invoiceFrom, false)}</div>
                    </>
                ) : (
                    <span className="text-ink-3">—</span>
                )}
            </td>
            <td className="px-3 py-3">
                {schedule.disabled ? (
                    <Badge size="sm" variant="outline">Suivi désactivé</Badge>
                ) : focus ? (
                    <>
                        <StatusBadge row={focus} />
                        <div className="mt-1 text-xs text-ink-3">
                            {rowLabel(focus)}
                            {schedule.open.length > 1 && ` · +${schedule.open.length - 1} autre${schedule.open.length > 2 ? "s" : ""}`}
                        </div>
                    </>
                ) : schedule.headline === "NO_ANCHOR" ? (
                    <span className="text-xs text-ink-3">Rien à facturer (aucune mission active)</span>
                ) : (
                    <Badge size="sm" variant="success" dot>À jour</Badge>
                )}
            </td>
            <td className="px-3 py-3">
                <div className="flex items-center justify-end gap-1.5">
                    {focus && !schedule.disabled && needsInvoice(focus) && (
                        <Button size="xs" onClick={() => onAction(focus, "invoice")}>
                            Marquer facturé
                        </Button>
                    )}
                    {focus && !schedule.disabled && needsPayment(focus) && (
                        <Button size="xs" variant="secondary" onClick={() => onAction(focus, "pay")}>
                            Marquer payé
                        </Button>
                    )}
                    <IconButton
                        icon={MoreHorizontal}
                        label="Plus d'actions"
                        size="xs"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            onMenu({ x: rect.right - 200, y: rect.bottom + 4 });
                        }}
                    />
                </div>
            </td>
        </tr>
    );
}

// ============================================
// CYCLE HISTORY
// ============================================

function tickLine(tick: Tick | undefined, users: Record<string, string>): string[] {
    if (!tick) return [];
    const by = (id?: string) => (id && users[id] ? ` par ${users[id]}` : "");
    const lines: string[] = [];
    if (tick.invoicedAt) {
        const details = [fmtAmount(tick.amount), tick.reference ? `réf. ${tick.reference}` : ""].filter(Boolean).join(" · ");
        lines.push(`Facturé le ${fmtDay(tick.invoicedAt)}${by(tick.invoicedBy)}${details ? ` · ${details}` : ""}`);
    }
    if (tick.paidAt) lines.push(`Payé le ${fmtDay(tick.paidAt)}${by(tick.paidBy)}`);
    if (tick.note) lines.push(`Note : ${tick.note}`);
    return lines;
}

function CycleHistory({
    client,
    users,
    onAction,
    onUnmark,
}: {
    client: BillingScheduleClient;
    users: Record<string, string>;
    onAction: (row: ScheduleRow, mode: "invoice" | "pay") => void;
    onUnmark: (row: ScheduleRow, action: "unmark-invoice" | "unmark-pay") => void;
}) {
    const { schedule } = client;
    const rows = [...schedule.rows].reverse();

    if (rows.length === 0 && schedule.orphans.length === 0) {
        return <p className="text-xs text-ink-3">Aucun cycle : le client n&apos;a pas encore été appelé et n&apos;a pas de mission active.</p>;
    }

    return (
        <div className="space-y-2">
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {rows.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-ink">{rowLabel(row)}</span>
                                <StatusBadge row={row} />
                            </div>
                            {row.kind === "CYCLE" && (
                                <div className="mt-0.5 text-xs text-ink-3">
                                    {fmtRange(row.cycleStart, row.cycleEnd)} · à facturer dès le {fmtDay(row.invoiceFrom)}
                                </div>
                            )}
                            {tickLine(row.tick, users).map((line) => (
                                <div key={line} className="mt-0.5 text-xs text-ink-2">
                                    {line}
                                </div>
                            ))}
                        </div>
                        {!schedule.disabled && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {!row.tick?.invoicedAt && row.status !== "UPCOMING" && (
                                    <Button size="xs" onClick={() => onAction(row, "invoice")}>
                                        Marquer facturé
                                    </Button>
                                )}
                                {row.tick?.invoicedAt && !row.tick.paidAt && (
                                    <>
                                        <Button size="xs" variant="secondary" onClick={() => onAction(row, "pay")}>
                                            Marquer payé
                                        </Button>
                                        <Button size="xs" variant="ghost" onClick={() => onUnmark(row, "unmark-invoice")}>
                                            Annuler la facturation
                                        </Button>
                                    </>
                                )}
                                {row.tick?.paidAt && (
                                    <Button size="xs" variant="ghost" onClick={() => onUnmark(row, "unmark-pay")}>
                                        Annuler le paiement
                                    </Button>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            {schedule.orphans.length > 0 && (
                <Callout tone="neutral" title="Cycles hors échéancier">
                    La date de départ a changé : ces mois ne correspondent plus à un début de cycle.
                    {schedule.orphans.map((o) => (
                        <div key={o.key} className="mt-1 text-xs">
                            {o.key} · {tickLine(o.tick, users).join(" · ") || "—"}
                        </div>
                    ))}
                </Callout>
            )}
        </div>
    );
}

// ============================================
// MODALS
// ============================================

function RowActionModal({
    modal,
    today,
    onClose,
    onSubmit,
}: {
    modal: RowModal;
    today: string;
    onClose: () => void;
    onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
    const { client, row, mode } = modal;
    const [date, setDate] = useState(today);
    const [amount, setAmount] = useState(row.tick?.amount !== undefined ? String(row.tick.amount) : "");
    const [reference, setReference] = useState(row.tick?.reference ?? "");
    const [note, setNote] = useState(row.tick?.note ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const parsedAmount = amount.trim() === "" ? null : Number(amount.replace(",", ".").replace(/\s/g, ""));
        if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
            setError("Montant invalide");
            return;
        }
        if (!date) {
            setError("Date requise");
            return;
        }
        setSaving(true);
        const body: Record<string, unknown> = { action: mode, date, note: note.trim() || null };
        if (mode === "invoice") {
            body.amount = parsedAmount;
            body.reference = reference.trim() || null;
        }
        await onSubmit(body);
        setSaving(false);
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={mode === "invoice" ? "Marquer facturé" : "Marquer payé"}
            description={`${client.clientName} · ${rowLabel(row)}`}
            size="sm"
        >
            <div className="space-y-3">
                <Input
                    type="date"
                    label={mode === "invoice" ? "Date de la facture" : "Date du paiement"}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                />
                {mode === "invoice" && (
                    <>
                        <Input
                            label="Montant HT (optionnel)"
                            inputMode="decimal"
                            placeholder="ex. 2 500"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            endIcon={<span className="text-xs text-ink-3">€</span>}
                        />
                        <Input
                            label="Référence (Dougs, Indy…)"
                            placeholder="ex. F-2026-042"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                        />
                    </>
                )}
                {mode === "pay" && !row.tick?.invoicedAt && (
                    <p className="text-xs text-ink-3">Ce cycle n&apos;était pas marqué facturé : il le sera aussi, à la même date.</p>
                )}
                <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                {error && <p className="text-xs text-danger">{error}</p>}
            </div>
            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Annuler
                </Button>
                <Button onClick={submit} isLoading={saving}>
                    {mode === "invoice" ? "Marquer facturé" : "Marquer payé"}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function AnchorModal({
    client,
    onClose,
    onSubmit,
}: {
    client: BillingScheduleClient;
    onClose: () => void;
    onSubmit: (anchorOverride: string | null) => Promise<void>;
}) {
    const [date, setDate] = useState(client.anchorOverride ?? client.firstCallDay ?? "");
    const [saving, setSaving] = useState(false);

    const save = async (value: string | null) => {
        setSaving(true);
        await onSubmit(value);
        setSaving(false);
    };

    return (
        <Modal isOpen onClose={onClose} title="Modifier la date de départ" description={client.clientName} size="sm">
            <div className="space-y-3">
                <p className="text-sm text-ink-2">
                    Par défaut, les cycles partent du premier appel
                    {client.firstCallDay ? ` (${fmtDay(client.firstCallDay)})` : ", qui n'a pas encore eu lieu"}. Une date choisie ici le remplace.
                </p>
                <Input type="date" label="Début du premier cycle" value={date} onChange={(e) => setDate(e.target.value)} />
                {client.anchorOverride && (
                    <p className="text-xs text-ink-3">
                        Les cycles déjà marqués sur un autre mois restent visibles dans l&apos;historique.
                    </p>
                )}
            </div>
            <ModalFooter>
                {client.anchorOverride && (
                    <Button variant="ghost" onClick={() => save(null)} disabled={saving} className="mr-auto">
                        Revenir au premier appel
                    </Button>
                )}
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Annuler
                </Button>
                <Button onClick={() => save(date)} isLoading={saving} disabled={!date}>
                    Enregistrer
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function SettingsModal({
    settings,
    onClose,
    onSubmit,
}: {
    settings: ScheduleSettings;
    onClose: () => void;
    onSubmit: (body: Partial<ScheduleSettings>) => Promise<void>;
}) {
    const [trackFrom, setTrackFrom] = useState(settings.trackFrom ?? "");
    const [leadDays, setLeadDays] = useState(String(settings.leadDays));
    const [grace, setGrace] = useState(String(settings.firstCycleGraceDays));
    const [saving, setSaving] = useState(false);
    const lead = Number(leadDays);
    const graceDays = Number(grace);
    const valid = Number.isInteger(lead) && lead >= 0 && lead <= 90 && Number.isInteger(graceDays) && graceDays >= 0 && graceDays <= 90;

    const save = async () => {
        setSaving(true);
        await onSubmit({ trackFrom: trackFrom || null, leadDays: lead, firstCycleGraceDays: graceDays });
        setSaving(false);
    };

    return (
        <Modal isOpen onClose={onClose} title="Réglages de l'échéancier" size="sm">
            <div className="space-y-3">
                <Input
                    type="date"
                    label="Suivre les cycles à partir du"
                    hint="Les cycles commençant avant cette date ne sont pas signalés, sauf s'ils ont été marqués. Vide = tout l'historique."
                    value={trackFrom}
                    onChange={(e) => setTrackFrom(e.target.value)}
                />
                <Input
                    type="number"
                    min={0}
                    max={90}
                    label="Facturer combien de jours avant le cycle"
                    value={leadDays}
                    onChange={(e) => setLeadDays(e.target.value)}
                />
                <Input
                    type="number"
                    min={0}
                    max={90}
                    label="Délai avant retard sur le premier cycle (jours)"
                    value={grace}
                    onChange={(e) => setGrace(e.target.value)}
                />
            </div>
            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Annuler
                </Button>
                <Button onClick={save} isLoading={saving} disabled={!valid}>
                    Enregistrer
                </Button>
            </ModalFooter>
        </Modal>
    );
}
