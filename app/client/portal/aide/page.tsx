"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

// ============================================
// FAQ SECTIONS (French)
// ============================================

const SECTIONS: { id: string; title: string; content: React.ReactNode }[] = [
    {
        id: "intro",
        title: "Qu'est-ce que le portail client ?",
        content: (
            <p className="text-ink text-sm leading-relaxed">
                Le portail client vous permet de suivre l&apos;activité de prospection de notre équipe
                pour vos missions : statistiques, contacts qualifiés (opportunités), rendez-vous réservés,
                échanges par messages et fichiers. Vous y accédez après connexion avec vos identifiants.
            </p>
        ),
    },
    {
        id: "accueil",
        title: "Accueil (tableau de bord)",
        content: (
            <div className="text-sm text-ink space-y-2">
                <p>
                    Sur l&apos;accueil vous retrouvez : les statistiques sur la période choisie (nombre
                    d&apos;actions, RDV, opportunités, taux de conversion), les contacts qualifiés pour vous
                    avec export CSV, la liste de vos missions en cours, un accès rapide à l&apos;activité email
                    et un lien vers vos RDV.
                </p>
                <p>
                    Utilisez le filtre de date en haut à droite pour changer la période affichée.
                </p>
            </div>
        ),
    },
    {
        id: "rdv",
        title: "Mes RDV",
        content: (
            <div className="text-sm text-ink space-y-2">
                <p>
                    La page « Mes RDV » liste tous les rendez-vous réservés pour vos missions. Vous pouvez
                    filtrer par plage de dates, mission ou campagne, et voir pour chaque RDV le contact,
                    l&apos;entreprise et la mission concernée.
                </p>
                <p>
                    Les RDV sont enregistrés par notre équipe lorsqu&apos;un prospect réserve un créneau
                    (par exemple via un lien Calendly).
                </p>
            </div>
        ),
    },
    {
        id: "messages",
        title: "Messages / Contacter",
        content: (
            <div className="text-sm text-ink space-y-2">
                <p>
                    L&apos;onglet « Messages » ou « Contacter » vous permet d&apos;échanger en direct avec
                    un manager. Les conversations sont organisées par fil (sujet). Vous recevez des
                    notifications pour les nouveaux messages.
                </p>
                <p>
                    Utilisez cette voie pour toute question ou demande concernant vos campagnes.
                </p>
            </div>
        ),
    },
    {
        id: "email",
        title: "Mon Email",
        content: (
            <p className="text-sm text-ink leading-relaxed">
                « Mon Email » permet de connecter une boîte Gmail ou Outlook (OAuth) pour consulter et
                gérer les échanges liés à vos missions depuis le portail. Après connexion, vous accédez
                à votre messagerie dans l&apos;onglet dédié.
            </p>
        ),
    },
    {
        id: "fichiers",
        title: "Mes Fichiers",
        content: (
            <p className="text-sm text-ink leading-relaxed">
                « Mes Fichiers » regroupe les documents déposés pour votre compte (par vous ou l&apos;équipe),
                organisés par dossiers. Vous pouvez parcourir les fichiers, les télécharger et en ajouter.
                Vous êtes notifié lorsqu&apos;un nouveau fichier est déposé.
            </p>
        ),
    },
    {
        id: "parametres",
        title: "Paramètres",
        content: (
            <div className="text-sm text-ink space-y-2">
                <p>
                    Dans Paramètres vous pouvez modifier vos informations personnelles (nom, téléphone,
                    fuseau horaire), le lien de réservation (Calendly, etc.) utilisé pour planifier vos
                    RDV, et vos préférences de notifications (alertes RDV, email, notifications dans le
                    portail).
                </p>
                <p>
                    <Link
                        href="/client/portal/settings"
                        className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1"
                    >
                        Accéder aux paramètres
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </p>
            </div>
        ),
    },
    {
        id: "contact",
        title: "Qui contacter en cas de question ?",
        content: (
            <div className="text-sm text-ink space-y-2">
                <p>
                    Pour toute question sur l&apos;utilisation du portail ou sur vos missions, utilisez
                    la section « Messages » / « Contacter » dans le portail pour joindre un manager.
                </p>
            </div>
        ),
    },
];

// ============================================
// PAGE
// ============================================

export default function ClientPortalAidePage() {
    const [expandedId, setExpandedId] = useState<string | null>(SECTIONS[0].id);

    return (
        <div className="min-h-full bg-surface-2 p-4 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4" style={{ animation: "aideFadeUp 0.35s ease both" }}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center">
                        <HelpCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-ink tracking-tight">Centre d&apos;aide</h1>
                        <p className="text-xs text-ink-3 mt-0.5">Questions fréquentes et guide du portail</p>
                    </div>
                </div>
                <Link href="/client/portal">
                    <Button variant="outline" size="sm" className="gap-2 text-xs">
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                        Tableau de bord
                    </Button>
                </Link>
            </div>

            <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm" style={{ animation: "aideFadeUp 0.35s ease both", animationDelay: "50ms" }}>
                <div className="divide-y divide-line-subtle">
                    {SECTIONS.map((section, idx) => {
                        const isExpanded = expandedId === section.id;
                        return (
                            <div key={section.id}>
                                <button
                                    type="button"
                                    onClick={() => setExpandedId(isExpanded ? null : section.id)}
                                    className={cn(
                                        "w-full flex items-center gap-4 px-5 py-4 text-left transition-all duration-150",
                                        isExpanded
                                            ? "bg-primary-50/60 text-ink"
                                            : "hover:bg-surface-2 text-ink"
                                    )}
                                >
                                    <span className={cn(
                                        "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 transition-colors",
                                        isExpanded ? "bg-primary text-white" : "bg-surface-3 text-ink-3"
                                    )}>
                                        {String(idx + 1).padStart(2, "0")}
                                    </span>
                                    <span className="flex-1 font-semibold text-[14px] leading-snug">{section.title}</span>
                                    {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-primary-600 flex-shrink-0" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-ink-4 flex-shrink-0" />
                                    )}
                                </button>
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-1 bg-white">
                                        <div className="ml-10 border-l-2 border-primary-500/15 pl-4">
                                            {section.content}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <style jsx global>{`
                @keyframes aideFadeUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: none; }
                }
            `}</style>
        </div>
    );
}
