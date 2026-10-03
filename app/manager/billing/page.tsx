"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    Receipt,
    TrendingUp,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Users,
    FileText,
    Euro,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    Plus,
    Download,
    FileX2,
    BarChart3,
    Settings,
    ChevronRight,
    Zap,
    Shield,
    Tag,
    CalendarDays,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ChartTooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from "recharts";

interface BillingStats {
    totalInvoices: number;
    totalClients: number;
    totalHt: number;
    totalTtc: number;
    draftCount: number;
    validatedCount: number;
    sentCount: number;
    paidCount: number;
    cancelledCount: number;
    overdueCount: number;
    creditNoteCount: number;
    thisMonthTtc: number;
    lastMonthTtc: number;
}

interface RecentInvoice {
    id: string;
    invoiceNumber: string | null;
    status: string;
    documentType: string;
    totalTtc: number;
    issueDate: string;
    dueDate: string;
    billingClient: { legalName: string };
}

interface AgingBucket {
    label: string;
    range: string;
    count: number;
    totalHt: number;
    totalTtc: number;
}

interface MonthlyRevenue {
    month: string;
    revenue: number;
    invoiceCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    DRAFT: { label: "Brouillon", color: "text-slate-600", bg: "bg-slate-100", dot: "bg-slate-400" },
    VALIDATED: { label: "Validée", color: "text-primary-700", bg: "bg-primary-50", dot: "bg-primary-500" },
    SENT: { label: "Envoyée", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
    PAID: { label: "Payée", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
    CANCELLED: { label: "Annulée", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
    PARTIALLY_PAID: { label: "Part. payée", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
};

export default function BillingDashboardPage() {
    const { error: showError } = useToast();
    const router = useRouter();
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
    const [aging, setAging] = useState<AgingBucket[]>([]);
    const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
    const [dso, setDso] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { fetchBillingData(); }, []);

    const fetchBillingData = async () => {
        setIsLoading(true);
        try {
            const [invoicesRes, clientsRes, statsRes] = await Promise.all([
                fetch("/api/billing/invoices?limit=100"),
                fetch("/api/billing/clients"),
                fetch("/api/billing/stats?type=overview"),
            ]);

            const [invoicesJson, clientsJson, statsJson] = await Promise.all([
                invoicesRes.json(), clientsRes.json(), statsRes.json(),
            ]);

            if (invoicesJson.success && clientsJson.success) {
                const invoices = invoicesJson.data;
                const clients = clientsJson.data;
                const now = new Date();
                const thisMonthStart = startOfMonth(now);
                const thisMonthEnd = endOfMonth(now);
                const lastMonthStart = startOfMonth(subMonths(now, 1));
                const lastMonthEnd = endOfMonth(subMonths(now, 1));

                const calcStats: BillingStats = {
                    totalInvoices: invoices.filter((inv: any) => inv.documentType !== "CREDIT_NOTE").length,
                    totalClients: clients.length,
                    totalHt: invoices.reduce((sum: number, inv: any) => sum + Number(inv.totalHt || 0), 0),
                    totalTtc: invoices.reduce((sum: number, inv: any) => sum + Number(inv.totalTtc || 0), 0),
                    draftCount: invoices.filter((inv: any) => inv.status === "DRAFT" && inv.documentType !== "CREDIT_NOTE").length,
                    validatedCount: invoices.filter((inv: any) => inv.status === "VALIDATED" && inv.documentType !== "CREDIT_NOTE").length,
                    sentCount: invoices.filter((inv: any) => inv.status === "SENT").length,
                    paidCount: invoices.filter((inv: any) => inv.status === "PAID" && inv.documentType !== "CREDIT_NOTE").length,
                    cancelledCount: invoices.filter((inv: any) => inv.status === "CANCELLED").length,
                    creditNoteCount: invoices.filter((inv: any) => inv.documentType === "CREDIT_NOTE").length,
                    overdueCount: invoices.filter((inv: any) => {
                        if (["PAID", "CANCELLED"].includes(inv.status)) return false;
                        return new Date(inv.dueDate) < now;
                    }).length,
                    thisMonthTtc: invoices
                        .filter((inv: any) => {
                            const date = new Date(inv.issueDate);
                            return date >= thisMonthStart && date <= thisMonthEnd && inv.documentType !== "CREDIT_NOTE";
                        })
                        .reduce((sum: number, inv: any) => sum + Number(inv.totalTtc || 0), 0),
                    lastMonthTtc: invoices
                        .filter((inv: any) => {
                            const date = new Date(inv.issueDate);
                            return date >= lastMonthStart && date <= lastMonthEnd && inv.documentType !== "CREDIT_NOTE";
                        })
                        .reduce((sum: number, inv: any) => sum + Number(inv.totalTtc || 0), 0),
                };

                setStats(calcStats);
                setRecentInvoices(invoices.slice(0, 5));
            }

            if (statsJson.success) {
                setAging(statsJson.data.aging || []);
                setMonthlyRevenue(statsJson.data.monthlyRevenue || []);
                setDso(statsJson.data.dso || 0);
            }
        } catch (err) {
            showError("Erreur", "Impossible de charger les données de facturation");
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

    const getGrowthPercentage = () => {
        if (!stats) return 0;
        if (stats.lastMonthTtc === 0) return stats.thisMonthTtc > 0 ? 100 : 0;
        return Math.round(((stats.thisMonthTtc - stats.lastMonthTtc) / stats.lastMonthTtc) * 100);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-400 mb-3" />
                    <p className="text-sm text-slate-500">Chargement du tableau de bord...</p>
                </div>
            </div>
        );
    }

    const growth = getGrowthPercentage();

    return (
        <div className="space-y-8 max-w-[1280px] mx-auto">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-slate-900 rounded-2xl p-8 text-white">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 text-primary-300 text-sm font-medium mb-2">
                        <Shield className="w-4 h-4" />
                        <span>Conforme Factur-X EN16931 / EU 2026</span>
                    </div>
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-bold mb-1">Facturation</h1>
                            <p className="text-slate-400 text-sm">
                                {stats?.totalInvoices || 0} factures - {stats?.totalClients || 0} clients
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => window.open("/api/billing/export", "_blank")}
                                className="text-white/70 hover:text-white hover:bg-white/10"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                            <Link href="/manager/billing/settings">
                                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
                                    <Settings className="w-4 h-4 mr-2" />
                                    Paramètres
                                </Button>
                            </Link>
                            <Link href="/manager/billing/invoices/new">
                                <Button className="bg-white text-primary-700 hover:bg-primary-50 shadow-sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nouvelle facture
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Revenue */}
                <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-lg hover:border-primary-200 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 ring-1 ring-inset ring-primary-100 flex items-center justify-center">
                            <Euro className="w-5 h-5 text-primary-600" />
                        </div>
                        {growth !== 0 && (
                            <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
                                growth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                            }`}>
                                {growth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {Math.abs(growth)}%
                            </div>
                        )}
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(stats?.totalTtc || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">Chiffre d&apos;affaires total</p>
                </div>

                {/* Invoices */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-lg hover:border-primary-200 transition-all duration-300">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 ring-1 ring-inset ring-blue-100 flex items-center justify-center mb-3">
                        <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{stats?.totalInvoices || 0}</p>
                    <p className="text-xs text-slate-500 mt-1">Factures total</p>
                    <p className="text-[11px] text-primary-600 font-medium mt-1">{stats?.paidCount || 0} payées</p>
                </div>

                {/* DSO */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-lg hover:border-primary-200 transition-all duration-300">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 ring-1 ring-inset ring-amber-100 flex items-center justify-center mb-3">
                        <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{dso}<span className="text-sm font-normal text-slate-400 ml-1">j</span></p>
                    <p className="text-xs text-slate-500 mt-1">DSO moyen</p>
                </div>

                {/* Overdue */}
                <div className={`rounded-2xl border p-5 hover:shadow-lg transition-all duration-300 ${
                    (stats?.overdueCount || 0) > 0
                        ? "border-red-200 bg-red-50/30"
                        : "border-slate-200 bg-white"
                }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                        (stats?.overdueCount || 0) > 0
                            ? "bg-red-50 ring-1 ring-inset ring-red-100"
                            : "bg-slate-100"
                    }`}>
                        <AlertTriangle className={`w-5 h-5 ${(stats?.overdueCount || 0) > 0 ? "text-red-500" : "text-slate-400"}`} />
                    </div>
                    <p className={`text-2xl font-bold ${(stats?.overdueCount || 0) > 0 ? "text-red-600" : "text-slate-900"}`}>
                        {stats?.overdueCount || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">En retard</p>
                    {(stats?.overdueCount || 0) > 0 && (
                        <p className="text-[11px] text-red-500 font-medium mt-1">Action requise</p>
                    )}
                </div>

                {/* Credit Notes */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-lg hover:border-primary-200 transition-all duration-300">
                    <div className="w-10 h-10 rounded-xl bg-accent-50 ring-1 ring-inset ring-accent-100 flex items-center justify-center mb-3">
                        <FileX2 className="w-5 h-5 text-accent-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{stats?.creditNoteCount || 0}</p>
                    <p className="text-xs text-slate-500 mt-1">Avoirs</p>
                    <p className="text-[11px] text-primary-600 font-medium mt-1">{stats?.totalClients || 0} clients</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-base font-semibold text-slate-900">Chiffre d&apos;affaires mensuel</h3>
                            <p className="text-xs text-slate-500 mt-0.5">12 derniers mois</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <div className="w-3 h-3 rounded bg-primary-500" />
                            Revenus
                        </div>
                    </div>
                    {monthlyRevenue.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={monthlyRevenue}>
                                <defs>
                                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                    axisLine={false}
                                    tickLine={false}
                                    width={50}
                                />
                                <ChartTooltip
                                    contentStyle={{
                                        background: "white",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "12px",
                                        boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                                        padding: "12px 16px",
                                    }}
                                    formatter={(value: number) => [formatCurrency(value), "CA"]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#6366f1"
                                    strokeWidth={2.5}
                                    fill="url(#revenueGrad)"
                                    dot={{ r: 4, fill: "white", stroke: "#6366f1", strokeWidth: 2 }}
                                    activeDot={{ r: 6, fill: "#6366f1", stroke: "white", strokeWidth: 3 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <BarChart3 className="w-10 h-10 mb-3 text-slate-300" />
                            <p className="text-sm">Aucune donnée disponible</p>
                        </div>
                    )}
                </div>

                {/* Status Pipeline */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <h3 className="text-base font-semibold text-slate-900 mb-5">Pipeline</h3>
                    <div className="space-y-2">
                        {[
                            { key: "DRAFT", count: stats?.draftCount || 0 },
                            { key: "VALIDATED", count: stats?.validatedCount || 0 },
                            { key: "SENT", count: stats?.sentCount || 0 },
                            { key: "PAID", count: stats?.paidCount || 0 },
                            ...(stats?.cancelledCount ? [{ key: "CANCELLED", count: stats.cancelledCount }] : []),
                        ].map((item) => {
                            const sc = STATUS_CONFIG[item.key];
                            const total = stats?.totalInvoices || 1;
                            const pct = Math.round((item.count / total) * 100) || 0;
                            return (
                                <Link
                                    key={item.key}
                                    href={`/manager/billing/invoices?status=${item.key}`}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                                >
                                    <div className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
                                    <span className="text-sm text-slate-700 flex-1 group-hover:text-slate-900">{sc.label}</span>
                                    <span className="text-sm font-bold text-slate-900 tabular-nums w-8 text-right">{item.count}</span>
                                    <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${sc.dot} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-100 mt-5 pt-5">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Actions rapides</p>
                        <div className="space-y-2">
                            <Link href="/manager/billing/invoices/new" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary-50 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                    <Plus className="w-4 h-4 text-primary-600" />
                                </div>
                                <span className="text-sm text-slate-700 group-hover:text-primary-700">Nouvelle facture</span>
                            </Link>
                            <Link href="/manager/billing/clients" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary-50 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                    <Users className="w-4 h-4 text-primary-600" />
                                </div>
                                <span className="text-sm text-slate-700 group-hover:text-primary-700">Gérer les clients</span>
                            </Link>
                            <Link href="/manager/billing/offres" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary-50 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                    <Tag className="w-4 h-4 text-primary-600" />
                                </div>
                                <span className="text-sm text-slate-700 group-hover:text-primary-700">Offres & Tarifs</span>
                            </Link>
                            <Link href="/manager/billing/engagements" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary-50 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                    <CalendarDays className="w-4 h-4 text-primary-600" />
                                </div>
                                <span className="text-sm text-slate-700 group-hover:text-primary-700">Engagements</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Aging Report */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-base font-semibold text-slate-900">Créances par ancienneté</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Balance âgée des encours clients</p>
                        </div>
                    </div>
                    {aging.length > 0 ? (
                        <div className="space-y-2">
                            {aging.map((bucket, idx) => {
                                const colors = [
                                    "bg-emerald-50 border-emerald-100",
                                    "bg-emerald-50/50 border-emerald-100/50",
                                    "bg-amber-50/50 border-amber-100/50",
                                    "bg-amber-50 border-amber-100",
                                    "bg-red-50/50 border-red-100/50",
                                    "bg-red-50 border-red-100",
                                ];
                                return (
                                    <div
                                        key={idx}
                                        className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-150 ${
                                            bucket.count === 0 ? "bg-slate-50 border-slate-100 opacity-40" : colors[idx] || colors[5]
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-8 rounded-full ${
                                                bucket.count === 0 ? "bg-slate-200" :
                                                idx <= 1 ? "bg-emerald-400" :
                                                idx <= 3 ? "bg-amber-400" : "bg-red-400"
                                            }`} />
                                            <div>
                                                <div className="text-sm font-medium text-slate-900">{bucket.label}</div>
                                                <div className="text-xs text-slate-500">{bucket.count} facture(s)</div>
                                            </div>
                                        </div>
                                        <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(bucket.totalTtc)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-300" />
                            <p className="text-sm font-medium text-slate-500">Aucune créance en cours</p>
                        </div>
                    )}
                </div>

