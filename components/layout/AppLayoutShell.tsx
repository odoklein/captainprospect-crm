"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { UserRole } from "@prisma/client";
import { SidebarProvider, useSidebar } from "./SidebarProvider";
import { PermissionProvider } from "@/lib/permissions/PermissionProvider";
import { GlobalSidebar, MobileMenuButton } from "./GlobalSidebar";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { NavSection, getNavByRole, ROLE_CONFIG } from "@/lib/navigation/config";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle, BellRing, PhoneCall } from "lucide-react";

interface AppLayoutShellProps {
    children: React.ReactNode;
    allowedRoles: UserRole[];
    customNavigation?: NavSection[];
}

type SdrMissionOption = {
    id: string;
    name: string;
    client?: { name: string };
};

type SdrCallbackAlert = {
    id: string;
    callbackDate: string;
    note?: string | null;
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        company?: { name?: string | null } | null;
    } | null;
    company?: { name?: string | null } | null;
    mission?: {
        name?: string | null;
        client?: { name?: string | null } | null;
    } | null;
};

const SDR_DAILY_REVIEW_TIME = "15:45";
const SDR_REVIEW_LAST_SUBMITTED_KEY = "sdr_daily_review_last_submitted_date";
const SDR_REVIEW_DISMISSED_KEY = "sdr_daily_review_dismissed_date";

function toLocalDateKey(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function parsePromptTime(value: string | undefined): { hour: number; minute: number } {
    const raw = value ?? SDR_DAILY_REVIEW_TIME;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
    if (!match) return { hour: 15, minute: 45 };
    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
    };
}

function isPastDailyReviewDeadline(now: Date, promptTimeStr: string): boolean {
    const triggerTime = new Date(now);
    const { hour, minute } = parsePromptTime(promptTimeStr);
    triggerTime.setHours(hour, minute, 0, 0);
    return now >= triggerTime;
}

