"use client";

import React, { useState, useEffect } from "react";
import { Monitor, Smartphone, Sparkles, X, RefreshCw } from "lucide-react";
import { EmailBlock } from "@/lib/broadcast/types";

interface LivePreviewModalProps {
  open: boolean;
  onClose: () => void;
  broadcastKey?: string;
  subject: string;
  blocks?: EmailBlock[];
  rawHtml?: string;
  accentColor?: string;
}

export function LivePreviewModal({
  open,
  onClose,
  broadcastKey,
  subject,
  blocks,
  rawHtml,
  accentColor = "#4f46e5",
}: LivePreviewModalProps) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [useSampleData, setUseSampleData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    html: string;
  }>({ subject: "", html: "" });

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);

    fetch("/api/manager/broadcasts/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: broadcastKey,
        subject,
        blocks,
        rawHtml,
        accentColor,
        useSampleData,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json.success) {
          setPreviewData(json.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, broadcastKey, subject, blocks, rawHtml, accentColor, useSampleData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6">
      <div className="w-full max-w-5xl h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">
              Aperçu en direct
            </span>
            <span className="text-xs text-slate-400">· Rendu destinataire</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Sample data toggle */}
            <button
              type="button"
              onClick={() => setUseSampleData((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                useSampleData
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              {useSampleData ? "Données d'exemple actives" : "Tags bruts ({{...}})"}
            </button>

            {/* Device Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setDevice("desktop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  device === "desktop"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Ordinateur
              </button>
              <button
                type="button"
                onClick={() => setDevice("mobile")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  device === "mobile"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Email Header Preview (Subject & Sender) */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 text-xs text-slate-600 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 truncate">
            <span className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Objet :
            </span>
            <span className="font-medium text-slate-900 truncate">
              {previewData.subject || subject || "(Aucun objet)"}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 shrink-0">
            De : Captain Prospect &lt;notifications@captainprospect.fr&gt;
          </span>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-slate-100 p-6 overflow-y-auto flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Génération de l&apos;aperçu…</span>
            </div>
          ) : device === "desktop" ? (
            <div className="w-full max-w-2xl h-full bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden flex flex-col">
              <iframe
                title="Aperçu Desktop"
                srcDoc={previewData.html}
                sandbox="allow-same-origin"
                className="w-full flex-1 border-0"
              />
            </div>
          ) : (
            /* Smartphone Frame */
            <div className="w-[375px] h-[640px] bg-slate-900 rounded-[44px] p-3.5 shadow-2xl border-4 border-slate-800 flex flex-col shrink-0">
              {/* Phone Speaker Notch */}
              <div className="w-full h-5 flex justify-center items-center mb-1">
                <div className="w-20 h-4 bg-black rounded-full" />
              </div>
              {/* Phone Screen */}
              <div className="w-full flex-1 bg-white rounded-[32px] overflow-hidden flex flex-col">
                <iframe
                  title="Aperçu Mobile"
                  srcDoc={previewData.html}
                  sandbox="allow-same-origin"
                  className="w-full flex-1 border-0"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
