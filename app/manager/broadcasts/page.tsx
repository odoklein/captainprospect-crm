"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Megaphone,
  Bell,
  Mail,
  Zap,
  Calendar,
  Shield,
  KeyRound,
  Users,
  UserCheck,
  Building2,
  MousePointer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Send,
  Plus,
  Edit3,
  RotateCcw,
  Sparkles,
  Search,
  ExternalLink,
  ChevronRight,
  Filter,
  Check,
  RefreshCw,
  X,
} from "lucide-react";
import {
  BroadcastItemView,
} from "@/lib/broadcast/service";
import {
  BROADCAST_VARIABLES_REGISTRY,
  EmailBlock,
} from "@/lib/broadcast/types";
import { VisualEmailEditor } from "@/components/broadcast/VisualEmailEditor";
import { LivePreviewModal } from "@/components/broadcast/LivePreviewModal";
import { SendTestEmailModal } from "@/components/broadcast/SendTestEmailModal";

// ============================================
// AUDIENCE DEFINITIONS FOR CAMPAIGNS
// ============================================

type AudienceType = "ALL_CLIENTS" | "ALL_COMMERCIALS" | "INTERNAL_TEAM" | "SELECTION";

interface SelectableUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface BroadcastRecord {
  id: string;
  subject: string;
  bodyHtml: string;
  audienceType: AudienceType;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: "SENDING" | "SENT" | "PARTIAL" | "FAILED";
  sentAt: string | null;
  createdAt: string;
  sentBy: { id: string; name: string; email: string };
  recipients: {
    id: string;
    email: string;
    name: string | null;
    wasSent: boolean;
    openedAt: string | null;
    openCount: number;
    lastOpenedAt: string | null;
  }[];
}

const AUDIENCE_OPTIONS: {
  value: AudienceType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "ALL_CLIENTS",
    label: "Tous les clients",
    description: "Tous les comptes clients actifs de la plateforme",
    icon: Users,
  },
  {
    value: "ALL_COMMERCIALS",
    label: "Tous les commerciaux",
    description: "Tous les interlocuteurs commerciaux actifs",
    icon: UserCheck,
  },
  {
    value: "INTERNAL_TEAM",
    label: "Équipe interne",
    description: "Managers, SDR, Booker, Dev et Business Developer",
    icon: Building2,
  },
  {
    value: "SELECTION",
    label: "Sélection manuelle",
    description: "Choisissez précisément les destinataires un par un",
    icon: MousePointer,
  },
];

