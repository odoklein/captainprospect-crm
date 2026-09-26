"use client";

import { HrSubNav } from "@/components/hr/HrSubNav";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Ressources Humaines & Gestion d'Équipe
        </p>
        <HrSubNav />
      </div>
      {children}
    </div>
  );
}
