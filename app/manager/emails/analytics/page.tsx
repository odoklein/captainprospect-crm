"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { BarChart3, ArrowRight } from "lucide-react";

// ============================================
// ANALYTICS PAGE — Placeholder for Phase 5
// /manager/emails/analytics
// ============================================

export default function AnalyticsPage() {
    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <Card className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#E7EFE9] flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="w-8 h-8 text-[#2B5F3E]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                    Analytics Email
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                    Métriques détaillées, performance par mission, heatmap d&apos;ouverture,
                    performance par SDR et templates.
                </p>
                <a
                    href="/manager/email/analytics"
                    className="inline-flex items-center gap-2 text-sm text-[#2B5F3E] font-medium hover:text-[#224A31] transition-colors"
                >
                    Voir la page actuelle
                    <ArrowRight className="w-4 h-4" />
                </a>
            </Card>
        </div>
    );
}