                {/* Recent Invoices */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-semibold text-slate-900">Dernières factures</h3>
                        <Link href="/manager/billing/invoices" className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors flex items-center gap-1">
                            Tout voir <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                    {recentInvoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                                <Receipt className="w-7 h-7 text-slate-300" />
                            </div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Aucune facture</p>
                            <p className="text-xs text-slate-400 mb-4">Créez votre première facture</p>
                            <Link href="/manager/billing/invoices/new">
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Créer
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {recentInvoices.map((invoice) => {
                                const sc = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.DRAFT;
                                const isCredit = invoice.documentType === "CREDIT_NOTE";
                                return (
                                    <button
                                        key={invoice.id}
                                        onClick={() => router.push(`/manager/billing/invoices/${invoice.id}`)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all duration-150 text-left group"
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            isCredit ? "bg-red-50" : "bg-slate-100"
                                        }`}>
                                            {isCredit ? (
                                                <FileX2 className="w-4 h-4 text-red-500" />
                                            ) : (
                                                <Receipt className="w-4 h-4 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-900 truncate group-hover:text-primary-700 transition-colors">
                                                    {invoice.invoiceNumber || "Brouillon"}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${sc.bg} ${sc.color}`}>
                                                    <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                                                    {sc.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">{invoice.billingClient.legalName}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className={`text-sm font-bold tabular-nums ${isCredit ? "text-red-600" : "text-slate-900"}`}>
                                                {isCredit ? "-" : ""}{formatCurrency(Number(invoice.totalTtc))}
                                            </p>
                                            <p className="text-[11px] text-slate-400">
                                                {format(new Date(invoice.issueDate), "dd MMM", { locale: fr })}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
