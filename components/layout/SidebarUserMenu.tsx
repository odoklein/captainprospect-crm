"use client";

// ============================================
// SIDEBAR USER MENU — the profile button at the foot of the sidebar and its
// popover: photo, name and role, shortcuts into the role's settings page, and
// the sign-out actions. Self-contained (state, outside click, keyboard).
// ============================================

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ChevronUp, LogOut, Settings2, ShieldCheck, ShieldOff, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { UserAvatar, useMyAvatar } from "@/components/settings/Avatar";
import { ROLE_LABEL } from "@/components/settings/roles";

/** Personal settings page per role; `sections` = it understands ?section=. */
const SETTINGS: Partial<Record<UserRole, { path: string; sections: boolean }>> = {
    MANAGER: { path: "/manager/settings", sections: true },
    SDR: { path: "/sdr/settings", sections: true },
    BOOKER: { path: "/sdr/settings", sections: true },
    BUSINESS_DEVELOPER: { path: "/bd/settings", sections: true },
    CLIENT: { path: "/client/portal/settings", sections: true },
    COMMERCIAL: { path: "/commercial/portal/settings", sections: false },
    DEVELOPER: { path: "/developer/settings", sections: false },
};

const ITEM =
    "flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-[12.5px] font-medium text-slate-300 text-left transition-colors " +
    "hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white outline-none disabled:opacity-50";

export function SidebarUserMenu({ isExpanded }: { isExpanded: boolean }) {
    const { data: session } = useSession();
    const { data: avatar } = useMyAvatar();
    const { success: toastSuccess, error: toastError } = useToast();
    const [open, setOpen] = useState(false);
    const [loggingOutOthers, setLoggingOutOthers] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const role = session?.user?.role as UserRole | undefined;
    const name = session?.user?.name ?? "";
    const email = session?.user?.email ?? "";
    const roleLabel = role ? ROLE_LABEL[role] ?? role : "Utilisateur";
    const settings = role ? SETTINGS[role] : undefined;
    const href = (section: string) => (settings?.sections ? `${settings.path}?section=${section}` : settings?.path ?? "/");

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

    const logoutOtherDevices = async () => {
        setLoggingOutOthers(true);
        try {
            const res = await fetch("/api/account/sessions/logout-others", { method: "POST" });
            const j = await res.json();
            if (j.success) toastSuccess("Appareils déconnectés", j.data?.message ?? "");
            else toastError("Erreur", j.error ?? "Impossible de déconnecter les autres appareils");
        } catch {
            toastError("Erreur", "Impossible de déconnecter les autres appareils");
        } finally {
            setLoggingOutOthers(false);
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
                            fallbackClassName="bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] text-white"
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-white truncate">{name}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{email}</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
                        <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10.5px] font-semibold text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" aria-hidden />
                            {roleLabel}
                        </span>
                        {!avatar?.url && settings && (
                            <Link
                                href={href("profil")}
                                tabIndex={-1}
                                onClick={() => setOpen(false)}
                                className="text-[10.5px] font-semibold text-violet-300 hover:text-violet-200 transition-colors"
                            >
                                Ajouter une photo
                            </Link>
                        )}
                    </div>

                    <div className="h-px bg-white/[0.07] mx-1 my-1" role="separator" />

                    {settings && (
                        <>
                            <Link href={href("profil")} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                <User className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                Mon profil
                            </Link>
                            {settings.sections && (
                                <Link href={href("securite")} role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                    Sécurité & appareils
                                </Link>
                            )}
                            {role === "MANAGER" && (
                                <Link href="/manager/settings?section=equipe" role="menuitem" onClick={() => setOpen(false)} className={ITEM}>
                                    <Settings2 className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                                    Paramètres de la plateforme
                                </Link>
                            )}
                            <div className="h-px bg-white/[0.07] mx-1 my-1" role="separator" />
                        </>
                    )}

                    <button type="button" role="menuitem" onClick={logoutOtherDevices} disabled={loggingOutOthers} className={ITEM}>
                        <ShieldOff className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                        {loggingOutOthers ? "Déconnexion…" : "Déconnecter les autres appareils"}
                    </button>
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
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Compte de ${name} — ${roleLabel}`}
                className={cn(
                    "group w-full flex items-center gap-2.5 rounded-xl border text-left transition-[background-color,border-color] duration-150 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-violet-400/60",
                    isExpanded ? "p-1.5 pr-2" : "p-1 justify-center",
                    open ? "bg-white/[0.08] border-white/[0.10]" : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.10]",
                )}
            >
                <span className="relative flex-shrink-0">
                    <UserAvatar
                        name={name}
                        src={avatar?.url}
                        className={cn("rounded-[10px] text-[11px] ring-1 ring-white/10", isExpanded ? "w-9 h-9" : "w-8 h-8")}
                        fallbackClassName="bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] text-white"
                    />
                    <span aria-hidden className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#101026] shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                </span>
                {isExpanded && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold text-white truncate leading-tight">{name}</span>
                            <span className="block text-[10.5px] text-slate-400 truncate leading-tight mt-0.5">
                                {roleLabel}
                                <span className="text-slate-500"> · </span>
                                <span className="group-hover:text-violet-300 transition-colors">Mon compte</span>
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
