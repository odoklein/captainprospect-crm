import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, getRedirectPath } from "@/lib/auth";
import { getBrand } from "@/lib/brand/server";
import { Button } from "@/components/ui";
import { Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import {
    SDRIllustration,
    ManagerIllustration,
    BDIllustration,
    ClientIllustration,
    DeveloperIllustration,
} from "@/components/landing/RoleIllustrations";

export default async function HomePage() {
    const session = await getServerSession(authOptions);

    // If logged in, redirect to role-specific dashboard
    if (session?.user) {
        redirect(getRedirectPath(session.user.role));
    }

    // Redirect to login page for visitors
    redirect('/login');

    const brand = await getBrand();
    return (
        <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-100 overflow-hidden selection:bg-indigo-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
                <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[60%] h-[60%] bg-violet-500/5 rounded-full blur-[100px]" />
            </div>

            {/* Navbar */}
            <nav className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Zap className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        {brand.name}
                    </span>
                </div>
                <Link href="/login">
                    <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/5">
                        Compte Employé
                    </Button>
                </Link>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20 lg:py-32">
                <div className="text-center max-w-4xl mx-auto mb-20">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8 animate-fade-in">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        Système Opérationnel Unifié v0.1
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight tracking-tight">
                        <span className="block text-white mb-2">Exécution Commerciale</span>
                        <span className="block bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400">
                            Sans Compromis
                        </span>
                    </h1>

                    <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                        La plateforme centrale pour piloter, exécuter et analyser
                        l&apos;ensemble de la stratégie de croissance de {brand.companyName}.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/login">
                            <Button className="h-12 px-8 text-base bg-white text-slate-900 hover:scale-105 transition-all duration-300 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                                Accéder à l&apos;espace membre
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Role Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto w-full px-4">
                    <RoleCard
                        illustration={<SDRIllustration className="w-full h-full" />}
                        title="SDR"
                        description="Prospection ciblée & qualification"
                        features={["Cold Calling", "Sequencing", "Reporting"]}
                        color="indigo"
                    />
                    <RoleCard
                        illustration={<ManagerIllustration className="w-full h-full" />}
                        title="Manager"
                        description="Pilotage & Stratégie"
                        features={["Analytics", "Management", "Planification"]}
                        color="blue"
                    />
                    <RoleCard
                        illustration={<BDIllustration className="w-full h-full" />}
                        title="Business Dev"
                        description="Closing & Relation Client"
                        features={["Portfolio", "Onboarding", "Upsell"]}
                        color="emerald"
                    />
                    <RoleCard
                        illustration={<ClientIllustration className="w-full h-full" />}
                        title="Client"
                        description="Suivi & Transparence"
                        features={["Dashboard", "Rapports", "Files"]}
                        color="cyan"
                    />
                    <RoleCard
                        illustration={<DeveloperIllustration className="w-full h-full" />}
                        title="Admin"
                        description="Maintenance & Évolution"
                        features={["Système", "Intégrations", "Logs"]}
                        color="pink"
                    />
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 w-full border-t border-slate-800/50 bg-[#0f172a]/50 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between text-slate-500 text-sm">
                    <p>© {new Date().getFullYear()} {brand.companyName}. Tous droits réservés.</p>
                    <div className="flex items-center gap-4">
                        <span>Sécurisé par SSL</span>
                        <div className="w-1 h-1 rounded-full bg-slate-700" />
                        <span>Hébergé en France</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function RoleCard({
    illustration,
    title,
    description,
    features,
    color,
}: {
    illustration: React.ReactNode;
    title: string;
    description: string;
    features: string[];
    color: string;
}) {
    const colorStyles = {
        indigo: "group-hover:border-indigo-500/50 group-hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]",
        blue: "group-hover:border-blue-500/50 group-hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]",
        emerald: "group-hover:border-emerald-500/50 group-hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]",
        cyan: "group-hover:border-cyan-500/50 group-hover:shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)]",
        pink: "group-hover:border-pink-500/50 group-hover:shadow-[0_0_40px_-10px_rgba(236,72,153,0.3)]",
    } as const;

    return (
        <div className={`group relative p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm transition-all duration-500 ${colorStyles[color as keyof typeof colorStyles]}`}>
            {/* Illustration Container */}
            <div className="w-full aspect-square mb-6 rounded-xl bg-slate-900/50 border border-slate-800/50 p-4 group-hover:scale-105 transition-transform duration-500">
                {illustration}
            </div>

            {/* Content */}
            <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors">
                {title}
            </h3>
            <p className="text-slate-400 text-sm mb-6 h-10">
                {description}
            </p>

            {/* Features List */}
            <ul className="space-y-2">
                {features.map((feature, i) => (
                    <li key={i} className="flex items-center text-xs text-slate-500">
                        <CheckCircle2 className="w-3 h-3 mr-2 text-indigo-500/50" />
                        {feature}
                    </li>
                ))}
            </ul>
        </div>
    );
}

