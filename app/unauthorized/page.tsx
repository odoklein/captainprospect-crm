import { Card, Button } from "@/components/ui";
import { ShieldX, ArrowLeft, Home } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <Card variant="glass" className="max-w-md w-full text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-red-50 mx-auto mb-6 flex items-center justify-center">
                    <ShieldX className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Accès non autorisé</h1>
                <p className="text-slate-500 mb-6">
                    Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
                </p>
                <div className="flex gap-3 justify-center">
                    <Link href="/">
                        <Button variant="secondary" className="gap-2">
                            <Home className="w-4 h-4" />
                            Accueil
                        </Button>
                    </Link>
                    <Link href="/login">
                        <Button variant="primary" className="gap-2">
                            <ArrowLeft className="w-4 h-4" />
                            Connexion
                        </Button>
                    </Link>
                </div>
            </Card>
        </div>
    );
}
