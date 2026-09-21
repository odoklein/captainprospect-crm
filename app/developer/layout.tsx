"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
    LayoutDashboard,
    FolderKanban,
    CheckSquare,
    Inbox,
    LifeBuoy,
    MessageSquare,
    Radio,
    Settings,
    LogOut,
    Code2,
    User,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/ui/NotificationBell";

const NAV_ITEMS = [
    { href: "/developer/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/developer/projects", icon: FolderKanban, label: "Projets" },
    { href: "/developer/tasks", icon: CheckSquare, label: "Tâches" },
    { href: "/developer/mailbox", icon: Inbox, label: "Mailbox" },
    { href: "/developer/tickets", icon: LifeBuoy, label: "Support Technique" },
    { href: "/developer/comms", icon: MessageSquare, label: "Communications" },
    { href: "/developer/integrations", icon: Radio, label: "Intégrations" },
    { href: "/developer/settings", icon: Settings, label: "Paramètres" },
];

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated" && session?.user?.role !== "DEVELOPER") {
            router.push("/unauthorized");
        }
    }, [session, status, router]);

    if (status === "loading" || !session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-500">Chargement...</p>
                </div>
            </div>
        );
    }

    if (session?.user?.role !== "DEVELOPER") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex">
            {/* Premium Sidebar */}
            <aside className="w-64 bg-[#051423] flex flex-col shadow-xl">
                {/* Premium Brand Header */}
                <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Code2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-white tracking-tight">Suzalink</span>
                        <span className="text-xs font-medium text-blue-400 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                            Dev
                        </span>
                    </div>
                </div>

                {/* Premium Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto dev-scrollbar">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "dev-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? "active text-blue-400"
                                        : "text-slate-400 hover:text-white"
                                )}
                            >
                                <item.icon className={cn(
                                    "w-5 h-5 transition-transform duration-200",
                                    isActive && "scale-110"
                                )} />
                                <span className="flex-1">{item.label}</span>
                                {isActive && (
                                    <ChevronRight className="w-4 h-4 text-blue-500/50" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Premium User Section */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/5 mb-3">
                        <div className="relative">
                            <div className="dev-avatar w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 text-white text-sm">
                                {session?.user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-800" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {session?.user?.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{session?.user?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                    >
                        <LogOut className="w-4 h-4" />
                        Déconnexion
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto flex flex-col">
                {/* Premium Header */}
                <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span className="font-medium text-slate-900">Développeur</span>
                        <span>/</span>
                        <span className="capitalize">{pathname.split("/").pop()?.replace("-", " ")}</span>
                    </div>
                    <NotificationBell />
                </header>
                {/* Main Content Area */}
                {pathname.startsWith("/developer/mailbox") || pathname.startsWith("/developer/tickets") || pathname.startsWith("/developer/comms") ? (
                    <div className="flex-1 w-full h-[calc(100vh-57px)] overflow-hidden">{children}</div>
                ) : (
                    <div className="max-w-6xl mx-auto p-6 w-full">{children}</div>
                )}
            </main>
        </div>
    );
}
