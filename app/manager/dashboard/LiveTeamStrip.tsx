"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Phone, MessageSquare, Linkedin, Users, Zap } from "lucide-react";
import Link from "next/link";

interface TeamMember {
    id: string;
    name: string;
    avatar: string | null;
    role: string;
    status: "online" | "away" | "offline";
    currentMission: string | null;
    actionsToday: number;
    lastConnectedAt: string | null;
}

interface FeedItem {
    id: string;
    user: string;
    type: string;
    result: string;
    time: string;
    contactName: string | null;
    company: string | null;
}

const RESULT_LABELS: Record<string, string> = {
    MEETING_BOOKED: "a décroché un RDV",
    CALLBACK_REQUESTED: "a programmé un rappel",
    INTERESTED: "a identifié un intéressé",
    NO_RESPONSE: "a passé un appel",
    BAD_CONTACT: "a passé un appel",
    DISQUALIFIED: "a passé un appel",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
    CALL: Phone,
    EMAIL: MessageSquare,
    LINKEDIN: Linkedin,
};

function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTimeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
}

export function LiveTeamStrip() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [feedIndex, setFeedIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/manager/live-feed");
            const json = await res.json();
            if (json.success) {
                setMembers(json.data.members || []);
                setFeed(json.data.liveFeed || []);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Rotate feed ticker every 5s
    useEffect(() => {
        if (feed.length <= 1) return;
        const interval = setInterval(() => {
            setFeedIndex((i) => (i + 1) % feed.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [feed.length]);

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 animate-pulse">
                <div className="h-10 bg-slate-100 rounded-xl" />
            </div>
        );
    }

    if (members.length === 0) return null;

    const onlineCount = members.filter((m) => m.status === "online").length;
    const currentFeedItem = feed[feedIndex];

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
            {/* Members row */}
            <div className="px-4 py-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 mr-3 flex-shrink-0">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">{onlineCount} en ligne</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                    {members
                        .sort((a, b) => {
                            const order = { online: 0, away: 1, offline: 2 };
                            return order[a.status] - order[b.status];
                        })
                        .map((m) => (
                            <Link
                                key={m.id}
                                href={`/manager/team`}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors flex-shrink-0"
                            >
                                {/* Avatar */}
                                <div className="relative">
                                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                                        {m.avatar ? (
                                            <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                                                {getInitials(m.name)}
                                            </div>
                                        )}
                                    </div>
                                    <span className={cn(
                                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px] border-white",
                                        m.status === "online" ? "bg-emerald-500 live-dot-pulse" :
                                            m.status === "away" ? "bg-amber-400" : "bg-slate-300"
                                    )} />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">{m.name.split(" ")[0]}</p>
                                    <p className="text-[10px] text-slate-400 truncate leading-tight">
                                        {m.currentMission ? m.currentMission : m.status === "away" ? "Absent" : m.status === "offline" ? "Hors ligne" : "Disponible"}
                                        {m.actionsToday > 0 && ` · ${m.actionsToday}`}
                                    </p>
                                </div>
                            </Link>
                        ))}
                </div>
            </div>

            {/* Live feed ticker */}
            {currentFeedItem && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-[11px] text-slate-600 truncate">
                        <span className="font-semibold">{currentFeedItem.user}</span>
                        {" "}
                        {RESULT_LABELS[currentFeedItem.result] || "a effectué une action"}
                        {currentFeedItem.company && (
                            <> avec <span className="font-medium">{currentFeedItem.company}</span></>
                        )}
                        {" · "}
                        <span className="text-slate-400">{formatTimeAgo(currentFeedItem.time)}</span>
                    </p>
                </div>
            )}
        </div>
    );
}
