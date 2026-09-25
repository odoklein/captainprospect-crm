"use client";

import React from "react";
import { BroadcastVariable } from "@/lib/broadcast/types";
import { Sparkles } from "lucide-react";

interface VariablePickerProps {
  variables: BroadcastVariable[];
  onSelectVariable: (token: string) => void;
  title?: string;
}

export function VariablePicker({
  variables,
  onSelectVariable,
  title = "Variables personnalisées — Cliquez pour insérer",
}: VariablePickerProps) {
  if (!variables || variables.length === 0) return null;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-slate-50 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          {title}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {variables.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onSelectVariable(v.token)}
            title={`${v.description} (Exemple: "${v.sampleValue}")`}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:border-indigo-400 hover:bg-indigo-50/80 transition-all text-left"
          >
            <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-700">
              {v.label}
            </span>
            <span className="text-[11px] font-mono text-slate-400 group-hover:text-indigo-500">
              {v.token}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        💡 Ces variables seront automatiquement remplacées par les vraies valeurs lors de l&apos;envoi au destinataire.
      </p>
    </div>
  );
}
