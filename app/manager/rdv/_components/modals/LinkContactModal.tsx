"use client";

import { useState, useCallback, useRef } from "react";
import type { Meeting, LinkContactResult } from "../../_types";
import { Avatar } from "../shared/Avatar";
import { Search, Building2, UserPlus, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

interface LinkContactModalProps {
  meeting: Meeting;
  onClose: () => void;
  onLinked: (contact: LinkContactResult) => void;
}

// ─── grouped structure ────────────────────────────────────────────────────────
interface ContactGroup {
  companyId: string | null;
  companyName: string;
  contacts: LinkContactResult[];
}

function groupByCompany(results: LinkContactResult[]): ContactGroup[] {
  return results.reduce<ContactGroup[]>((acc, c) => {
    const key = c.company?.id ?? "__none__";
    const label = c.company?.name ?? "Sans entreprise";
    const existing = acc.find((g) => (g.companyId ?? "__none__") === key);
    if (existing) {
      existing.contacts.push(c);
    } else {
      acc.push({ companyId: c.company?.id ?? null, companyName: label, contacts: [c] });
    }
    return acc;
  }, []);
}

function contactDisplayName(c: LinkContactResult): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Sans nom";
}

// ─── contact row ─────────────────────────────────────────────────────────────
function ContactRow({
  contact,
  saving,
  linkingId,
  onLink,
}: {
  contact: LinkContactResult;
  saving: boolean;
  linkingId: string | null;
  onLink: (c: LinkContactResult) => void;
}) {
  const name = contactDisplayName(contact);
  const isLinking = linkingId === contact.id;
  const isDisabled = saving;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onLink(contact)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-100",
        "border-b border-slate-100 last:border-b-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400",
        isDisabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-primary-50 cursor-pointer group"
      )}
    >
      <Avatar name={name} size={34} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
        {contact.title && (
          <p className="text-xs text-slate-500 truncate">{contact.title}</p>
        )}
        {contact.email && (
          <p className="text-xs text-slate-400 truncate">{contact.email}</p>
        )}
        {!contact.email && contact.phone && (
          <p className="text-xs text-slate-400 truncate">{contact.phone}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isLinking ? (
          <Loader2 className="w-4 h-4 text-primary-500 animate-spin" aria-hidden />
        ) : (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors duration-100",
              "text-primary-600 bg-primary-50 group-hover:bg-primary-100"
            )}
          >
            Lier
            <ArrowRight className="w-3 h-3" aria-hidden />
          </span>
        )}
      </div>
    </button>
  );
}

// ─── company group card ───────────────────────────────────────────────────────
function CompanyGroup({
  group,
  saving,
  linkingId,
  onLink,
}: {
  group: ContactGroup;
  saving: boolean;
  linkingId: string | null;
  onLink: (c: LinkContactResult) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
        <span className="text-xs font-bold text-slate-700 truncate flex-1">
          {group.companyName}
        </span>
        <span className="text-[11px] text-slate-400 font-medium shrink-0">
          {group.contacts.length} contact{group.contacts.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Contact rows */}
      <div className="divide-y divide-slate-100">
        {group.contacts.map((c) => (
          <ContactRow
            key={c.id}
            contact={c}
            saving={saving}
            linkingId={linkingId}
            onLink={onLink}
          />
        ))}
      </div>
    </div>
  );
}

