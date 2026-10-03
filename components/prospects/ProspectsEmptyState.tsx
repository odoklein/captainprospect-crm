"use client";

import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { Users, Plus, BookOpen, ListChecks } from "lucide-react";
import Link from "next/link";

// ============================================
// PROSPECTS EMPTY STATE
// ============================================

interface ProspectsEmptyStateProps {
    hasSources: boolean;
    hasRules: boolean;
}

export function ProspectsEmptyState({ hasSources, hasRules }: ProspectsEmptyStateProps) {
    const router = useRouter();

    if (!hasSources) {
        return (
            <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Plus className="w-8 h-8 text-primary-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">
                        Commencez par configurer une source
                    </h3>
                    <p className="text-slate-600 mb-6">
                        Pour recevoir des leads, vous devez d'abord configurer une intégration (formulaire web, API, etc.).
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Button onClick={() => router.push("/manager/prospects/sources/new")}>
                            <Plus className="w-4 h-4 mr-2" />
                            Ajouter une intégration
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => router.push("/manager/prospects/help")}
                        >
                            <BookOpen className="w-4 h-4 mr-2" />
                            Guide de démarrage
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    if (!hasRules) {
        return (
            <Card className="p-12 text-center">
                <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ListChecks className="w-8 h-8 text-amber-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">
                        Configurez vos règles
                    </h3>
                    <p className="text-slate-600 mb-6">
                        Créez des règles pour automatiser la validation et le scoring des prospects entrants.
                    </p>
                    <Button onClick={() => router.push("/manager/prospects/rules")}>
                        <Plus className="w-4 h-4 mr-2" />
                        Créer une règle
                    </Button>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Aucun prospect pour le moment
                </h3>
                <p className="text-slate-600 mb-6">
                    Les nouveaux leads de vos sources configurées apparaîtront ici automatiquement.
                </p>
                <div className="flex gap-3 justify-center">
                    <Button
                        variant="secondary"
                        onClick={() => router.push("/manager/prospects/sources")}
                    >
                        Voir les sources
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => router.push("/manager/prospects/sandbox")}
                    >
                        Mode test
                    </Button>
                </div>
            </div>
        </Card>
    );
}
