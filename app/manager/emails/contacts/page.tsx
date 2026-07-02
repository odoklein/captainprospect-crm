"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Users, ArrowRight } from "lucide-react";

// ============================================
// CONTACTS PAGE — Placeholder for Phase 3
// /manager/emails/contacts
// ============================================

export default function ContactsPage() {
    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <Card className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#E7EFE9] flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-[#2B5F3E]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">
                    Sélection de contacts
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
                    Sélectionnez des contacts par mission, liste ou résultat d&apos;action,
                    puis envoyez un email en masse ou inscrivez-les dans une séquence.
                </p>
                <span className="inline-flex items-center gap-2 text-sm text-[#2B5F3E] font-medium">
                    Bientôt disponible
                    <ArrowRight className="w-4 h-4" />
                </span>
            </Card>
        </div>
    );
}
