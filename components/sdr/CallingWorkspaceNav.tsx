"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, Headphones, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const pages = [
    { href: "/sdr/action", label: "Appeler", icon: Phone },
    { href: "/sdr/focus", label: "Mode focus", icon: Crosshair },
    { href: "/sdr/appels", label: "Mes appels", icon: Headphones },
];

export function CallingWorkspaceNav() {
    const pathname = usePathname();
    return (
        <nav aria-label="Espace d’appel" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none]">
            {pages.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
                    className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-[11px] sm:text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:px-3",
                        pathname === href ? "bg-surface text-ink shadow-sm ring-1 ring-line-subtle" : "text-ink-3 hover:bg-surface/60 hover:text-ink")}>
                    <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden />{label}
                </Link>
            ))}
        </nav>
    );
}
