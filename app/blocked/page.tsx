"use client";

import { signOut } from "next-auth/react";
import { ShieldX, LogOut, Mail } from "lucide-react";
import { brand } from "@/lib/brand";

export default function BlockedPage() {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                {/* Icon */}
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <ShieldX className="w-10 h-10 text-red-400" />
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-white mb-2">
                    Compte Désactivé
                </h1>

                {/* Description */}
                <p className="text-slate-400 mb-8">
                    Votre compte a été désactivé par un administrateur. 
                    Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, veuillez contacter le support.
                </p>

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Se déconnecter
                    </button>
                    
                    <a
                        href={`mailto:${brand.email.supportAddress}`}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition-colors"
                    >
                        <Mail className="w-4 h-4" />
                        Contacter le support
                    </a>
                </div>

                {/* Footer */}
                <p className="mt-8 text-sm text-slate-500">
                    Code d&apos;erreur: ACCOUNT_DISABLED
                </p>
            </div>
        </div>
    );
}
