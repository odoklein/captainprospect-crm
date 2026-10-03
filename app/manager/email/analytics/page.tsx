"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    Send,
    Eye,
    MousePointer,
    Reply,
    AlertTriangle,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    BarChart3,
    Loader2,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

// ============================================
// TYPES
// ============================================

interface Analytics {
    summary: {
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        replied: number;
        bounced: number;
    };
    rates: {
        openRate: number;
        clickRate: number;
        replyRate: number;
        bounceRate: number;
    };
    daily: {
        date: string;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        replied: number;
        bounced: number;
    }[];
    topSequences: {
        id: string;
        name: string;
        totalEnrolled: number;
        totalCompleted: number;
        totalReplied: number;
        totalBounced: number;
    }[];
    avgResponseTime: number;
    period: string;
    mailboxCount: number;
}

// ============================================
// EMAIL ANALYTICS PAGE
// ============================================

export default function EmailAnalyticsPage() {
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState("30d");

    // Fetch analytics
    useEffect(() => {
        const fetchAnalytics = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/email/analytics?period=${period}`);
                const json = await res.json();
                if (json.success) {
                    setAnalytics(json.data);
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalytics();
    }, [period]);

    const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    const getRateColor = (rate: number, type: 'open' | 'click' | 'reply' | 'bounce') => {
        const thresholds = {
            open: { good: 30, ok: 20 },
            click: { good: 5, ok: 2 },
            reply: { good: 10, ok: 5 },
            bounce: { good: 2, ok: 5 }, // inverted
        };

        if (type === 'bounce') {
            if (rate <= thresholds.bounce.good) return 'text-emerald-600';
            if (rate <= thresholds.bounce.ok) return 'text-amber-600';
            return 'text-red-600';
        }

        if (rate >= thresholds[type].good) return 'text-emerald-600';
        if (rate >= thresholds[type].ok) return 'text-amber-600';
        return 'text-red-600';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (!analytics) {
        return (
            <div className="p-6 text-center text-slate-500">
                Impossible de charger les analytics
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Email Analytics</h1>
                    <p className="text-sm text-slate-500">
                        Performance de {analytics.mailboxCount} boîte{analytics.mailboxCount > 1 ? 's' : ''} mail
                    </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {[
                        { value: "7d", label: "7 jours" },
                        { value: "30d", label: "30 jours" },
                        { value: "90d", label: "90 jours" },
                    ].map((option) => (
                        <button
                            key={option.value}
                            onClick={() => setPeriod(option.value)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                period === option.value
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-600 hover:text-slate-900"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                                <Send className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatNumber(analytics.summary.sent)}
                                </p>
                                <p className="text-xs text-slate-500">Envoyés</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <Eye className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatNumber(analytics.summary.opened)}
                                </p>
                                <p className="text-xs text-slate-500">Ouverts</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                <MousePointer className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatNumber(analytics.summary.clicked)}
                                </p>
                                <p className="text-xs text-slate-500">Clics</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center">
                                <Reply className="w-5 h-5 text-accent-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatNumber(analytics.summary.replied)}
                                </p>
                                <p className="text-xs text-slate-500">Réponses</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatNumber(analytics.summary.bounced)}
                                </p>
                                <p className="text-xs text-slate-500">Bounces</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    {analytics.avgResponseTime}m
                                </p>
                                <p className="text-xs text-slate-500">Temps réponse</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Rate Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-slate-50">
                    <CardContent className="pt-4">
                        <p className="text-sm font-medium text-slate-600 mb-1">Taux d'ouverture</p>
                        <p className={cn("text-3xl font-bold", getRateColor(analytics.rates.openRate, 'open'))}>
                            {analytics.rates.openRate}%
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {analytics.summary.opened} / {analytics.summary.delivered} délivrés
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50">
                    <CardContent className="pt-4">
                        <p className="text-sm font-medium text-slate-600 mb-1">Taux de clic</p>
                        <p className={cn("text-3xl font-bold", getRateColor(analytics.rates.clickRate, 'click'))}>
                            {analytics.rates.clickRate}%
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {analytics.summary.clicked} / {analytics.summary.opened} ouverts
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50">
                    <CardContent className="pt-4">
                        <p className="text-sm font-medium text-slate-600 mb-1">Taux de réponse</p>
                        <p className={cn("text-3xl font-bold", getRateColor(analytics.rates.replyRate, 'reply'))}>
                            {analytics.rates.replyRate}%
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {analytics.summary.replied} / {analytics.summary.delivered} délivrés
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-50">
                    <CardContent className="pt-4">
                        <p className="text-sm font-medium text-slate-600 mb-1">Taux de bounce</p>
                        <p className={cn("text-3xl font-bold", getRateColor(analytics.rates.bounceRate, 'bounce'))}>
                            {analytics.rates.bounceRate}%
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {analytics.summary.bounced} / {analytics.summary.sent} envoyés
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Activity Chart Placeholder */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-slate-400" />
                            Activité quotidienne
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 flex items-end gap-1">
                            {analytics.daily.slice(-14).map((day, i) => {
                                const maxSent = Math.max(...analytics.daily.map(d => d.sent), 1);
                                const height = (day.sent / maxSent) * 100;
                                
                                return (
                                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                                        <div 
                                            className="w-full bg-primary-500 rounded-t transition-all hover:bg-primary-400"
                                            style={{ height: `${Math.max(height, 4)}%` }}
                                            title={`${day.date}: ${day.sent} envoyés`}
                                        />
                                        {i % 2 === 0 && (
                                            <span className="text-[10px] text-slate-400">
                                                {new Date(day.date).getDate()}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Sequences */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-slate-400" />
                                Meilleures séquences
                            </span>
                            <a 
                                href="/manager/email/sequences"
                                className="text-sm font-normal text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                                Voir toutes
                                <ArrowUpRight className="w-4 h-4" />
                            </a>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {analytics.topSequences.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-8">
                                Aucune séquence active
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {analytics.topSequences.map((sequence, i) => {
                                    const replyRate = sequence.totalEnrolled > 0 
                                        ? (sequence.totalReplied / sequence.totalEnrolled) * 100 
                                        : 0;
                                    
                                    return (
                                        <div 
                                            key={sequence.id}
                                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                                        >
                                            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">
                                                {i + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">
                                                    {sequence.name}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {sequence.totalEnrolled} inscrits · {sequence.totalReplied} réponses
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn(
                                                    "text-sm font-semibold",
                                                    replyRate >= 10 ? "text-emerald-600" : 
                                                    replyRate >= 5 ? "text-amber-600" : "text-slate-600"
                                                )}>
                                                    {replyRate.toFixed(1)}%
                                                </p>
                                                <p className="text-xs text-slate-400">réponse</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