// ─── main modal ───────────────────────────────────────────────────────────────
export function LinkContactModal({ meeting, onClose, onLinked }: LinkContactModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkContactResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [createError, setCreateError] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(meeting.company?.id ?? "");
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    phone: "",
  });

  // Debounce search with a ref to cancel in-flight requests
  const searchAbortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setLinkError("");
    setCreateError("");

    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Cancel previous request
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    try {
      const res = await fetch(
        `/api/contacts?search=${encodeURIComponent(q.trim())}&limit=20`,
        { signal: controller.signal }
      );
      const json = await res.json().catch(() => null);
      setResults(json?.data?.items ?? json?.data ?? []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleLink = useCallback(async (c: LinkContactResult) => {
    setLinkError("");
    setSaving(true);
    setLinkingId(c.id);
    try {
      const res = await fetch(`/api/manager/rdv/${meeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: c.id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        onLinked(c);
        onClose();
      } else {
        setLinkError(json?.error || "Impossible de lier ce contact pour le moment.");
      }
    } catch {
      setLinkError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSaving(false);
      setLinkingId(null);
    }
  }, [meeting.id, onLinked, onClose]);

  const groups = groupByCompany(results);

  const companyOptions = groups
    .filter((g) => !!g.companyId)
    .map((g) => ({ id: g.companyId as string, name: g.companyName }));

  const canCreate =
    !creating &&
    !!selectedCompanyId &&
    (!!newContact.firstName.trim() || !!newContact.lastName.trim()) &&
    (!!newContact.email.trim() || !!newContact.phone.trim());

  const handleCreateAndLink = async () => {
    if (!canCreate) return;
    setCreateError("");
    setCreating(true);
    try {
      const payload = {
        companyId: selectedCompanyId,
        firstName: newContact.firstName.trim() || undefined,
        lastName: newContact.lastName.trim() || undefined,
        title: newContact.title.trim() || undefined,
        email: newContact.email.trim() || undefined,
        phone: newContact.phone.trim() || undefined,
      };
      const createRes = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createJson = await createRes.json().catch(() => null);
      const created = createJson?.data as LinkContactResult | undefined;
      if (!createRes.ok || !createJson?.success || !created?.id) {
        setCreateError(createJson?.error || "Impossible de créer le contact pour le moment.");
        return;
      }

      await handleLink({
        id: created.id,
        firstName: created.firstName ?? payload.firstName ?? null,
        lastName: created.lastName ?? payload.lastName ?? null,
        email: created.email ?? payload.email ?? null,
        phone: created.phone ?? payload.phone ?? null,
        title: created.title ?? payload.title ?? null,
        company: created.company ?? companyOptions.find((c) => c.id === selectedCompanyId) ?? null,
      });
    } catch {
      setCreateError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setCreating(false);
    }
  };

  const hasSearched = query.trim().length >= 2;
  const isBusy = saving || creating;

  return (
    <Modal
      isOpen
      onClose={() => !isBusy && onClose()}
      title="Lier un contact au RDV"
      size="lg"
    >
      <div className="flex flex-col gap-5">

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div className="relative">
          {searching ? (
            <Loader2
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 animate-spin pointer-events-none"
              aria-hidden
            />
          ) : (
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden
            />
          )}
          <input
            className={cn(
              "w-full h-10 pl-10 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-xl",
              "text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all"
            )}
            placeholder="Rechercher par nom, email ou entreprise…"
            value={query}
            autoFocus
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Rechercher un contact"
          />
        </div>

        {/* ── Search results ──────────────────────────────────────────────── */}
        {hasSearched && !searching && (
          <>
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <Search className="w-7 h-7 text-slate-300" aria-hidden />
                <p className="text-sm font-semibold text-slate-600">Aucun contact trouvé</p>
                <p className="text-xs text-slate-400">Essayez un autre terme ou créez le contact ci-dessous.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <CompanyGroup
                    key={g.companyId ?? "__none__"}
                    group={g}
                    saving={saving}
                    linkingId={linkingId}
                    onLink={handleLink}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Link error ─────────────────────────────────────────────────── */}
        {linkError && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-red-700 font-medium">{linkError}</p>
          </div>
        )}

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 shrink-0">
            <UserPlus className="w-3.5 h-3.5" aria-hidden />
            Créer un nouveau contact
          </span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* ── Create contact form ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            Renseignez au moins un nom (prénom / nom) et un canal (email ou téléphone).
          </p>

          {/* Company selector */}
          <select
            className={cn(
              "w-full h-9 px-3 text-sm font-medium bg-white border border-slate-200 rounded-xl",
              "text-slate-700 focus:outline-none focus:border-primary-400 transition-colors cursor-pointer"
            )}
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            disabled={isBusy}
          >
            <option value="">Choisir une société…</option>
            {meeting.company?.id && (
              <option value={meeting.company.id}>{meeting.company.name}</option>
            )}
            {companyOptions
              .filter((c) => c.id !== meeting.company?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-2">
            <input
              className={cn(
                "h-9 px-3 text-sm bg-white border border-slate-200 rounded-xl",
                "text-slate-900 placeholder:text-slate-400",
                "focus:outline-none focus:border-primary-400 transition-colors"
              )}
              placeholder="Prénom"
              value={newContact.firstName}
              onChange={(e) => setNewContact((prev) => ({ ...prev, firstName: e.target.value }))}
              disabled={isBusy}
            />
            <input
              className={cn(
                "h-9 px-3 text-sm bg-white border border-slate-200 rounded-xl",
                "text-slate-900 placeholder:text-slate-400",
                "focus:outline-none focus:border-primary-400 transition-colors"
              )}
              placeholder="Nom"
              value={newContact.lastName}
              onChange={(e) => setNewContact((prev) => ({ ...prev, lastName: e.target.value }))}
              disabled={isBusy}
            />
          </div>

          {/* Title */}
          <input
            className={cn(
              "h-9 px-3 text-sm bg-white border border-slate-200 rounded-xl",
              "text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:border-primary-400 transition-colors"
            )}
            placeholder="Fonction (optionnel)"
            value={newContact.title}
            onChange={(e) => setNewContact((prev) => ({ ...prev, title: e.target.value }))}
            disabled={isBusy}
          />

          {/* Email + phone row */}
          <div className="grid grid-cols-2 gap-2">
            <input
              className={cn(
                "h-9 px-3 text-sm bg-white border border-slate-200 rounded-xl",
                "text-slate-900 placeholder:text-slate-400",
                "focus:outline-none focus:border-primary-400 transition-colors"
              )}
              placeholder="Email"
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
              disabled={isBusy}
            />
            <input
              className={cn(
                "h-9 px-3 text-sm bg-white border border-slate-200 rounded-xl",
                "text-slate-900 placeholder:text-slate-400",
                "focus:outline-none focus:border-primary-400 transition-colors"
              )}
              placeholder="Téléphone"
              value={newContact.phone}
              onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
              disabled={isBusy}
            />
          </div>

          {createError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden />
              <p className="text-xs text-red-700 font-medium">{createError}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateAndLink}
              disabled={!canCreate || isBusy}
              className={cn(
                "flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold transition-colors",
                "bg-primary-600 text-white hover:bg-primary-700",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
              {creating ? "Création…" : "Créer et lier"}
            </button>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className={cn(
              "h-9 px-4 rounded-xl text-sm font-semibold text-slate-600",
              "hover:bg-slate-100 hover:text-slate-900 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            Annuler
          </button>
        </ModalFooter>

      </div>
    </Modal>
  );
}
