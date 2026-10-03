"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Eye,
  Code2,
  Users,
  UserCheck,
  MousePointer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  ChevronRight,
  History,
  Megaphone,
  Mail,
  RefreshCw,
  X,
  Check,
  Building2,
} from "lucide-react";

// ============================================
// TYPES
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

// ============================================
// HELPERS
// ============================================

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
    value: "SELECTION",
    label: "Sélection manuelle",
    description: "Choisissez précisément les destinataires",
    icon: MousePointer,
  },
  {
    value: "INTERNAL_TEAM",
    label: "Équipe interne",
    description: "Managers, SDR, Booker, Dev et Business Developer",
    icon: Building2,
  },
];

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  ALL_CLIENTS: "Tous les clients",
  ALL_COMMERCIALS: "Tous les commerciaux",
  INTERNAL_TEAM: "Équipe interne",
  SELECTION: "Sélection manuelle",
};

const STATUS_CONFIG: Record<
  BroadcastRecord["status"],
  { label: string; color: string; bg: string; border: string }
> = {
  SENDING: {
    label: "En cours…",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  SENT: {
    label: "Envoyé",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  PARTIAL: {
    label: "Partiel",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  FAILED: {
    label: "Échec",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// CONFIRM DIALOG
// ============================================

function ConfirmSendDialog({
  open,
  audienceLabel,
  recipientCount,
  subject,
  onConfirm,
  onCancel,
  sending,
}: {
  open: boolean;
  audienceLabel: string;
  recipientCount: number;
  subject: string;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center">
              <Send className="w-4 h-4 text-primary-600" />
            </div>
            <span className="font-semibold text-slate-800">Confirmer l&apos;envoi</span>
          </div>
          <button
            onClick={onCancel}
            disabled={sending}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Vous êtes sur le point d&apos;envoyer cet email à{" "}
            <span className="font-semibold text-slate-900">
              {recipientCount} destinataire{recipientCount > 1 ? "s" : ""}
            </span>{" "}
            ({audienceLabel}).
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold block mb-1">
              Objet
            </span>
            <span className="text-slate-700 font-medium">{subject || "—"}</span>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-start gap-2">
            <span className="mt-0.5 shrink-0">⚠️</span>
            Cette action est irréversible. L&apos;email sera envoyé immédiatement.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onCancel}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-60 transition-colors"
          >
            {sending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Envoyer maintenant
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// HISTORY CARD
// ============================================

function HistoryCard({ item }: { item: BroadcastRecord }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[item.status];
  const openedCount = item.recipients.filter((r) => Boolean(r.openedAt)).length;
  const deliveredCount = item.recipients.filter((r) => r.wasSent).length;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 mt-0.5">
          <Mail className="w-4 h-4 text-primary-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 truncate text-sm">
              {item.subject}
            </span>
            <span
              className={`shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.color} ${status.border}`}
            >
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {AUDIENCE_LABELS[item.audienceType]}
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {item.sentCount}/{item.recipientCount} envoyés
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3 text-primary-500" />
              {openedCount}/{deliveredCount || item.sentCount} ouverts
            </span>
            {item.failedCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 text-red-500">
                  <AlertCircle className="w-3 h-3" />
                  {item.failedCount} échec{item.failedCount > 1 ? "s" : ""}
                </span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.sentAt ? formatDate(item.sentAt) : formatDate(item.createdAt)}
            </span>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-600">Envoyé par :</span>
            {item.sentBy.name} ({item.sentBy.email})
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-emerald-700 font-semibold">{item.sentCount}</p>
              <p className="text-emerald-600">Envoyés</p>
            </div>
            <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
              <p className="text-primary-700 font-semibold">{openedCount}</p>
              <p className="text-primary-600">Ouverts</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-red-700 font-semibold">{item.failedCount}</p>
              <p className="text-red-600">Échecs</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              Détail compact par destinataire
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
              {item.recipients.map((recipient) => (
                <div key={recipient.id} className="px-3 py-2 text-xs flex items-center gap-2">
                  <span className="font-medium text-slate-700 truncate max-w-[180px]">
                    {recipient.name || recipient.email}
                  </span>
                  <span className="text-slate-400 truncate">{recipient.email}</span>
                  <span className="ml-auto flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        recipient.wasSent
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {recipient.wasSent ? "Envoyé" : "Échec"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        recipient.openedAt
                          ? "border-primary-200 bg-primary-50 text-primary-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {recipient.openedAt
                        ? `Ouvert${recipient.openCount > 1 ? ` x${recipient.openCount}` : ""}`
                        : "Non ouvert"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">
              Aperçu du contenu
            </span>
            <iframe
              srcDoc={item.bodyHtml}
              title="Aperçu"
              className="w-full rounded-xl border border-slate-200"
              sandbox="allow-same-origin"
              style={{ minHeight: 240, background: "#f8fafc" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// PAGE
// ============================================

export default function BroadcastEmailPage() {
  const [tab, setTab] = useState<"compose" | "history">("compose");

  // ── Composer state ────────────────────────────────────────────────────────
  const [audienceType, setAudienceType] = useState<AudienceType>("ALL_CLIENTS");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [editorTab, setEditorTab] = useState<"editor" | "preview">("editor");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Selection mode
  const [allUsers, setAllUsers] = useState<SelectableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");

  // Recipient preview count
  const [audienceCounts, setAudienceCounts] = useState<{
    clients: number;
    commercials: number;
    internalTeam: number;
  } | null>(null);

  // Send state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // ── History state ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

  // ── Load audience counts ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/manager/broadcast-emails/audience-counts")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAudienceCounts(j.data);
      })
      .catch(() => {});
  }, []);

  // ── Load users for selection ──────────────────────────────────────────────
  useEffect(() => {
    if (audienceType !== "SELECTION") return;
    if (allUsers.length > 0) return;
    setLoadingUsers(true);
    fetch("/api/manager/broadcast-emails/selectable-users")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setAllUsers(j.data);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [audienceType, allUsers.length]);

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(
    (page: number) => {
      setHistoryLoading(true);
      fetch(`/api/manager/broadcast-emails?page=${page}&limit=10`)
        .then((r) => r.json())
        .then((j) => {
          if (j.success) {
            setHistory(j.data.items);
            setHistoryTotal(j.data.total);
            setHistoryPage(page);
          }
        })
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    },
    []
  );

  useEffect(() => {
    if (tab === "history") loadHistory(1);
  }, [tab, loadHistory]);

  // ── Derived recipient count ───────────────────────────────────────────────
  const recipientCount =
    audienceType === "ALL_CLIENTS"
      ? audienceCounts?.clients ?? 0
      : audienceType === "ALL_COMMERCIALS"
      ? audienceCounts?.commercials ?? 0
      : audienceType === "INTERNAL_TEAM"
      ? audienceCounts?.internalTeam ?? 0
      : selectedIds.size;

  // ── Filtered users for selection ──────────────────────────────────────────
  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  // ── Send handler ──────────────────────────────────────────────────────────
  async function handleSend() {
    setSending(true);
    setSendResult(null);
    try {
      const body: Record<string, unknown> = {
        subject,
        bodyHtml,
        audienceType,
      };
      if (audienceType === "SELECTION") {
        body.recipientIds = Array.from(selectedIds);
      }
      const res = await fetch("/api/manager/broadcast-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setSendResult({
          ok: true,
          message: `Campagne envoyée à ${json.data.sentCount} destinataire${
            json.data.sentCount > 1 ? "s" : ""
          }${
            json.data.failedCount > 0
              ? ` (${json.data.failedCount} échec${json.data.failedCount > 1 ? "s" : ""})`
              : ""
          }.`,
        });
        setConfirmOpen(false);
        // Reset form
        setSubject("");
        setBodyHtml("");
        setSelectedIds(new Set());
      } else {
        setSendResult({ ok: false, message: json.error || "Erreur lors de l'envoi" });
        setConfirmOpen(false);
      }
    } catch {
      setSendResult({ ok: false, message: "Erreur de connexion" });
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    bodyHtml.trim().length > 0 &&
    recipientCount > 0;

  return (
    <>
      <style>{`
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tab-active { background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.10); color: #1e293b; }
        .tab-inactive { color: #64748b; }
        .tab-inactive:hover { color: #1e293b; }
        textarea.code { caret-color: #818cf8; }
        textarea.code::selection { background: rgba(99,102,241,0.25); }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {/* Back link */}
        <Link
          href="/manager/settings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux paramètres
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center shrink-0">
            <Megaphone className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Campagne email plateforme
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed">
              Rédigez et envoyez un email HTML à vos clients, commerciaux ou une sélection
              manuelle. Consultez l&apos;historique des campagnes envoyées.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { id: "compose" as const, icon: Send, label: "Composer" },
            { id: "history" as const, icon: History, label: "Historique" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                tab === t.id ? "tab-active" : "tab-inactive"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === "history" && historyTotal > 0 && (
                <span className="ml-0.5 text-[10px] font-bold bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full">
                  {historyTotal}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ──────────────────────────────────────────── COMPOSE TAB */}
        {tab === "compose" && (
          <div className="space-y-6">
            {/* Send result banner */}
            {sendResult && (
              <div
                className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-sm font-medium ${
                  sendResult.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
                style={{ animation: "slideUp 0.3s ease" }}
              >
                {sendResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                {sendResult.message}
              </div>
            )}

            {/* Audience */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-primary-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Audience</span>
              </div>
              <div className="p-6 space-y-3">
                {AUDIENCE_OPTIONS.map((opt) => {
                  const count =
                    opt.value === "ALL_CLIENTS"
                      ? audienceCounts?.clients
                      : opt.value === "ALL_COMMERCIALS"
                      ? audienceCounts?.commercials
                      : opt.value === "INTERNAL_TEAM"
                      ? audienceCounts?.internalTeam
                      : selectedIds.size;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        audienceType === opt.value
                          ? "border-primary-300 bg-primary-50/60 shadow-sm"
                          : "border-slate-200 hover:border-primary-200 hover:bg-slate-50/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="audienceType"
                        value={opt.value}
                        checked={audienceType === opt.value}
                        onChange={() => {
                          setAudienceType(opt.value);
                          setSendResult(null);
                        }}
                        className="accent-primary-600 w-4 h-4 shrink-0"
                      />
                      <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                        <opt.icon className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {opt.label}
                          </span>
                          {count !== undefined && opt.value !== "SELECTION" && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {count} destinataire{count > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                    </label>
                  );
                })}

                {/* Selection picker */}
                {audienceType === "SELECTION" && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
                      <Search className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Rechercher par nom ou email…"
                        className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-slate-400"
                      />
                      {selectedIds.size > 0 && (
                        <span className="text-xs font-semibold bg-primary-100 text-primary-700 px-2.5 py-1 rounded-full">
                          {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {loadingUsers ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-6 h-6 rounded-full border-2 border-primary-200 border-t-primary-500 animate-spin" />
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {filteredUsers.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-8">
                            Aucun utilisateur trouvé
                          </p>
                        ) : (
                          filteredUsers.map((u) => {
                            const selected = selectedIds.has(u.id);
                            return (
                              <button
                                key={u.id}
                                onClick={() => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(u.id)) next.delete(u.id);
                                    else next.add(u.id);
                                    return next;
                                  });
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                  selected ? "bg-primary-50" : "hover:bg-white"
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                    selected
                                      ? "bg-primary-600 border-primary-600"
                                      : "border-slate-300"
                                  }`}
                                >
                                  {selected && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-slate-800 block truncate">
                                    {u.name}
                                  </span>
                                  <span className="text-xs text-slate-400 block truncate">
                                    {u.email}
                                  </span>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase shrink-0">
                                  {u.role === "CLIENT"
                                    ? "Client"
                                    : u.role === "COMMERCIAL"
                                    ? "Commercial"
                                    : "Interne"}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Subject */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-primary-600" />
                </div>
                <span className="text-sm font-semibold text-slate-700">Objet de l&apos;email</span>
              </div>
              <div className="p-6">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setSendResult(null);
                  }}
                  placeholder="Ex: Mise à jour importante de votre espace…"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-slate-50 text-slate-800 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>

            {/* HTML Editor */}
            <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  {[
                    { id: "editor" as const, icon: Code2, label: "Éditeur HTML" },
                    { id: "preview" as const, icon: Eye, label: "Aperçu" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setEditorTab(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                        editorTab === t.id ? "tab-active" : "tab-inactive"
                      }`}
                    >
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400">
                  Collez ou écrivez du HTML valide
                </span>
              </div>

              {editorTab === "editor" ? (
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-12 bg-slate-900 text-slate-600 text-xs font-mono leading-[1.6rem] pt-3 pl-3 select-none overflow-hidden pointer-events-none"
                    style={{ fontSize: "11px" }}
                  >
                    {(bodyHtml || " ").split("\n").map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={bodyHtml}
                    onChange={(e) => {
                      setBodyHtml(e.target.value);
                      setSendResult(null);
                    }}
                    rows={22}
                    spellCheck={false}
                    placeholder="<!DOCTYPE html><html>…"
                    className="code w-full pl-14 pr-4 py-3 text-[12.5px] font-mono text-slate-200 bg-slate-900 focus:outline-none resize-none leading-[1.6rem] placeholder:text-slate-600"
                    style={{ minHeight: 380, letterSpacing: "0.01em" }}
                  />
                </div>
              ) : (
                <div className="flex flex-col" style={{ minHeight: 380 }}>
                  {subject && (
                    <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Objet :</span>
                      <span className="font-medium text-slate-700 italic truncate">
                        {subject}
                      </span>
                    </div>
                  )}
                  {bodyHtml ? (
                    <iframe
                      srcDoc={bodyHtml}
                      title="Aperçu email"
                      className="flex-1 w-full border-0"
                      sandbox="allow-same-origin"
                      style={{ minHeight: 380, background: "#f1f5f9" }}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                      Rédigez du HTML dans l&apos;éditeur pour voir l&apos;aperçu
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between gap-4 pb-6">
              <div className="text-sm text-slate-500">
                {recipientCount > 0 ? (
                  <span>
                    <span className="font-semibold text-slate-800">{recipientCount}</span>{" "}
                    destinataire{recipientCount > 1 ? "s" : ""} sélectionné
                    {recipientCount > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-slate-400">Aucun destinataire</span>
                )}
              </div>
              <button
                disabled={!canSend || sending}
                onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all duration-200 disabled:opacity-50"
                style={{
                  background:
                    canSend && !sending
                      ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                      : "#94a3b8",
                  boxShadow:
                    canSend && !sending ? "0 4px 14px rgba(99,102,241,0.4)" : "none",
                }}
              >
                <Send className="w-4 h-4" />
                Envoyer la campagne
              </button>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────── HISTORY TAB */}
        {tab === "history" && (
          <div className="space-y-4">
            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 rounded-full border-2 border-primary-100 border-t-primary-500 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <History className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium">Aucune campagne envoyée pour l&apos;instant</p>
              </div>
            ) : (
              <>
                {history.map((item) => (
                  <HistoryCard key={item.id} item={item} />
                ))}

                {/* Pagination */}
                {historyTotal > 10 && (
                  <div className="flex items-center justify-center gap-3 pt-4">
                    <button
                      disabled={historyPage <= 1}
                      onClick={() => loadHistory(historyPage - 1)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:border-primary-200 disabled:opacity-40 transition-colors"
                    >
                      Précédent
                    </button>
                    <span className="text-sm text-slate-500">
                      Page {historyPage} / {Math.ceil(historyTotal / 10)}
                    </span>
                    <button
                      disabled={historyPage >= Math.ceil(historyTotal / 10)}
                      onClick={() => loadHistory(historyPage + 1)}
                      className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:border-primary-200 disabled:opacity-40 transition-colors"
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmSendDialog
        open={confirmOpen}
        audienceLabel={AUDIENCE_LABELS[audienceType]}
        recipientCount={recipientCount}
        subject={subject}
        onConfirm={handleSend}
        onCancel={() => setConfirmOpen(false)}
        sending={sending}
      />
    </>
  );
}