export default function ManagerBroadcastsHubPage() {
  const [activeTab, setActiveTab] = useState<
    "automated" | "campaign" | "templates" | "history"
  >("automated");

  // ── Automated Broadcasts State ────────────────────────────────────────────
  const [broadcasts, setBroadcasts] = useState<BroadcastItemView[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);
  const [broadcastSearch, setBroadcastSearch] = useState("");

  // Editor Drawer / Modal state for editing an automated broadcast
  const [editingBroadcast, setEditingBroadcast] = useState<BroadcastItemView | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBlocks, setEditBlocks] = useState<EmailBlock[]>([]);
  const [editRawHtml, setEditRawHtml] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Preview & Test modals state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [targetBroadcastKey, setTargetBroadcastKey] = useState<string>("rdv_notification");

  // ── Campaign Composer State ───────────────────────────────────────────────
  const [campaignAudience, setCampaignAudience] = useState<AudienceType>("ALL_CLIENTS");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBlocks, setCampaignBlocks] = useState<EmailBlock[]>([
    {
      id: "c_head",
      type: "header",
      props: { showLogo: true, logoSubtitle: "Communication officielle" },
    },
    {
      id: "c_title",
      type: "heading",
      content: "Mise à jour importante de votre espace",
      props: { align: "left" },
    },
    {
      id: "c_text",
      type: "paragraph",
      content:
        "Bonjour {{userName}},\n\nNous tenions à vous informer d'une nouveauté sur votre plateforme de prospection commerciale.",
    },
    {
      id: "c_cta",
      type: "button",
      props: {
        buttonText: "Accéder à mon espace →",
        buttonUrl: "https://app.captainprospect.fr",
        buttonColor: "#4f46e5",
      },
    },
    {
      id: "c_foot",
      type: "footer",
      content: "L'équipe Captain Prospect",
    },
  ]);
  const [campaignRawHtml, setCampaignRawHtml] = useState("");
  const [audienceCounts, setAudienceCounts] = useState<{
    clients: number;
    commercials: number;
    internalTeam: number;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<SelectableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignResult, setCampaignResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── History State ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);

  // ── Load Broadcasts ───────────────────────────────────────────────────────
  const loadBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true);
    try {
      const res = await fetch("/api/manager/broadcasts");
      const json = await res.json();
      if (json.success) {
        setBroadcasts(json.data.items);
      }
    } catch {
      // Handle error
    } finally {
      setLoadingBroadcasts(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  // ── Load Audience Counts ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/manager/broadcast-emails/audience-counts")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAudienceCounts(j.data);
      })
      .catch(() => {});
  }, []);

  // ── Load Users for Selection ──────────────────────────────────────────────
  useEffect(() => {
    if (campaignAudience !== "SELECTION" || allUsers.length > 0) return;
    setLoadingUsers(true);
    fetch("/api/manager/broadcast-emails/selectable-users")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAllUsers(j.data);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [campaignAudience, allUsers.length]);

  // ── Load History ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/manager/broadcast-emails?page=1&limit=15");
      const json = await res.json();
      if (json.success) {
        setHistory(json.data.items);
        setHistoryTotal(json.data.total);
      }
    } catch {
      // Error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // ── Open Edit Modal for a Broadcast ───────────────────────────────────────
  function handleOpenEdit(b: BroadcastItemView) {
    setEditingBroadcast(b);
    setEditSubject(b.subject);
    setEditBlocks(b.blocks || []);
    setEditRawHtml(b.bodyHtml || "");
    setEditSuccessMsg(null);
  }

  // ── Save Edited Broadcast ─────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!editingBroadcast) return;
    setSavingEdit(true);
    setEditSuccessMsg(null);

    try {
      const res = await fetch(`/api/manager/broadcasts/${editingBroadcast.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editSubject,
          blocks: editBlocks,
          rawHtml: editRawHtml,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditSuccessMsg("Le broadcast a été enregistré avec succès !");
        loadBroadcasts();
      } else {
        alert(json.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      alert("Erreur de connexion");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Reset Broadcast to Default ────────────────────────────────────────────
  async function handleResetBroadcast(key: string) {
    if (!confirm("Voulez-vous vraiment restaurer le modèle par défaut du système ?")) {
      return;
    }
    try {
      const res = await fetch(`/api/manager/broadcasts/${key}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        loadBroadcasts();
        if (editingBroadcast?.key === key) {
          setEditingBroadcast(null);
        }
      }
    } catch {
      alert("Erreur lors de la réinitialisation");
    }
  }

  // ── Send Campaign Blast ───────────────────────────────────────────────────
  async function handleSendCampaign() {
    const count =
      campaignAudience === "ALL_CLIENTS"
        ? audienceCounts?.clients ?? 0
        : campaignAudience === "ALL_COMMERCIALS"
        ? audienceCounts?.commercials ?? 0
        : campaignAudience === "INTERNAL_TEAM"
        ? audienceCounts?.internalTeam ?? 0
        : selectedUserIds.size;

    if (count === 0) {
      alert("Aucun destinataire sélectionné.");
      return;
    }

    if (
      !confirm(
        `Confirmez-vous l'envoi immédiat de cette campagne à ${count} destinataire(s) ?`
      )
    ) {
      return;
    }

    setSendingCampaign(true);
    setCampaignResult(null);

    try {
      // Compile blocks into HTML via preview endpoint or direct compilation
      const previewRes = await fetch("/api/manager/broadcasts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: campaignSubject,
          blocks: campaignBlocks,
          rawHtml: campaignRawHtml,
          useSampleData: false,
        }),
      });
      const previewJson = await previewRes.json();
      const compiledHtml = previewJson.data?.html || campaignRawHtml;

      const body: Record<string, unknown> = {
        subject: campaignSubject,
        bodyHtml: compiledHtml,
        audienceType: campaignAudience,
      };
      if (campaignAudience === "SELECTION") {
        body.recipientIds = Array.from(selectedUserIds);
      }

      const res = await fetch("/api/manager/broadcast-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.success) {
        setCampaignResult({
          ok: true,
          message: `Campagne envoyée avec succès à ${json.data.sentCount} destinataires !`,
        });
        setCampaignSubject("");
        setSelectedUserIds(new Set());
      } else {
        setCampaignResult({
          ok: false,
          message: json.error || "Erreur lors de l'envoi de la campagne.",
        });
      }
    } catch {
      setCampaignResult({ ok: false, message: "Erreur de communication avec le serveur." });
    } finally {
      setSendingCampaign(false);
    }
  }

  // ── Filtered items ────────────────────────────────────────────────────────
  const filteredBroadcasts = broadcasts.filter(
    (b) =>
      b.name.toLowerCase().includes(broadcastSearch.toLowerCase()) ||
      b.description.toLowerCase().includes(broadcastSearch.toLowerCase()) ||
      b.category.toLowerCase().includes(broadcastSearch.toLowerCase())
  );

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const targetCampaignRecipientCount =
    campaignAudience === "ALL_CLIENTS"
      ? audienceCounts?.clients ?? 0
      : campaignAudience === "ALL_COMMERCIALS"
      ? audienceCounts?.commercials ?? 0
      : campaignAudience === "INTERNAL_TEAM"
      ? audienceCounts?.internalTeam ?? 0
      : selectedUserIds.size;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* ──────────────── PAGE HEADER ──────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0 mt-0.5">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Broadcasts & Notifications
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Hub Central
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Personnalisez sans code vos notifications automatiques (RDV, Sécurité), lancez des
              campagnes d&apos;annonces vers vos clients et commerciaux, et suivez la délivrabilité.
            </p>
          </div>
        </div>

        <Link
          href="/manager/broadcasts/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau Broadcast
        </Link>
      </div>

      {/* ──────────────── TAB NAVIGATION ──────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto">
        {[
          {
            id: "automated" as const,
            label: "Notifications Automatiques",
            icon: Zap,
            badge: broadcasts.length,
          },
          {
            id: "campaign" as const,
            label: "Campagnes & Annonces Manuelles",
            icon: Send,
          },
          {
            id: "templates" as const,
            label: "Modèles Prédéfinis",
            icon: Sparkles,
          },
          {
            id: "history" as const,
            label: "Historique & Délivrabilité",
            icon: Clock,
            badge: historyTotal || undefined,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ──────────────── TAB 1: AUTOMATED BROADCASTS ──────────────── */}
      {activeTab === "automated" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Règles de diffusion déclenchées sur événement
              </h2>
              <p className="text-xs text-slate-500">
                Ces messages sont générés et expédiés automatiquement dès qu&apos;une action
                spécifique survient dans la plateforme.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={broadcastSearch}
                onChange={(e) => setBroadcastSearch(e.target.value)}
                placeholder="Rechercher une notification…"
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            </div>
          </div>

          {loadingBroadcasts ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 rounded-full text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBroadcasts.map((b) => {
                const variables =
                  BROADCAST_VARIABLES_REGISTRY[b.key] || BROADCAST_VARIABLES_REGISTRY.general || [];

                return (
                  <div
                    key={b.key}
                    className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {b.category === "RDV" && <Calendar className="w-3 h-3 text-indigo-600" />}
                          {b.category === "SECURITY" && <Shield className="w-3 h-3 text-amber-600" />}
                          {b.category === "ANNOUNCEMENT" && <Megaphone className="w-3 h-3 text-emerald-600" />}
                          {b.category}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {b.isCustomized ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Sparkles className="w-3 h-3" />
                              Personnalisé
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              Modèle par défaut
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Desc */}
                      <h3 className="text-base font-bold text-slate-900 mb-1">{b.name}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed mb-3">
                        {b.description}
                      </p>

                      {/* Trigger Event & Channels */}
                      <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="font-semibold text-slate-700">Déclencheur :</span>
                          <span className="text-slate-600">{b.triggerEventLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="font-semibold text-slate-700">Canal :</span>
                          <span className="text-slate-600">Email transactionnel (SMTP sécurisé)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="font-semibold text-slate-700">Variables :</span>
                          <span className="text-slate-500">{variables.length} variables disponibles</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(b)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Modifier sans code
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTargetBroadcastKey(b.key);
                          setEditSubject(b.subject);
                          setEditBlocks(b.blocks);
                          setEditRawHtml(b.bodyHtml);
                          setPreviewModalOpen(true);
                        }}
                        className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        title="Aperçu du rendu final"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTargetBroadcastKey(b.key);
                          setEditSubject(b.subject);
                          setEditBlocks(b.blocks);
                          setEditRawHtml(b.bodyHtml);
                          setTestModalOpen(true);
                        }}
                        className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        title="Envoyer un test sur mon email"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>

                      {b.isCustomized && (
                        <button
                          type="button"
                          onClick={() => handleResetBroadcast(b.key)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Restaurer le modèle d'origine"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── TAB 2: CAMPAIGN COMPOSER ──────────────── */}
      {activeTab === "campaign" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Lancer une annonce générale (Campagne email)
            </h2>
            <p className="text-xs text-slate-500">
              Diffusez une communication officielle à vos clients, commerciaux ou l&apos;équipe
              interne. Conçu pour être rédigé sans aucune notion de code.
            </p>
          </div>

          {campaignResult && (
            <div
              className={`p-4 rounded-2xl border text-sm flex items-start gap-3 ${
                campaignResult.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {campaignResult.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{campaignResult.message}</span>
            </div>
          )}

          {/* Audience Selector */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              1. Choix de l&apos;audience cible
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AUDIENCE_OPTIONS.map((opt) => {
                const isSelected = campaignAudience === opt.value;
                const count =
                  opt.value === "ALL_CLIENTS"
                    ? audienceCounts?.clients
                    : opt.value === "ALL_COMMERCIALS"
                    ? audienceCounts?.commercials
                    : opt.value === "INTERNAL_TEAM"
                    ? audienceCounts?.internalTeam
                    : selectedUserIds.size;

                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/50 shadow-xs"
                        : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="audience"
                      value={opt.value}
                      checked={isSelected}
                      onChange={() => setCampaignAudience(opt.value)}
                      className="accent-indigo-600 w-4 h-4 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                        {count !== undefined && opt.value !== "SELECTION" && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {count} destinataire{count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{opt.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Manual Selection Picker */}
            {campaignAudience === "SELECTION" && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Rechercher par nom ou email…"
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full">
                    {selectedUserIds.size} sélectionné{selectedUserIds.size > 1 ? "s" : ""}
                  </span>
                </div>

                {loadingUsers ? (
                  <div className="text-center py-8 text-xs text-slate-500">Chargement…</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200/80 bg-white rounded-lg border border-slate-200">
                    {filteredUsers.map((u) => {
                      const isChecked = selectedUserIds.has(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => {
                            setSelectedUserIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.id)) next.delete(u.id);
                              else next.add(u.id);
                              return next;
                            });
                          }}
                          className="flex items-center gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isChecked
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-300"
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 truncate text-xs">
                            <span className="font-semibold text-slate-800">{u.name}</span>
                            <span className="text-slate-400 ml-2">({u.email})</span>
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            {u.role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Visual Message Composer */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              2. Rédaction du message (Sans Code)
            </span>

            <VisualEmailEditor
              subject={campaignSubject}
              onSubjectChange={setCampaignSubject}
              blocks={campaignBlocks}
              onBlocksChange={setCampaignBlocks}
              rawHtml={campaignRawHtml}
              onRawHtmlChange={setCampaignRawHtml}
              variables={BROADCAST_VARIABLES_REGISTRY.general}
            />

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetBroadcastKey("general");
                    setPreviewModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Aperçu en direct
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetBroadcastKey("general");
                    setTestModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  M&apos;envoyer un test
                </button>
              </div>

              <button
                type="button"
                disabled={
                  sendingCampaign ||
                  !campaignSubject.trim() ||
                  targetCampaignRecipientCount === 0
                }
                onClick={handleSendCampaign}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-600/20 transition-all"
              >
                {sendingCampaign ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Envoyer à {targetCampaignRecipientCount} destinataire{targetCampaignRecipientCount > 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 3: TEMPLATES GALLERY ──────────────── */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Bibliothèque de gabarits prêts à l&apos;emploi
            </h2>
            <p className="text-xs text-slate-500">
              Choisissez un design optimisé pour vos emails importants. Vous pourrez ensuite le
              modifier librement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                title: "Annonce & Nouveauté",
                desc: "Parfait pour annoncer une mise à jour, de nouvelles fonctionnalités ou des vœux.",
                badge: "Marketing",
                blocksCount: 5,
                accent: "#4f46e5",
              },
              {
                title: "Alerte & Sécurité",
                desc: "Pour notifier d'une maintenance technique, d'un changement de mot de passe ou d'un incident.",
                badge: "Technique",
                blocksCount: 4,
                accent: "#0f172a",
              },
              {
                title: "Compte-Rendu & RDV",
                desc: "Gabarit avec tableau de données clés pour les récapitulatifs d'échanges et rendez-vous.",
                badge: "Opérationnel",
                blocksCount: 6,
                accent: "#10b981",
              },
            ].map((tmpl, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 mb-2 inline-block">
                    {tmpl.badge}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">{tmpl.title}</h3>
                  <p className="text-xs text-slate-500 mb-4">{tmpl.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("campaign");
                    setCampaignSubject(`[Annonce] ${tmpl.title}`);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Utiliser ce modèle
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────── TAB 4: HISTORY ──────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Historique des diffusions envoyées
              </h2>
              <p className="text-xs text-slate-500">
                Consultez le statut de livraison et les statistiques d&apos;ouverture.
              </p>
            </div>
            <button
              onClick={loadHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualiser
            </button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 rounded-full text-indigo-500 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-xs text-slate-400">
              Aucune campagne enregistrée pour l&apos;instant.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{item.subject}</h4>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span>
                          {item.sentAt
                            ? new Date(item.sentAt).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "En cours"}
                        </span>
                        <span>·</span>
                        <span>{item.sentCount} / {item.recipientCount} envoyés</span>
                        <span>·</span>
                        <span className="text-emerald-600 font-semibold">
                          {item.recipients.filter((r) => r.openedAt).length} ouverts
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      item.status === "SENT"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {item.status === "SENT" ? "Envoyé" : item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── EDIT MODAL DRAWER ──────────────── */}
      {editingBroadcast && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Modifier : {editingBroadcast.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Éditeur sans code pour non-techniciens
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetBroadcastKey(editingBroadcast.key);
                    setPreviewModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Aperçu
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetBroadcastKey(editingBroadcast.key);
                    setTestModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100"
                >
                  <Send className="w-3.5 h-3.5" />
                  Tester
                </button>

                <button
                  onClick={() => setEditingBroadcast(null)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {editSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{editSuccessMsg}</span>
                </div>
              )}

              <VisualEmailEditor
                subject={editSubject}
                onSubjectChange={setEditSubject}
                blocks={editBlocks}
                onBlocksChange={setEditBlocks}
                rawHtml={editRawHtml}
                onRawHtmlChange={setEditRawHtml}
                variables={
                  BROADCAST_VARIABLES_REGISTRY[editingBroadcast.key] ||
                  BROADCAST_VARIABLES_REGISTRY.general ||
                  []
                }
              />
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setEditingBroadcast(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Fermer
              </button>

              <button
                type="button"
                disabled={savingEdit || !editSubject.trim()}
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Enregistrer les modifications
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── LIVE PREVIEW MODAL ──────────────── */}
      <LivePreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        broadcastKey={targetBroadcastKey}
        subject={editingBroadcast ? editSubject : campaignSubject}
        blocks={editingBroadcast ? editBlocks : campaignBlocks}
        rawHtml={editingBroadcast ? editRawHtml : campaignRawHtml}
      />

      {/* ──────────────── SEND TEST EMAIL MODAL ──────────────── */}
      <SendTestEmailModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        broadcastKey={targetBroadcastKey}
        subject={editingBroadcast ? editSubject : campaignSubject}
        blocks={editingBroadcast ? editBlocks : campaignBlocks}
        rawHtml={editingBroadcast ? editRawHtml : campaignRawHtml}
      />
    </div>
  );
}
