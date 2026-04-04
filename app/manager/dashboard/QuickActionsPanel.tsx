"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Users,
    MessageSquare,
    UserPlus,
    Calendar,
    BarChart3,
    Settings,
    Search,
    Command,
    Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

interface QuickAction {
    icon: React.ElementType;
    label: string;
    shortcut?: string;
    href: string;
}

const ACTIONS: QuickAction[] = [
    { icon: Users, label: "Voir équipe en direct", shortcut: "E", href: "/manager/team" },
    { icon: MessageSquare, label: "Diffuser un message", shortcut: "M", href: "/manager/comms" },
    { icon: UserPlus, label: "Assigner un SDR", shortcut: "S", href: "/manager/missions" },
    { icon: Calendar, label: "Voir les RDV du jour", shortcut: "R", href: "/manager/rdv" },
    { icon: BarChart3, label: "Voir les statistiques", shortcut: "A", href: "/manager/analytics" },
    { icon: Settings, label: "Paramètres", shortcut: "P", href: "/manager/settings" },
];

export function QuickActionsPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Keyboard shortcut: Cmd/Ctrl+Shift+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "k") {
                e.preventDefault();
                setIsOpen((o) => !o);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const filteredActions = search
        ? ACTIONS.filter((a) => a.label.toLowerCase().includes(search.toLowerCase()))
        : ACTIONS;

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, filteredActions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && filteredActions[selectedIndex]) {
            e.preventDefault();
            router.push(filteredActions[selectedIndex].href);
            setIsOpen(false);
        }
    }, [filteredActions, selectedIndex, router]);

    return (
        <>
            {/* Floating Action Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all duration-200 flex items-center justify-center"
            >
                <Zap className="w-5 h-5" />
            </button>

            {/* Modal */}
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="md">
                <div className="-mx-6 -mt-6">
                    {/* Search input */}
                    <div className="relative border-b border-slate-200">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Rechercher une action..."
                            className="w-full pl-12 pr-4 py-4 text-sm text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-md font-mono">
                            <Command className="w-3 h-3" />+Shift+K
                        </div>
                    </div>

                    {/* Actions list */}
                    <div className="py-2 max-h-[400px] overflow-y-auto">
                        {filteredActions.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-400">
                                Aucune action trouvée
                            </div>
                        ) : (
                            filteredActions.map((action, i) => (
                                <button
                                    key={action.href}
                                    onClick={() => { router.push(action.href); setIsOpen(false); }}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                                        i === selectedIndex ? "bg-indigo-50" : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                                        i === selectedIndex ? "bg-indigo-100" : "bg-slate-100"
                                    )}>
                                        <action.icon className={cn(
                                            "w-4.5 h-4.5",
                                            i === selectedIndex ? "text-indigo-600" : "text-slate-500"
                                        )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-sm font-medium",
                                            i === selectedIndex ? "text-indigo-900" : "text-slate-700"
                                        )}>
                                            {action.label}
                                        </p>
                                    </div>
                                    {action.shortcut && (
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono flex-shrink-0">
                                            {action.shortcut}
                                        </span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </Modal>
        </>
    );
}
