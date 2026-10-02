"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, Button } from "@/components/ui";
import { ShieldX } from "lucide-react";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import { PlanningBoard } from "@/app/manager/planning/board/PlanningBoard";

export default function SdrPlanningPage() {
    const router = useRouter();
    const { hasPermission, isLoading } = usePermissions();

    useEffect(() => {
        if (isLoading) return;
        if (!hasPermission("pages.planning")) {
            router.push("/unauthorized");
        }
    }, [hasPermission, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fafbfc]">
                <div className="flex flex-col items-center gap-3">
                    <div className="cp-spinner" />
                    <p className="text-sm text-slate-400 font-medium">Chargement...</p>
                </div>
            </div>
        );
    }

    if (!hasPermission("pages.planning")) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4">
                <Card
                    variant="glass"
                    className="max-w-md w-full text-center shadow-xl shadow-slate-200/50"
                >
                    <div className="w-16 h-16 rounded-2xl bg-red-50 mx-auto mb-6 flex items-center justify-center">
                        <ShieldX className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Accès non autorisé</h1>
                    <p className="text-slate-500 mb-6">
                        Vous n&apos;avez pas les permissions nécessaires pour accéder au planning.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link href="/">
                            <Button variant="secondary" className="gap-2">
                                Accueil
                            </Button>
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    return <PlanningBoard />;
}

