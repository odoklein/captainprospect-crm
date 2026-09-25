"use client";

import React, { useState } from "react";
import { Mail, Send, CheckCircle2, AlertCircle, RefreshCw, X } from "lucide-react";
import { EmailBlock } from "@/lib/broadcast/types";

interface SendTestEmailModalProps {
  open: boolean;
  onClose: () => void;
  broadcastKey: string;
  defaultEmail?: string;
  subject: string;
  blocks?: EmailBlock[];
  rawHtml?: string;
  accentColor?: string;
}

export function SendTestEmailModal({
  open,
  onClose,
  broadcastKey,
  defaultEmail = "",
  subject,
  blocks,
  rawHtml,
  accentColor,
}: SendTestEmailModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!open) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch(`/api/manager/broadcasts/${broadcastKey}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: email,
          subject,
          blocks,
          rawHtml,
          accentColor,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setResult({
          ok: true,
          message: `L'email de test a été envoyé avec succès à ${email}. Vérifiez votre boîte de réception (et vos spams si besoin).`,
        });
      } else {
        setResult({
          ok: false,
          message: json.error || "Une erreur est survenue lors de l'envoi de test.",
        });
      }
    } catch {
      setResult({
        ok: false,
        message: "Erreur de connexion avec le serveur.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Mail className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">
                Envoyer un email de test
              </h3>
              <p className="text-[11px] text-slate-500">
                Aperçu réel avec données d&apos;exemple
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Pour vérifier le rendu exact dans votre propre messagerie (Gmail, Outlook, mobile),
            nous allons vous envoyer une copie du message avec des données de test réalistes.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Adresse email de réception
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre.email@domaine.com"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-800"
            />
          </div>

          {result && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                result.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{result.message}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={sending || !email}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              {sending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Envoyer le test
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
