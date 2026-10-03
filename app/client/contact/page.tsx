"use client";

import { useState, useEffect } from "react";
import { CommsInbox } from "@/components/comms/CommsInbox";
import { PageHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { MessageSquare, Send, Wifi } from "lucide-react";

export default function ClientContactPage() {
    const [inboxReady, setInboxReady] = useState(false);

    useEffect(() => {
        // Brief delay to allow inbox to mount; shows skeleton first
        const timer = setTimeout(() => setInboxReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[520px] animate-fade-in">
            {/* Header */}
            <div className="mb-6 flex-shrink-0">
                <PageHeader
                    title="Contact"
                    subtitle="Contactez l'equipe support"
                    icon={
                        <span className="flex items-center gap-2 text-primary-600">
                            <MessageSquare className="w-5 h-5" />
                        </span>
                    }
                    actions={
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-medium text-emerald-700">Temps reel</span>
                            </div>
                        </div>
                    }
                />
            </div>

            {/* Inbox */}
            <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 overflow-hidden relative">
                {!inboxReady && (
                    <div className="absolute inset-0 p-6 space-y-4 bg-white z-10">
                        <div className="flex gap-4 h-full">
                            {/* Thread list skeleton */}
                            <div className="w-80 border-r border-slate-200 pr-4 space-y-3">
                                <Skeleton className="h-10 w-full rounded-xl" />
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Message area skeleton */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                                <Send className="w-8 h-8" />
                                <Skeleton className="h-4 w-48" />
                            </div>
                        </div>
                    </div>
                )}
                <CommsInbox
                    className="h-full"
                    restrictToChannelTypes={["DIRECT"]}
                />
            </div>
        </div>
    );
}
