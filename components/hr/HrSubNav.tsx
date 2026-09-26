"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Calendar, MessageSquare, Wallet } from "lucide-react";

export function HrSubNav() {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/manager/rh",
      label: "Tableau RH & Paie",
      icon: Wallet,
      active: pathname === "/manager/rh" || pathname.startsWith("/manager/rh/"),
    },
    {
      href: "/manager/utilisateurs",
      label: "Utilisateurs & Accès",
      icon: Users,
      active: pathname === "/manager/utilisateurs" || pathname.startsWith("/manager/utilisateurs/"),
    },
    {
      href: "/manager/sdr-feedback",
      label: "Avis Booker",
      icon: MessageSquare,
      active: pathname === "/manager/sdr-feedback",
    },
    {
      href: "/manager/planning",
      label: "Planning",
      icon: Calendar,
      active: pathname === "/manager/planning",
    },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 pb-3 overflow-x-auto">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              item.active
                ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-200/60"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${item.active ? "text-indigo-600" : "text-slate-400"}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