function InnerLayout({
    children,
    allowedRoles,
    customNavigation,
}: AppLayoutShellProps) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const { isCollapsed, isHovering, searchOpen, closeSearch } = useSidebar();

    const userRole = session?.user?.role as UserRole | undefined;
    const roleConfig = userRole ? ROLE_CONFIG[userRole] : null;
    const isSdrArea = userRole === UserRole.SDR && pathname.startsWith("/sdr");

    const [isDailyReviewModalOpen, setIsDailyReviewModalOpen] = useState(false);
    const [dailyReviewScore, setDailyReviewScore] = useState<number>(4);
    const [dailyReviewText, setDailyReviewText] = useState("");
    const [dailyReviewObjections, setDailyReviewObjections] = useState("");
    const [dailyReviewMissionComment, setDailyReviewMissionComment] = useState("");
    const [dailyReviewMissionIds, setDailyReviewMissionIds] = useState<string[]>([]);
    const [dailyReviewError, setDailyReviewError] = useState<string | null>(null);
    const [dailyReviewSubmitting, setDailyReviewSubmitting] = useState(false);
    const [dailyReviewMissionOptions, setDailyReviewMissionOptions] = useState<SdrMissionOption[]>([]);
    const [dailyReviewMissionsLoading, setDailyReviewMissionsLoading] = useState(false);
    const [dailyReviewPromptTime, setDailyReviewPromptTime] = useState(SDR_DAILY_REVIEW_TIME);
    const [dailyReviewRequiredDaily, setDailyReviewRequiredDaily] = useState(true);
    const [callbackAlert, setCallbackAlert] = useState<SdrCallbackAlert | null>(null);
    /** Minute tick so the “deadline passed” badge updates without navigation */
    const [sdrReviewClock, setSdrReviewClock] = useState(0);
    const [dailyFeedbackSubmittedToday, setDailyFeedbackSubmittedToday] = useState(() => {
        if (typeof window === "undefined") return false;
        const todayKey = toLocalDateKey(new Date());
        return localStorage.getItem(SDR_REVIEW_LAST_SUBMITTED_KEY) === todayKey;
    });

    useEffect(() => {
        if (status === "loading") return;

        if (status === "unauthenticated") {
            router.push("/login");
            return;
        }

        if (status === "authenticated") {
            if (userRole && !allowedRoles.includes(userRole)) {
                router.push("/unauthorized");
            }
        }
    }, [session, status, router, allowedRoles, userRole]);

    useEffect(() => {
        if (!isSdrArea || !dailyReviewRequiredDaily) return;
        const tick = () => setSdrReviewClock((c) => c + 1);
        tick();
        const id = window.setInterval(tick, 60 * 1000);
        return () => window.clearInterval(id);
    }, [isSdrArea, dailyReviewRequiredDaily]);

    useEffect(() => {
        if (!isSdrArea) return;
        const todayKey = toLocalDateKey(new Date());
        setDailyFeedbackSubmittedToday(
            localStorage.getItem(SDR_REVIEW_LAST_SUBMITTED_KEY) === todayKey,
        );
    }, [isSdrArea, sdrReviewClock]);

    useEffect(() => {
        if (!isSdrArea) return;

        const loadReviewPreferences = async () => {
            try {
                const res = await fetch("/api/users/me/profile");
                const json = await res.json();
                if (!res.ok || !json.success) return;
                const feedbackPrefs = json.data?.preferences?.sdrFeedback;
                if (typeof feedbackPrefs?.promptTime === "string") {
                    setDailyReviewPromptTime(feedbackPrefs.promptTime);
                }
                if (typeof feedbackPrefs?.requiredDaily === "boolean") {
                    setDailyReviewRequiredDaily(feedbackPrefs.requiredDaily);
                }
            } catch {
                // keep defaults
            }
        };
        void loadReviewPreferences();

        const checkAndOpenDailyReview = () => {
            if (!dailyReviewRequiredDaily) return;
            const now = new Date();
            const todayKey = toLocalDateKey(now);
            const lastSubmittedDate = localStorage.getItem(SDR_REVIEW_LAST_SUBMITTED_KEY);
            if (lastSubmittedDate === todayKey) return;

            const dismissedDate = localStorage.getItem(SDR_REVIEW_DISMISSED_KEY);
            if (dismissedDate === todayKey) return;

            if (isPastDailyReviewDeadline(now, dailyReviewPromptTime)) {
                setIsDailyReviewModalOpen(true);
            }
        };

        checkAndOpenDailyReview();
        const interval = window.setInterval(checkAndOpenDailyReview, 60 * 1000);
        return () => window.clearInterval(interval);
    }, [isSdrArea, dailyReviewPromptTime, dailyReviewRequiredDaily]);

    useEffect(() => {
        if (!isSdrArea || !dailyReviewRequiredDaily || !isDailyReviewModalOpen) return;

        const loadMissions = async () => {
            setDailyReviewMissionsLoading(true);
            try {
                const now = new Date();
                const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                const todayKey = toLocalDateKey(now);
                const res = await fetch(`/api/planning/me?month=${month}`);
                const json = await res.json();
                if (!res.ok || !json.success) {
                    setDailyReviewMissionOptions([]);
                    return;
                }

                const blocks = Array.isArray(json.data?.blocks)
                    ? (json.data.blocks as Array<{
                        date?: string;
                        missionId?: string;
                        mission?: { id?: string; name?: string; client?: { name?: string } };
                    }>)
                    : [];

                const todayPlanned = blocks.filter((b) => {
                    if (!b.date) return false;
                    const d = new Date(b.date);
                    if (Number.isNaN(d.getTime())) return false;
                    return toLocalDateKey(d) === todayKey;
                });

                const uniqueByMission = new Map<string, SdrMissionOption>();
                for (const b of todayPlanned) {
                    const missionId = b.mission?.id ?? b.missionId;
                    const missionName = b.mission?.name;
                    if (!missionId || !missionName) continue;
                    if (!uniqueByMission.has(missionId)) {
                        uniqueByMission.set(missionId, {
                            id: missionId,
                            name: missionName,
                            client: b.mission?.client?.name ? { name: b.mission.client.name } : undefined,
                        });
                    }
                }
                const options = [...uniqueByMission.values()];
                setDailyReviewMissionOptions(options);

                const storedMissionId = localStorage.getItem("sdr_selected_mission");
                const isStoredValid =
                    !!storedMissionId && options.some((m) => m.id === storedMissionId);
                setDailyReviewMissionIds((prev) => {
                    if (prev.length > 0) return prev;
                    if (isStoredValid && storedMissionId) return [storedMissionId];
                    if (options[0]?.id) return [options[0].id];
                    return [];
                });
            } catch {
                setDailyReviewMissionOptions([]);
            } finally {
                setDailyReviewMissionsLoading(false);
            }
        };

        void loadMissions();
    }, [isSdrArea, dailyReviewRequiredDaily, isDailyReviewModalOpen]);

    useEffect(() => {
        if (!isSdrArea) {
            setCallbackAlert(null);
            return;
        }

        let cancelled = false;

        const checkDueCallbacks = async () => {
            try {
                const res = await fetch("/api/sdr/callbacks?limit=500", { cache: "no-store" });
                const json = await res.json();
                if (!res.ok || !json.success || !Array.isArray(json.data) || cancelled) return;

                const now = Date.now();
                const recentWindowMs = 10 * 60 * 1000;
                const dueCallbacks = (json.data as SdrCallbackAlert[])
                    .filter((callback) => {
                        if (!callback.callbackDate) return false;
                        const callbackTime = new Date(callback.callbackDate).getTime();
                        if (Number.isNaN(callbackTime)) return false;
                        const elapsed = now - callbackTime;
                        if (elapsed < 0 || elapsed > recentWindowMs) return false;
                        const storageKey = `sdr_callback_alert:${callback.id}:${callback.callbackDate}`;
                        return sessionStorage.getItem(storageKey) !== "shown";
                    })
                    .sort(
                        (a, b) =>
                            new Date(a.callbackDate).getTime() -
                            new Date(b.callbackDate).getTime(),
                    );

                const nextAlert = dueCallbacks[0];
                if (!nextAlert) return;

                sessionStorage.setItem(
                    `sdr_callback_alert:${nextAlert.id}:${nextAlert.callbackDate}`,
                    "shown",
                );
                setCallbackAlert(nextAlert);
            } catch {
                // The callbacks page remains available if background polling fails.
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === "visible") void checkDueCallbacks();
        };

        void checkDueCallbacks();
        const interval = window.setInterval(checkDueCallbacks, 30_000);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [isSdrArea]);

    if (status === "loading" || !session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fafbfc]">
                <div className="flex flex-col items-center gap-3">
                    <div className="cp-spinner" />
                    <p className="text-sm text-slate-400 font-medium">Chargement...</p>
                </div>
            </div>
        );
    }

    if (userRole && !allowedRoles.includes(userRole)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fafbfc]">
                <div className="cp-spinner" />
            </div>
        );
    }

    const navigation =
        customNavigation || (userRole ? getNavByRole(userRole) : []);

    // Old standalone full-screen email pages (no sidebar)
    const isLegacyEmailPage =
        pathname === "/sdr/email" || pathname === "/manager/email";
    if (isLegacyEmailPage) {
        return (
            <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#fafbfc]">
                {children}
            </div>
        );
    }

    // New Email Hub — needs sidebar but NOT the padded cp-content wrapper
    const isEmailHub =
        pathname.startsWith("/manager/emails") ||
        pathname.startsWith("/sdr/emails");
    const isRdvPage = pathname.startsWith("/manager/rdv");

    const pathParts = pathname.split("/").filter(Boolean);
    const rawPage = pathParts[pathParts.length - 1]?.replace(/-/g, " ") || "Dashboard";
    const pageLabels: Record<string, string> = {
        dashboard: "Tableau de bord",
        prospection: "Appels",
        listing: "Listing",
        missions: "Missions",
        clients: "Clients",
        team: "Performance",
        planning: "Planning",
        projects: "Projets",
        emails: "Email Hub",
    };
    const currentPage = pageLabels[rawPage?.toLowerCase()] || rawPage;

    const showDailyReviewWarning =
        isSdrArea &&
        dailyReviewRequiredDaily &&
        !dailyFeedbackSubmittedToday &&
        isPastDailyReviewDeadline(new Date(), dailyReviewPromptTime);

    const handleCloseDailyReviewModal = () => {
        const now = new Date();
        const todayKey = toLocalDateKey(now);
        const submitted = localStorage.getItem(SDR_REVIEW_LAST_SUBMITTED_KEY) === todayKey;
        if (!submitted && isPastDailyReviewDeadline(now, dailyReviewPromptTime)) {
            localStorage.setItem(SDR_REVIEW_DISMISSED_KEY, todayKey);
        }
        setDailyReviewError(null);
        setIsDailyReviewModalOpen(false);
    };

    const handleSubmitDailyReview = async () => {
        const trimmedReview = dailyReviewText.trim();
        const trimmedObjections = dailyReviewObjections.trim();
        const trimmedMissionComment = dailyReviewMissionComment.trim();
        if (
            trimmedReview.length < 20 ||
            trimmedObjections.length < 10 ||
            trimmedMissionComment.length < 10
        ) {
            setDailyReviewError(
                "Merci de remplir tous les champs requis (avis 20 caractères min, objections 10 min, commentaire mission 10 min).",
            );
            return;
        }

        try {
            setDailyReviewSubmitting(true);
            setDailyReviewError(null);

            const missionId = localStorage.getItem("sdr_selected_mission");
            const res = await fetch("/api/sdr/daily-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    score: dailyReviewScore,
                    review: trimmedReview,
                    objections: trimmedObjections,
                    missionComment: trimmedMissionComment,
                    missionIds: dailyReviewMissionIds.length
                        ? dailyReviewMissionIds
                        : missionId
                          ? [missionId]
                          : [],
                    pagePath: pathname,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                setDailyReviewError(json.error ?? "Impossible d'envoyer le feedback");
                return;
            }

            setIsDailyReviewModalOpen(false);
            const submittedKey = toLocalDateKey(new Date());
            localStorage.setItem(SDR_REVIEW_LAST_SUBMITTED_KEY, submittedKey);
            localStorage.removeItem(SDR_REVIEW_DISMISSED_KEY);
            setDailyFeedbackSubmittedToday(true);
            setDailyReviewScore(4);
            setDailyReviewText("");
            setDailyReviewObjections("");
            setDailyReviewMissionComment("");
            setDailyReviewMissionIds(missionId ? [missionId] : []);
            setDailyReviewError(null);
        } catch (error) {
            console.error("Failed to submit daily review:", error);
            setDailyReviewError("Erreur réseau, réessayez.");
        } finally {
            setDailyReviewSubmitting(false);
        }
    };

    return (
        <div className="cp-layout">
            <GlobalSearchModal
                open={searchOpen}
                onClose={closeSearch}
                navigation={navigation}
            />
            <GlobalSidebar navigation={navigation} />

            <main
                className={cn(
                    "cp-main",
                    isCollapsed && !isHovering
                        ? "cp-main-collapsed"
                        : "cp-main-expanded"
                )}
            >
                <header className="cp-topbar">
                    <div className="flex items-center gap-3">
                        <MobileMenuButton />
                        <nav className="cp-breadcrumb" aria-label="Breadcrumb">
                            <span className="cp-breadcrumb-root">
                                {roleConfig?.label || "App"}
                            </span>
                            <span className="cp-breadcrumb-sep">/</span>
                            <span className="cp-breadcrumb-current">
                                {currentPage}
                            </span>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        {isSdrArea && showDailyReviewWarning && (
                            <button
                                type="button"
                                onClick={() => {
                                    setDailyReviewError(null);
                                    setIsDailyReviewModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-lg border border-amber-300/80 bg-amber-50 text-[11px] font-bold text-amber-950 shadow-sm hover:bg-amber-100/90 transition-colors duration-150"
                                title={`Après ${dailyReviewPromptTime}, merci de compléter votre avis de fin de journée.`}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" aria-hidden />
                                Avis à compléter
                            </button>
                        )}
                        {isSdrArea && (
                            <button
                                type="button"
                                onClick={() => {
                                    setDailyReviewError(null);
                                    setIsDailyReviewModalOpen(true);
                                }}
                                className="h-8 px-3 rounded-lg border border-[#E8EBF0] bg-white text-[12px] font-semibold text-[#5A5A7A] hover:text-[#12122A] hover:border-[#C5C8D4] hover:bg-[#F9FAFB] transition-colors duration-150"
                            >
                                Donner mon avis
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => router.refresh()}
                            className="w-8 h-8 rounded-lg border border-[#E8EBF0] flex items-center justify-center text-[#8B8BA7] hover:text-[#12122A] hover:border-[#C5C8D4] transition-colors duration-150"
                            title="Rafraîchir"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <NotificationBell />
                    </div>
                </header>

                {isEmailHub || isRdvPage ? (
                    // Email Hub & SAS RDV: fill remaining height, no outer padding wrapper, dedicated inner scroll
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0" style={{ height: 'calc(100vh - 56px)' }}>
                        {children}
                    </div>
                ) : (
                    <div className="cp-content">
                        <div className="max-w-[1440px] mx-auto w-full">
                            {children}
                        </div>
                    </div>
                )}

                <Modal
                    isOpen={isDailyReviewModalOpen && !callbackAlert}
                    onClose={handleCloseDailyReviewModal}
                    title="Point SDR de fin de journée"
                    description={`Partagez rapidement votre feedback sur la journée (déclenchement: ${dailyReviewPromptTime}).`}
                    size="md"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[12px] font-semibold text-[#12122A] mb-2">
                                Mission(s) concernée(s)
                            </label>
                            {dailyReviewMissionsLoading ? (
                                <div className="text-[12px] text-[#8B8BA7]">Chargement des missions…</div>
                            ) : dailyReviewMissionOptions.length === 0 ? (
                                <div className="text-[12px] text-[#8B8BA7]">
                                    Aucune mission active trouvée.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {dailyReviewMissionOptions.map((mission) => {
                                        const isSelected = dailyReviewMissionIds.includes(mission.id);
                                        return (
                                            <button
                                                key={mission.id}
                                                type="button"
                                                onClick={() =>
                                                    setDailyReviewMissionIds((prev) =>
                                                        prev.includes(mission.id)
                                                            ? prev.filter((id) => id !== mission.id)
                                                            : [...prev, mission.id],
                                                    )
                                                }
                                                className={cn(
                                                    "text-left rounded-xl border px-3 py-2 transition-colors",
                                                    isSelected
                                                        ? "border-[#7C5CFC] bg-[#F5F3FF]"
                                                        : "border-[#E8EBF0] bg-white hover:border-[#C5C8D4]",
                                                )}
                                            >
                                                <p className="text-[12px] font-semibold text-[#12122A] truncate">
                                                    {mission.name}
                                                </p>
                                                <p className="text-[11px] text-[#8B8BA7] truncate">
                                                    {mission.client?.name ?? "Sans client"}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-[12px] font-semibold text-[#12122A] mb-2">
                                Comment s'est passée votre journée ? *
                            </label>
                            <textarea
                                value={dailyReviewText}
                                onChange={(e) => setDailyReviewText(e.target.value)}
                                placeholder="Résumez votre performance, vos difficultés et vos succès (min. 20 caractères)..."
                                className="w-full min-h-[92px] rounded-xl border border-[#E8EBF0] px-3 py-2.5 text-[13px] text-[#12122A] placeholder:text-[#8B8BA7] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/25 focus:border-[#7C5CFC] resize-y"
                            />
                            <p className="mt-1 text-[11px] text-[#8B8BA7]">
                                {dailyReviewText.trim().length}/20 minimum
                            </p>
                        </div>

                        <div>
                            <label className="block text-[12px] font-semibold text-[#12122A] mb-2">
                                Objections rencontrées aujourd'hui *
                            </label>
                            <textarea
                                value={dailyReviewObjections}
                                onChange={(e) => setDailyReviewObjections(e.target.value)}
                                placeholder="Ex: budget, timing, concurrence, pas le bon contact... (min. 10 caractères)"
                                className="w-full min-h-[82px] rounded-xl border border-[#E8EBF0] px-3 py-2.5 text-[13px] text-[#12122A] placeholder:text-[#8B8BA7] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/25 focus:border-[#7C5CFC] resize-y"
                            />
                            <p className="mt-1 text-[11px] text-[#8B8BA7]">
                                {dailyReviewObjections.trim().length}/10 minimum
                            </p>
                        </div>

                        <div>
                            <label className="block text-[12px] font-semibold text-[#12122A] mb-2">
                                Commentaires sur la mission *
                            </label>
                            <textarea
                                value={dailyReviewMissionComment}
                                onChange={(e) => setDailyReviewMissionComment(e.target.value)}
                                placeholder="Besoin de script, meilleure accroche, feedback ciblage... (min. 10 caractères)"
                                className="w-full min-h-[82px] rounded-xl border border-[#E8EBF0] px-3 py-2.5 text-[13px] text-[#12122A] placeholder:text-[#8B8BA7] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/25 focus:border-[#7C5CFC] resize-y"
                            />
                            <p className="mt-1 text-[11px] text-[#8B8BA7]">
                                {dailyReviewMissionComment.trim().length}/10 minimum
                            </p>
                        </div>

                        <div>
                            <p className="text-[12px] font-semibold text-[#12122A] mb-2">Ressenti global</p>
                            <div className="flex flex-wrap gap-2">
                                {[1, 2, 3, 4, 5].map((score) => (
                                    <button
                                        key={score}
                                        type="button"
                                        onClick={() => setDailyReviewScore(score)}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors",
                                            dailyReviewScore === score
                                                ? "bg-[#7C5CFC] text-white border-[#7C5CFC]"
                                                : "bg-white text-[#5A5A7A] border-[#E8EBF0] hover:border-[#C5C8D4]",
                                        )}
                                    >
                                        {score}/5
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EEF1F6]">
                            <button
                                type="button"
                                onClick={() => void handleSubmitDailyReview()}
                                disabled={
                                    dailyReviewText.trim().length < 20 ||
                                    dailyReviewObjections.trim().length < 10 ||
                                    dailyReviewMissionComment.trim().length < 10 ||
                                    dailyReviewSubmitting ||
                                    dailyReviewMissionIds.length === 0
                                }
                                className="h-9 px-4 rounded-lg bg-[#7C5CFC] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {dailyReviewSubmitting ? "Envoi..." : "Envoyer mon feedback"}
                            </button>
                        </div>
                        {dailyReviewError && (
                            <p className="text-[12px] text-red-600">{dailyReviewError}</p>
                        )}
                    </div>
                </Modal>

                <Modal
                    isOpen={!!callbackAlert}
                    onClose={() => setCallbackAlert(null)}
                    title="Rappel à effectuer maintenant"
                    description="L'heure prévue pour ce rappel vient d'arriver."
                    size="sm"
                >
                    {callbackAlert && (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                                        <BellRing className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900">
                                            {[
                                                callbackAlert.contact?.firstName,
                                                callbackAlert.contact?.lastName,
                                            ].filter(Boolean).join(" ") ||
                                                callbackAlert.contact?.company?.name ||
                                                callbackAlert.company?.name ||
                                                "Contact à rappeler"}
                                        </p>
                                        <p className="text-xs text-slate-600 mt-1">
                                            {callbackAlert.contact?.company?.name ||
                                                callbackAlert.company?.name ||
                                                callbackAlert.mission?.client?.name ||
                                                "Société non renseignée"}
                                            {callbackAlert.mission?.name
                                                ? ` · ${callbackAlert.mission.name}`
                                                : ""}
                                        </p>
                                        <p className="text-xs font-semibold text-amber-800 mt-2">
                                            Prévu à{" "}
                                            {new Date(callbackAlert.callbackDate).toLocaleTimeString("fr-FR", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                </div>
                                {callbackAlert.note && (
                                    <p className="mt-3 pt-3 border-t border-amber-200 text-xs text-amber-950">
                                        {callbackAlert.note}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCallbackAlert(null)}
                                    className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                    Fermer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCallbackAlert(null);
                                        router.push("/sdr/callbacks");
                                    }}
                                    className="h-9 px-4 rounded-lg bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 inline-flex items-center gap-2"
                                >
                                    <PhoneCall className="w-4 h-4" />
                                    Ouvrir le rappel
                                </button>
                            </div>
                        </div>
                    )}
                </Modal>
            </main>
        </div>
    );
}

export function AppLayoutShell(props: AppLayoutShellProps) {
    return (
        <SidebarProvider>
            <PermissionProvider>
                <InnerLayout {...props} />
            </PermissionProvider>
        </SidebarProvider>
    );
}

export default AppLayoutShell;
