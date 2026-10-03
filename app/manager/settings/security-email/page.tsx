"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, RotateCcw, Shield, KeyRound } from "lucide-react";
import {
  PASSWORD_OTP_TEMPLATE_VARIABLES,
  PASSWORD_RECOVERY_TEMPLATE_VARIABLES,
} from "@/lib/email/templates/security-auth";

type TemplateKey = "password_recovery" | "password_otp";

type TemplateData = {
  key: TemplateKey;
  name: string;
  subject: string;
  bodyHtml: string;
  isCustomized: boolean;
  defaultSubject: string;
  defaultBodyHtml: string;
};

const TEMPLATE_OPTIONS: Array<{ key: TemplateKey; label: string }> = [
  { key: "password_recovery", label: "Recuperation mot de passe (lien)" },
  { key: "password_otp", label: "Recuperation mot de passe (OTP)" },
];

export default function SecurityEmailSettingsPage() {
  const [selectedKey, setSelectedKey] = useState<TemplateKey>("password_recovery");
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const variables = useMemo(
    () =>
      selectedKey === "password_recovery"
        ? PASSWORD_RECOVERY_TEMPLATE_VARIABLES
        : PASSWORD_OTP_TEMPLATE_VARIABLES,
    [selectedKey]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/system-templates/${selectedKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (!json.success) {
          setErr(json.error || "Erreur de chargement");
          return;
        }
        setTemplate(json.data);
        setSubject(json.data.subject);
        setBodyHtml(json.data.bodyHtml);
      })
      .catch(() => {
        if (alive) setErr("Erreur de connexion");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedKey]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/system-templates/${selectedKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml }),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error || "Erreur de sauvegarde");
        return;
      }
      setMsg("Template enregistre");
      setTemplate((prev) => (prev ? { ...prev, isCustomized: true } : prev));
    } catch {
      setErr("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Restaurer le template par defaut ?")) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/system-templates/${selectedKey}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.error || "Erreur de reinitialisation");
        return;
      }
      const reload = await fetch(`/api/system-templates/${selectedKey}`).then((r) =>
        r.json()
      );
      if (reload.success) {
        setTemplate(reload.data);
        setSubject(reload.data.subject);
        setBodyHtml(reload.data.bodyHtml);
      }
      setMsg("Template restaure");
    } catch {
      setErr("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-6 py-10 text-slate-500">Chargement...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <Link
        href="/manager/settings"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux parametres
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-primary-600" />
          <h1 className="text-xl font-semibold text-slate-900">
            Templates emails securite
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          Configurez les emails de recuperation de mot de passe (lien) et OTP.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <label className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Template
        </label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value as TemplateKey)}
          className="w-full max-w-md border border-slate-200 rounded-xl px-3 py-2 text-sm"
        >
          {TEMPLATE_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          {variables.map((v) => (
            <span
              key={v.name}
              title={v.description}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-slate-200 bg-slate-50 text-slate-700"
            >
              <KeyRound className="w-3 h-3" />
              {v.name}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            Sujet
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            HTML
          </label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={18}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
          />
        </div>

        {(msg || err) && (
          <p className={`text-sm ${err ? "text-red-600" : "text-emerald-600"}`}>
            {err || msg}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Restaurer defaut
          </button>
          {template?.isCustomized && (
            <span className="text-xs text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2 py-1">
              Personnalise
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
