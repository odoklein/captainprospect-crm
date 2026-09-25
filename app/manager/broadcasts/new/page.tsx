"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Zap,
  Mail,
  Bell,
  Users,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Send,
  Eye,
  Check,
  RefreshCw,
} from "lucide-react";
import { EmailBlock } from "@/lib/broadcast/types";
import { BROADCAST_VARIABLES_REGISTRY } from "@/lib/broadcast/types";
import { VisualEmailEditor } from "@/components/broadcast/VisualEmailEditor";
import { LivePreviewModal } from "@/components/broadcast/LivePreviewModal";
import { SendTestEmailModal } from "@/components/broadcast/SendTestEmailModal";

export default function NewBroadcastWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // ── Step 1: Info & Trigger ────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [category, setCategory] = useState("ANNOUNCEMENT");
  const [triggerType, setTriggerType] = useState<"EVENT" | "MANUAL">("EVENT");
  const [triggerEvent, setTriggerEvent] = useState("new_client_welcome");

  // ── Step 2: Actions & Channels ────────────────────────────────────────────
  const [actionEmail, setActionEmail] = useState(true);
  const [actionInApp, setActionInApp] = useState(false);
  const [actionTeamAlert, setActionTeamAlert] = useState(false);

  // ── Step 3: Audience ──────────────────────────────────────────────────────
  const [audienceTarget, setAudienceTarget] = useState<
    "ALL_CLIENTS" | "ALL_COMMERCIALS" | "INTERNAL_TEAM" | "CUSTOM"
  >("ALL_CLIENTS");

  // ── Step 4: Content ───────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([
    {
      id: "nb_head",
      type: "header",
      props: { showLogo: true, logoSubtitle: "Notification Plateforme" },
    },
    {
      id: "nb_title",
      type: "heading",
      content: "Bienvenue sur votre espace Captain Prospect",
      props: { align: "left" },
    },
    {
      id: "nb_text",
      type: "paragraph",
      content:
        "Bonjour **{{userName}}**,\n\nVotre espace client est désormais prêt. Vous pouvez y suivre l'avancement de votre prospection, vos rendez-vous et vos statistiques en temps réel.",
    },
    {
      id: "nb_cta",
      type: "button",
      props: {
        buttonText: "Accéder à mon tableau de bord →",
        buttonUrl: "https://app.captainprospect.fr",
        buttonColor: "#4f46e5",
      },
    },
    {
      id: "nb_foot",
      type: "footer",
      content: "Captain Prospect · Équipe Succès Client",
    },
  ]);
  const [rawHtml, setRawHtml] = useState("");

  // Modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-generate key from name
  function handleNameChange(val: string) {
    setName(val);
    if (!key || key.startsWith("custom_")) {
      const slug = val
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      setKey(slug ? `custom_${slug}` : "");
    }
  }

  async function handleCreateBroadcast() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/manager/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key || `custom_${Date.now()}`,
          name: name || "Nouveau Broadcast",
          subject: subject || name,
          blocks,
          rawHtml,
        }),
      });

      const json = await res.json();
      if (json.success) {
        router.push("/manager/broadcasts");
      } else {
        alert(json.error || "Erreur lors de la création");
      }
    } catch {
      alert("Erreur de communication avec le serveur.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Back button */}
      <Link
        href="/manager/broadcasts"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au Hub Broadcasts
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Créer un nouveau Broadcast
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Assistant guidé pour configurer le déclencheur, les actions et le message sans code.
        </p>
      </div>

      {/* Stepper Wizard Indicator */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { num: 1, label: "Déclencheur" },
          { num: 2, label: "Actions" },
          { num: 3, label: "Audience" },
          { num: 4, label: "Message" },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => s.num < step && setStep(s.num as any)}
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
              step === s.num
                ? "border-indigo-600 bg-indigo-50/60 text-indigo-700 shadow-xs"
                : step > s.num
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === s.num
                  ? "bg-indigo-600 text-white"
                  : step > s.num
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {step > s.num ? <Check className="w-3 h-3" /> : s.num}
            </div>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ──────────────── STEP 1: TRIGGER & INFO ──────────────── */}
      {step === 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <h2 className="text-base font-bold text-slate-900">
            Étape 1 : Définir le nom et le déclencheur
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Nom du broadcast *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Bienvenue Nouveau Client"
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Catégorie
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                >
                  <option value="ANNOUNCEMENT">Annonce / Communication</option>
                  <option value="RDV">Rendez-vous & Opérationnel</option>
                  <option value="SECURITY">Sécurité & Authentification</option>
                  <option value="ACCOUNT">Compte & Onboarding</option>
                  <option value="CUSTOM">Personnalisé</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Identifiant technique (Clé)
                </label>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="custom_mon_broadcast"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 font-mono text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Type de déclenchement
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer ${
                    triggerType === "EVENT"
                      ? "border-indigo-600 bg-indigo-50/50"
                      : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="trig"
                    checked={triggerType === "EVENT"}
                    onChange={() => setTriggerType("EVENT")}
                    className="accent-indigo-600 mt-1"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      ⚡ Automatique sur événement
                    </span>
                    <span className="text-xs text-slate-500">
                      Déclenché automatiquement par le système lors d&apos;une action
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer ${
                    triggerType === "MANUAL"
                      ? "border-indigo-600 bg-indigo-50/50"
                      : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="trig"
                    checked={triggerType === "MANUAL"}
                    onChange={() => setTriggerType("MANUAL")}
                    className="accent-indigo-600 mt-1"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      📢 Envoi manuel / Campagne
                    </span>
                    <span className="text-xs text-slate-500">
                      Diffusé à la demande par un manager ou planifié à l&apos;avance
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Étape suivante : Actions
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── STEP 2: ACTIONS & CHANNELS ──────────────── */}
      {step === 2 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <h2 className="text-base font-bold text-slate-900">
            Étape 2 : Sélectionner les actions à exécuter
          </h2>
          <p className="text-xs text-slate-500">
            Choisissez quels canaux seront activés lorsque ce broadcast sera déclenché.
          </p>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={actionEmail}
                onChange={(e) => setActionEmail(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-bold text-slate-900">Envoyer un Email</span>
                  <span className="text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    Recommandé
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Expédie un email HTML soigné et personnalisé vers la boîte de réception du destinataire.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={actionInApp}
                onChange={(e) => setActionInApp(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-bold text-slate-900">
                    Afficher une notification In-App
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fait apparaître un bandeau ou une pastille de notification sur le portail du destinataire.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={actionTeamAlert}
                onChange={(e) => setActionTeamAlert(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-900">
                    Notifier l&apos;équipe interne (Comms)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diffuse une copie ou une alerte dans le canal Comms des managers.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Retour
            </button>
            <button
              type="button"
              disabled={!actionEmail && !actionInApp && !actionTeamAlert}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Étape suivante : Audience
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── STEP 3: AUDIENCE ──────────────── */}
      {step === 3 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <h2 className="text-base font-bold text-slate-900">
            Étape 3 : Définir la cible du broadcast
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: "ALL_CLIENTS",
                label: "Tous les clients",
                desc: "Les comptes clients avec accès portail",
              },
              {
                id: "ALL_COMMERCIALS",
                label: "Tous les commerciaux",
                desc: "Tous les interlocuteurs commerciaux de terrain",
              },
              {
                id: "INTERNAL_TEAM",
                label: "Équipe interne",
                desc: "Managers, SDR, Bookers et développeurs",
              },
              {
                id: "CUSTOM",
                label: "Déterminé par l'événement",
                desc: "Le contact lié au déclencheur (ex: le client concerné par le RDV)",
              },
            ].map((aud) => (
              <label
                key={aud.id}
                className={`p-4 rounded-xl border cursor-pointer block transition-all ${
                  audienceTarget === aud.id
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="aud_target"
                  checked={audienceTarget === aud.id}
                  onChange={() => setAudienceTarget(aud.id as any)}
                  className="accent-indigo-600 mb-2"
                />
                <span className="text-sm font-bold text-slate-900 block">{aud.label}</span>
                <span className="text-xs text-slate-500">{aud.desc}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Retour
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              Étape suivante : Message
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── STEP 4: MESSAGE CONTENT ──────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Étape 4 : Rédaction visuelle du message
                </h2>
                <p className="text-xs text-slate-500">
                  Concevez votre message sans code. Ajoutez des titres, paragraphes, boutons et variables.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Aperçu
                </button>
                <button
                  type="button"
                  onClick={() => setTestOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200"
                >
                  <Send className="w-3.5 h-3.5" />
                  Tester
                </button>
              </div>
            </div>

            <VisualEmailEditor
              subject={subject || name}
              onSubjectChange={setSubject}
              blocks={blocks}
              onBlocksChange={setBlocks}
              rawHtml={rawHtml}
              onRawHtmlChange={setRawHtml}
              variables={BROADCAST_VARIABLES_REGISTRY.general}
            />

            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Retour
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleCreateBroadcast}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-600/20 transition-all"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Création en cours…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Enregistrer et activer le broadcast
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <LivePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        subject={subject || name}
        blocks={blocks}
        rawHtml={rawHtml}
      />

      {/* Test Email Modal */}
      <SendTestEmailModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        broadcastKey={key || "general"}
        subject={subject || name}
        blocks={blocks}
        rawHtml={rawHtml}
      />
    </div>
  );
}
