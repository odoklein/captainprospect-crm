"use client";

// ============================================
// SIDEBAR USER MENU — the profile button at the foot of the sidebar and its
// popover: photo, name and role, the phone line (components/telephony/LineRing:
// the ring around the photo, press and hold to pause), shortcuts into the
// role's settings page, and sign-out. Self-contained (state, outside click, keyboard).
// ============================================

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { BellRing, ChevronUp, Headphones, LogOut, Settings2, ShieldCheck, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { UserAvatar, useMyAvatar } from "@/components/settings/Avatar";
import { ROLE_LABEL } from "@/components/settings/roles";
import type { UserAiUsageSummary } from "@/lib/ai/usage";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { LineRing, lineCaption, useLineHold } from "@/components/telephony/LineRing";
import { useNotificationPermission } from "@/components/telephony/useNotificationPermission";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { cleanLabel } from "@/lib/telephony/audio-prefs";
import { describeLine, pauseLabel } from "@/lib/telephony/line-state";

/**
 * Personal settings page per role, and how a link opens one of its sections:
 * "sections" — a section list that understands ?section= (the manager's);
 * "page" — one page with #section-<id> anchors, scrolled to by the router;
 * "none" — a plain page.
 */
const SETTINGS: Partial<Record<UserRole, { path: string; mode: "sections" | "page" | "none" }>> = {
    MANAGER: { path: "/manager/settings", mode: "sections" },
    SDR: { path: "/sdr/settings", mode: "page" },
    BOOKER: { path: "/sdr/settings", mode: "page" },
    BUSINESS_DEVELOPER: { path: "/bd/settings", mode: "page" },
    CLIENT: { path: "/client/portal/settings", mode: "page" },
    COMMERCIAL: { path: "/commercial/portal/settings", mode: "none" },
    DEVELOPER: { path: "/developer/settings", mode: "none" },
};

const ITEM =
    "flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[12.5px] font-medium text-slate-300 text-left transition-colors " +
    "hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white outline-none disabled:opacity-50";

const CHIP =
    "h-7 px-2.5 rounded-md text-[12px] font-medium text-slate-200 bg-white/[0.06] border border-white/[0.08] transition-colors " +
    "hover:bg-white/[0.12] hover:text-white focus-visible:bg-white/[0.12] focus-visible:text-white outline-none disabled:opacity-50";

export function SidebarUserMenu({ isExpanded }: { isExpanded: boolean }) {
    const { data: session } = useSession();
    const { data: avatar } = useMyAvatar();
    const { success: toastSuccess, error: toastError } = useToast();
    const [open, setOpen] = useState(false);
    const [usage, setUsage] = useState<UserAiUsageSummary | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const role = session?.user?.role as UserRole | undefined;
    const softphone = useSoftphone();
    const hold = useLineHold();
    const [notifications, requestNotifications] = useNotificationPermission();
    const hasLine = softphone.enabled;
    // Incoming calls (Twilio or Allo) alert on the desktop: only these roles receive them.
    const takesCalls = Boolean(role && (TELEPHONY_ROLES as readonly string[]).includes(role));
    const [lineBusy, setLineBusy] = useState(false);
    const lineAction = async (run: () => Promise<void>, done: string) => {
        setLineBusy(true);
        try {
            await run();
            toastSuccess(done);
        } catch (e) {
            toastError("Ligne non modifiée", e instanceof Error ? e.message : "Réessayez dans un instant.");
        } finally {
            setLineBusy(false);
        }
    };
    // AI token/cost figures are internal: managers only.
    const showAiUsage = role === "MANAGER";

    // Fetch user AI usage on mount
    useEffect(() => {
        if (!showAiUsage) {
            setUsage(null);
            return;
        }
        let active = true;
        fetch("/api/ai/usage")
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                if (!active || !payload) return;
                const data = payload.data ?? payload;
                setUsage(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [showAiUsage]);

    const name = session?.user?.name ?? "";
    const email = session?.user?.email ?? "";
    const roleLabel = role ? ROLE_LABEL[role] ?? role : "Utilisateur";
    const settings = role ? SETTINGS[role] : undefined;
    const href = (section: string) =>
        !settings ? "/"
        : settings.mode === "sections" ? `${settings.path}?section=${section}`
        : settings.mode === "page" ? `${settings.path}#section-${section}`
        : settings.path;

    const close = useCallback((refocus = false) => {
        setOpen(false);
        if (refocus) buttonRef.current?.focus();
    }, []);

    // Outside click closes.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    // Opening moves focus to the first entry, as a menu should.
    useEffect(() => {
        if (open) menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    }, [open]);

    const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape") {
            e.preventDefault();
            close(true);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            items[(i + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items[(i - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Home") {
            e.preventDefault();
            items[0]?.focus();
        } else if (e.key === "End") {
            e.preventDefault();
            items[items.length - 1]?.focus();
        } else if (e.key === "Tab") {
            setOpen(false);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Menu du compte"
                    onKeyDown={onMenuKeyDown}
                    className="cp-user-menu p-1.5"
                    style={{ bottom: "calc(100% + 8px)", left: 0, right: 0, borderRadius: 14 }}
                >
                    {/* Identity */}
                    <Link
                        href={href("profil")}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="group flex items-center gap-3 p-2 rounded-[10px] hover:bg-white/[0.06] focus-visible:bg-white/[0.06] outline-none transition-colors"
                    >
                        <UserAvatar
                            name={name}
                            src={avatar?.url}
                            className="w-10 h-10 rounded-xl text-[13px] ring-1 ring-white/10"
                            fallbackClassName="bg-primary text-white"
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-white truncate">{name}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{email}</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
                        <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10.5px] font-semibold text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
                            {roleLabel}
                        </span>
                        {!avatar?.url && settings && (
                            <Link
                                href={href("profil")}
                                tabIndex={-1}
                                onClick={() => setOpen(false)}
                                className="text-[10.5px] font-semibold text-accent-300 hover:text-accent-200 transition-colors"
                            >
                                Ajouter une photo
                            </Link>
                        )}
                    </div>

                    <div className="h-px bg-white/[0.07] mx-1 my-1" role="separator" />

                    {/* The line: what happens to a call now, and the same choices as press-and-hold */}
                    {hasLine && (
                        <>
                            <div className="px-2.5 pt-1.5 pb-2">
                                <p className="flex items-start gap-2 text-[12px] leading-snug text-slate-200">
                                    <span
                                        aria-hidden
                                        className={cn("mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0", softphone.line.mode === "on" ? "bg-emerald-400" : "bg-amber-400")}
                                    />
                                    {describeLine(softphone.line)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {softphone.line.mode === "on" ? (
                                        <>
                                            {[15, 30, 60].map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    role="menuitem"
                                                    disabled={lineBusy}
                                                    onClick={() => void lineAction(() => softphone.pauseLine(m), `Ligne en pause ${pauseLabel(m)}`)}
                                                    className={CHIP}
                                                >
                                                    Pause {pauseLabel(m)}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                role="menuitem"
                                                disabled={lineBusy}
                                                onClick={() => void lineAction(() => softphone.setReceiveCalls(false), "Messagerie activée")}
                                                className={CHIP}
                                            >
                                                Messagerie
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            role="menuitem"
                                            disabled={lineBusy}
                                            onClick={() => void lineAction(() => softphone.resumeLine(), "Les appels sonnent de nouveau ici")}
                                            className={cn(CHIP, "text-emerald-200")}
                                        >
                                            Reprendre les appels
                                        </button>
                                    )}
                                </div>
                                {softphone.line.mode === "on" && (
                                    <p className="mt-1.5 text-[10.5px] leading-snug text-slate-400">Ou maintenez votre photo : chaque quart de tour ajoute 15 min.</p>
                                )}
                            </div>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    softphone.openAudioSettings();
                                }}
                                className={ITEM}
                            >
                                <Headphones className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                <span className="truncate">
                                    Micro et écoute
                                    <span className="text-slate-400"> · {softphone.audioPrefs.input?.label ? cleanLabel(softphone.audioPrefs.input.label) : "par défaut"}</span>
                                </span>
                            </button>
                        </>
                    )}
                    {takesCalls && notifications === "default" && (
                        <button type="button" role="menuitem" onClick={() => void requestNotifications()} className={cn(ITEM, "text-amber-200")}>
                            <BellRing className="w-3.5 h-3.5 text-amber-300" aria-hidden />
                            Activer les alertes d&apos;appel
                        </button>
                    )}
                    {takesCalls && notifications === "denied" && settings && (
                        <Link href={href("telephone")} role="menuitem" onClick={() => setOpen(false)} className={cn(ITEM, "text-rose-200")}>
                            <BellRing className="w-3.5 h-3.5 text-rose-300" aria-hidden />
                            Alertes d&apos;appel bloquées : les autoriser
                        </Link>
                    )}
                    {(hasLine || (takesCalls && notifications !== "granted" && notifications !== "unsupported")) && (
                        <div className="h-px bg-white/[0.07] mx-1 my-1" role="separator" />
                    )}

                    {settings && (
                        <>
                            <Link href={href("profil")} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                <User className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                Mon profil
                            </Link>
                            {settings.mode !== "none" && (
                                <Link href={href("securite")} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                    Sécurité & appareils
                                </Link>
                            )}
                            {role === "MANAGER" && (
                                <Link href="/manager/settings" role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                    <Settings2 className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                    Paramètres de l&apos;agence
                                </Link>
                            )}
                            <div className="h-px bg-white/[0.07] mx-1 my-1" role="separator" />
                        </>
                    )}

                    {/* AI Consumption (small text area) — managers only */}
                    {showAiUsage && (
                    <div className="mx-1 my-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px]">
                        <div className="flex items-center justify-between text-slate-300">
                            <span className="font-medium">IA aujourd&apos;hui</span>
                            <span className="font-semibold tabular-nums text-slate-100">
                                {formatTokens(usage?.today?.tokens ?? 0)} tok.
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                            <span>Coût : <strong className="text-slate-200">{formatEuros(usage?.today?.costEur ?? 0)}</strong></span>
                            <span className="text-slate-500 font-mono text-[9.5px]">{usage?.defaultModel ?? "gpt-4o-mini"}</span>
                        </div>
                        {usage && usage.total.tokens > 0 && (
                            <div className="flex items-center justify-between text-[9.5px] text-slate-500 mt-1 pt-1 border-t border-white/[0.04]">
                                <span>Cumul total</span>
                                <span>{formatTokens(usage.total.tokens)} tok.</span>
                            </div>
                        )}
                    </div>
                    )}

                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className={cn(ITEM, "text-red-400 hover:text-red-300 hover:bg-red-500/[0.12] focus-visible:text-red-300 focus-visible:bg-red-500/[0.12]")}
                    >
                        <LogOut className="w-3.5 h-3.5" aria-hidden />
                        Se déconnecter
                    </button>
                </div>
            )}

            <button
                ref={buttonRef}
                type="button"
                {...hold.handlers}
                onClick={() => {
                    if (hold.consumeClick()) return; // that press was a hold: it paused the line
                    setOpen((o) => !o);
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={
                    hasLine
                        ? `Compte de ${name} — ${roleLabel}. ${describeLine(softphone.line)}. Maintenir pour mettre la ligne en pause.`
                        : `Compte de ${name} — ${roleLabel}`
                }
                title={hasLine ? `${describeLine(softphone.line)} · maintenez pour une pause` : undefined}
                className={cn(
                    "group w-full flex items-center gap-2.5 rounded-xl border text-left transition-[background-color,border-color] duration-150 outline-none select-none touch-manipulation",
                    "focus-visible:ring-2 focus-visible:ring-accent-400/60",
                    isExpanded ? "p-1.5 pr-2" : "p-1 justify-center",
                    // Today's AI usage lives in the menu (and beside Captain AI's history), not on the trigger.
                    open ? "bg-white/[0.08] border-white/[0.08]" : "border-transparent hover:bg-white/[0.06]",
                )}
            >
                <LineRing heldMs={hold.heldMs} notifications={notifications} showNotch={takesCalls}>
                    <UserAvatar
                        name={name}
                        src={avatar?.url}
                        className="w-8 h-8 flex-shrink-0 rounded-lg text-[11px] ring-1 ring-white/10"
                        fallbackClassName="bg-primary text-white"
                    />
                </LineRing>
                {isExpanded && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold text-white truncate leading-tight">{name}</span>
                            <span
                                className={cn(
                                    "block text-[11px] truncate leading-tight mt-0.5",
                                    hold.pendingMinutes ? "text-white" : hasLine && softphone.line.mode !== "on" ? "text-amber-300" : "text-slate-400",
                                )}
                            >
                                {hasLine ? lineCaption(softphone.line, hold.pendingMinutes) : roleLabel}
                            </span>
                        </span>
                        <ChevronUp
                            className={cn("w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-transform duration-150 flex-shrink-0", !open && "rotate-180")}
                            aria-hidden
                        />
                    </>
                )}
            </button>
        </div>
    );
}

function formatTokens(num: number) {
    return new Intl.NumberFormat("fr-FR").format(num);
}

function formatEuros(cost: number) {
    if (cost < 0.01 && cost > 0) {
        return `${cost.toFixed(4).replace(".", ",")} €`;
    }
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(cost);
}
