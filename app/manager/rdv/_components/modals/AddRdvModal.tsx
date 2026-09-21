"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Calendar } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { DateTimePicker } from "@/components/ui";
import { BookingDrawer } from "@/components/sdr/BookingDrawer";

interface Mission {
  id: string;
  name: string;
  channel: string;
  campaigns: { id: string; name: string; isActive: boolean }[];
  lists: { id: string; name: string }[];
}

interface Company {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  contacts: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone?: string | null;
    title?: string | null;
    linkedin?: string | null;
  }[];
}

interface AddRdvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddRdvModal({ isOpen, onClose, onSuccess }: AddRdvModalProps) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [missionId, setMissionId] = useState("");
  const [listId, setListId] = useState("");
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [companyId, setCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [contactId, setContactId] = useState("");
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [meetingType, setMeetingType] = useState<"VISIO" | "PHYSIQUE" | "TELEPHONIQUE">("VISIO");
  const [meetingCategory, setMeetingCategory] = useState<"EXPLORATOIRE" | "BESOIN" | "">("");
  const [note, setNote] = useState("");
  const [meetingAddress, setMeetingAddress] = useState("");
  const [meetingJoinUrl, setMeetingJoinUrl] = useState("");
  const [meetingPhone, setMeetingPhone] = useState("");
  const [duration, setDuration] = useState(30);
  const [quickListName, setQuickListName] = useState("");

  const [clientBookingUrl, setClientBookingUrl] = useState<string>("");
  const [clientInterlocuteurs, setClientInterlocuteurs] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
    emails: Array<{ value: string; label: string; isPrimary: boolean }>;
    phones: Array<{ value: string; label: string; isPrimary: boolean }>;
    bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
    isActive: boolean;
  }>>([]);
  /** Commercial the RDV is for. Empty string = no choice made, every calendar stays listed. */
  const [selectedInterlocuteurId, setSelectedInterlocuteurId] = useState<string>("");
  const [showBookingDrawer, setShowBookingDrawer] = useState(false);

  const fetchMissions = useCallback(async () => {
    const res = await fetch("/api/missions?limit=200");
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      setMissions(json.data as Mission[]);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMissions();
    } else {
      setMissionId("");
      setListId("");
      setCompanyMode("existing");
      setCompanyId("");
      setNewCompanyName("");
      setContactMode("existing");
      setContactId("");
      setNewContactFirstName("");
      setNewContactLastName("");
      setNewContactEmail("");
      setCallbackDate("");
      setMeetingType("VISIO");
      setMeetingCategory("");
      setNote("");
      setMeetingAddress("");
      setMeetingJoinUrl("");
      setMeetingPhone("");
      setDuration(30);
      setQuickListName("");
      setClientBookingUrl("");
      setClientInterlocuteurs([]);
      setSelectedInterlocuteurId("");
      setShowBookingDrawer(false);
      setError(null);
    }
  }, [isOpen, fetchMissions]);

  useEffect(() => {
    if (!missionId) {
      setLists([]);
      setListId("");
      setCompanyMode("existing");
      setCompanyId("");
      setNewCompanyName("");
      setContactMode("existing");
      setContactId("");
      setNewContactFirstName("");
      setNewContactLastName("");
      setNewContactEmail("");
      setCompanies([]);
      setClientBookingUrl("");
      setClientInterlocuteurs([]);
      return;
    }
    const mission = missions.find((m) => m.id === missionId);
    setLists(mission?.lists ?? []);
    setListId("");
    setCompanyId("");
    setNewCompanyName("");
    setContactId("");
    setCompanies([]);
  }, [missionId, missions]);

  useEffect(() => {
    // The commercial belongs to the previous mission's client — never carry it over.
    setSelectedInterlocuteurId("");
    if (!missionId) {
      setClientBookingUrl("");
      setClientInterlocuteurs([]);
      return;
    }
    fetch(`/api/missions/${missionId}/client-booking`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setClientBookingUrl(json.data.bookingUrl ?? "");
          setClientInterlocuteurs(
            Array.isArray(json.data.interlocuteurs) ? json.data.interlocuteurs : []
          );
        }
      })
      .catch(() => {
        setClientBookingUrl("");
        setClientInterlocuteurs([]);
      });
  }, [missionId]);

  useEffect(() => {
    if (!listId) {
      setCompanies([]);
      setCompanyId("");
      setContactId("");
      setNewCompanyName("");
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/lists/${listId}/companies`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const fetched = json.data as Company[];
          setCompanies(fetched);
          if (fetched.length === 0) {
            // No existing companies to pick: switch directly to new-company entry.
            setCompanyMode("new");
          }
        } else {
          setCompanies([]);
          setCompanyMode("new");
        }
      })
      .catch(() => {
        setCompanies([]);
        setCompanyMode("new");
      })
      .finally(() => setLoading(false));
    setCompanyId("");
    setContactId("");
  }, [listId]);

  useEffect(() => {
    setContactId("");
  }, [companyId]);

  const mission = missions.find((m) => m.id === missionId);
  const campaign = mission?.campaigns?.find((c) => c.isActive) ?? mission?.campaigns?.[0];
  const campaignId = campaign?.id;
  const channel = (mission?.channel as "CALL" | "EMAIL" | "LINKEDIN") ?? "CALL";

  const handleQuickCreateList = async () => {
    if (!missionId || !quickListName.trim()) return;
    setCreatingList(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          name: quickListName.trim(),
          type: "CLIENT",
          source: "SAS_RDV",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError((json as { error?: string }).error ?? "Erreur lors de la creation de la liste");
        return;
      }
      const created = (json as { data?: { id: string; name: string } }).data;
      if (!created) {
        setError("Erreur lors de la creation de la liste");
        return;
      }
      setLists((prev) => [...prev, { id: created.id, name: created.name }]);
      setListId(created.id);
      setQuickListName("");
    } finally {
      setCreatingList(false);
    }
  };

  const selectedCompany = companies.find((c) => c.id === companyId);
  const contacts = selectedCompany?.contacts ?? [];
  const selectedContact = contacts.find((c) => c.id === contactId);

  const effectiveCompanyId = companyMode === "new" ? null : companyId;
  const hasCompany =
    companyMode === "existing" && companyId ||
    (companyMode === "new" && newCompanyName.trim().length > 0);
  const hasContact =
    contactMode === "existing" && contactId ||
    (contactMode === "new" && (newContactFirstName.trim() || newContactLastName.trim() || newContactEmail.trim()));

  const canSubmit =
    missionId &&
    campaignId &&
    listId &&
    hasCompany &&
    hasContact &&
    callbackDate;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      let finalCompanyId: string;
      let finalContactId: string;

      if (companyMode === "new") {
        const createCompanyRes = await fetch(`/api/lists/${listId}/companies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCompanyName.trim() }),
        });
        const createCompanyJson = await createCompanyRes.json().catch(() => ({}));
        if (!createCompanyRes.ok) {
          setError((createCompanyJson as { error?: string }).error ?? "Erreur lors de la création de la société");
          return;
        }
        const newCompany = createCompanyJson.data as { id: string };
        finalCompanyId = newCompany.id;
      } else {
        finalCompanyId = selectedCompany!.id;
      }

      if (contactMode === "new") {
        const createContactRes = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: finalCompanyId,
            firstName: newContactFirstName.trim() || undefined,
            lastName: newContactLastName.trim() || undefined,
            email: newContactEmail.trim() || undefined,
          }),
        });
        const createContactJson = await createContactRes.json().catch(() => ({}));
        if (!createContactRes.ok) {
          setError((createContactJson as { error?: string }).error ?? "Erreur lors de la création du contact");
          return;
        }
        const newContact = createContactJson.data as { id: string };
        finalContactId = newContact.id;
      } else {
        finalContactId = contactId;
      }

      const body: Record<string, unknown> = {
        campaignId,
        channel,
        result: "MEETING_BOOKED",
        callbackDate: new Date(callbackDate).toISOString(),
        contactId: finalContactId,
        companyId: finalCompanyId,
        meetingType,
        duration: duration || undefined,
        note: note.trim() || undefined,
        meetingCategory: meetingCategory || undefined,
        meetingAddress: meetingType === "PHYSIQUE" ? meetingAddress.trim() || undefined : undefined,
        meetingJoinUrl: meetingType === "VISIO" ? meetingJoinUrl.trim() || undefined : undefined,
        meetingPhone: meetingType === "TELEPHONIQUE" ? meetingPhone.trim() || undefined : undefined,
      };

      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Erreur lors de la création du RDV");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const now = new Date();
  const defaultDatetime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  defaultDatetime.setMinutes(0, 0, 0);

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title="Ajouter un RDV"
      size="lg"
      closeOnOverlay={false}
      closeOnEscape={false}
    >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Mission *</label>
            <select
              className="rdv-input"
              style={{ width: "100%" }}
              value={missionId}
              onChange={(e) => setMissionId(e.target.value)}
            >
              <option value="">Sélectionner une mission</option>
              {missions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Liste *</label>
            <select
              className="rdv-input"
              style={{ width: "100%" }}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              disabled={!missionId}
            >
              <option value="">Sélectionner une liste</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {missionId && lists.length === 0 && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid var(--amber-300, #fcd34d)",
                  background: "var(--amber-50, #fffbeb)",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <p style={{ fontSize: 12, color: "var(--ink2)" }}>
                  Cette mission n&apos;a aucune liste. Creez-en une maintenant pour ajouter le RDV.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    className="rdv-input"
                    style={{ width: "100%" }}
                    placeholder="Nom de la nouvelle liste"
                    value={quickListName}
                    onChange={(e) => setQuickListName(e.target.value)}
                    disabled={creatingList}
                  />
                  <button
                    className="rdv-btn rdv-btn-primary"
                    type="button"
                    disabled={creatingList || !quickListName.trim()}
                    onClick={handleQuickCreateList}
                  >
                    {creatingList ? "Creation…" : "Creer"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Société *</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="radio"
                  name="companyMode"
                  checked={companyMode === "existing"}
                  onChange={() => { setCompanyMode("existing"); setNewCompanyName(""); }}
                  disabled={!listId || companies.length === 0}
                />
                Existante
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="radio"
                  name="companyMode"
                  checked={companyMode === "new"}
                  onChange={() => { setCompanyMode("new"); setCompanyId(""); setContactMode("new"); setContactId(""); setNewContactFirstName(""); setNewContactLastName(""); setNewContactEmail(""); }}
                />
                Nouvelle
              </label>
            </div>
            {companyMode === "existing" ? (
              <select
                className="rdv-input"
                style={{ width: "100%" }}
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={!listId || loading}
              >
                <option value="">Sélectionner une société</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="rdv-input"
                style={{ width: "100%" }}
                placeholder="Nom de la société"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                disabled={!missionId}
              />
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Contact *</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="radio"
                  name="contactMode"
                  checked={contactMode === "existing"}
                  onChange={() => { setContactMode("existing"); setNewContactFirstName(""); setNewContactLastName(""); setNewContactEmail(""); }}
                  disabled={companyMode === "new"}
                />
                Existant
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                <input
                  type="radio"
                  name="contactMode"
                  checked={contactMode === "new"}
                  onChange={() => { setContactMode("new"); setContactId(""); }}
                />
                Nouveau
              </label>
            </div>
            {contactMode === "existing" ? (
              <select
                className="rdv-input"
                style={{ width: "100%" }}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!effectiveCompanyId}
              >
                <option value="">Sélectionner un contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="text"
                  className="rdv-input"
                  style={{ width: "100%" }}
                  placeholder="Prénom"
                  value={newContactFirstName}
                  onChange={(e) => setNewContactFirstName(e.target.value)}
                />
                <input
                  type="text"
                  className="rdv-input"
                  style={{ width: "100%" }}
                  placeholder="Nom"
                  value={newContactLastName}
                  onChange={(e) => setNewContactLastName(e.target.value)}
                />
                <input
                  type="email"
                  className="rdv-input"
                  style={{ width: "100%" }}
                  placeholder="Email (optionnel)"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>
              Date et heure du RDV *
            </label>
            <DateTimePicker
              value={callbackDate}
              onChange={setCallbackDate}
              placeholder="Choisir date et heure du RDV…"
              allowPastDates
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Type de réunion *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["VISIO", "PHYSIQUE", "TELEPHONIQUE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rdv-btn"
                  style={{
                    padding: "8px 14px",
                    background: meetingType === t ? "var(--accent)" : "var(--surface2)",
                    color: meetingType === t ? "white" : "var(--ink2)",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                  onClick={() => setMeetingType(t)}
                >
                  {t === "VISIO" ? "Visio" : t === "PHYSIQUE" ? "Physique" : "Téléphonique"}
                </button>
              ))}
            </div>
          </div>

          {(clientBookingUrl || clientInterlocuteurs.some(i => (i.bookingLinks?.length ?? 0) > 0)) && (
            <div style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--accentLight)",
              border: "1px solid rgba(79,70,229,0.15)",
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 10 }}>
                📅 Calendrier client disponible
              </p>
              {clientInterlocuteurs.filter(i => i.isActive && i.bookingLinks?.length > 0).length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>
                    Commercial client destinataire
                  </label>
                  <select
                    className="rdv-input"
                    style={{ width: "100%" }}
                    value={selectedInterlocuteurId}
                    onChange={(e) => setSelectedInterlocuteurId(e.target.value)}
                  >
                    <option value="">Tous les commerciaux disponibles</option>
                    {clientInterlocuteurs
                      .filter(i => i.isActive && i.bookingLinks?.length > 0)
                      .map(i => (
                        <option key={i.id} value={i.id}>
                          {i.firstName} {i.lastName}{i.title ? ` — ${i.title}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                className="rdv-btn rdv-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "10px 0", display: "flex", alignItems: "center", gap: 8 }}
                onClick={() => setShowBookingDrawer(true)}
                disabled={!callbackDate || companyMode !== "existing" || contactMode !== "existing"}
              >
                <Calendar size={14} /> Ouvrir le calendrier client
              </button>
              {!callbackDate && (
                <p style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6, textAlign: "center" }}>
                  Choisissez d&apos;abord une date/heure ci-dessus
                </p>
              )}
              {callbackDate && (companyMode !== "existing" || contactMode !== "existing") && (
                <p style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6, textAlign: "center" }}>
                  Le calendrier client nécessite une société et un contact existants
                </p>
              )}
            </div>
          )}

          {meetingType === "VISIO" && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Lien de connexion</label>
              <input
                type="url"
                className="rdv-input"
                style={{ width: "100%" }}
                placeholder="https://..."
                value={meetingJoinUrl}
                onChange={(e) => setMeetingJoinUrl(e.target.value)}
              />
            </div>
          )}
          {meetingType === "PHYSIQUE" && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Adresse *</label>
              <input
                type="text"
                className="rdv-input"
                style={{ width: "100%" }}
                placeholder="Adresse du RDV"
                value={meetingAddress}
                onChange={(e) => setMeetingAddress(e.target.value)}
              />
            </div>
          )}
          {meetingType === "TELEPHONIQUE" && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Numéro à appeler</label>
              <input
                type="tel"
                className="rdv-input"
                style={{ width: "100%" }}
                placeholder="+33 ..."
                value={meetingPhone}
                onChange={(e) => setMeetingPhone(e.target.value)}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Durée (minutes)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[15, 30, 45, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="rdv-btn"
                  style={{
                    padding: "8px 14px",
                    background: duration === d ? "var(--accent)" : "var(--surface2)",
                    color: duration === d ? "white" : "var(--ink2)",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                  onClick={() => setDuration(d)}
                >
                  {d}min
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Catégorie</label>
            <select
              className="rdv-input"
              style={{ width: "100%" }}
              value={meetingCategory}
              onChange={(e) => setMeetingCategory(e.target.value as "" | "EXPLORATOIRE" | "BESOIN")}
            >
              <option value="">—</option>
              <option value="EXPLORATOIRE">Exploratoire</option>
              <option value="BESOIN">Analyse de besoin</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 6 }}>Notes / Commentaire</label>
            <textarea
              className="rdv-input"
              style={{ width: "100%", minHeight: 88, resize: "vertical" }}
              placeholder="Décrivez le RDV, contexte, sujets à aborder…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--red)" }}>{error}</p>
        )}

        <ModalFooter>
          <button
            disabled={!canSubmit || saving}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            style={{ minWidth: 160 }}
          >
            {saving && <Loader2 size={18} className="animate-spin" style={{ flexShrink: 0 }} />}
            {saving ? "Enregistrement…" : "Créer le RDV"}
          </button>
        </ModalFooter>
    </Modal>

    {showBookingDrawer && 
     contactMode === "existing" && contactId &&
     companyMode === "existing" && companyId &&
     (clientBookingUrl || clientInterlocuteurs.some(i => i.bookingLinks?.length > 0)) && (
      <BookingDrawer
        isOpen={showBookingDrawer}
        onClose={() => setShowBookingDrawer(false)}
        bookingUrl={clientBookingUrl || ""}
        contactId={contactId}
        companyId={companyId}
        contactName={
          selectedContact
            ? [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(" ")
            : selectedCompany?.name || "Contact"
        }
        contactInfo={
          selectedContact
            ? {
                firstName: selectedContact.firstName ?? null,
                lastName: selectedContact.lastName ?? null,
                email: selectedContact.email ?? null,
                phone: selectedContact.phone ?? null,
                title: selectedContact.title ?? null,
                linkedin: selectedContact.linkedin ?? null,
                companyName: selectedCompany?.name ?? null,
                companyEmail: selectedCompany?.email ?? null,
                companyPhone: selectedCompany?.phone ?? null,
                website: selectedCompany?.website ?? null,
              }
            : {
                companyName: selectedCompany?.name ?? null,
                companyEmail: selectedCompany?.email ?? null,
                companyPhone: selectedCompany?.phone ?? null,
                website: selectedCompany?.website ?? null,
              }
        }
        rdvDate={callbackDate ? callbackDate : undefined}
        meetingType={meetingType || undefined}
        meetingCategory={meetingCategory || undefined}
        meetingAddress={meetingAddress}
        meetingJoinUrl={meetingJoinUrl}
        meetingPhone={meetingPhone}
        interlocuteurs={clientInterlocuteurs}
        preferredInterlocuteurId={selectedInterlocuteurId || null}
        onRdvDateChange={(val) => setCallbackDate(val || "")}
        onMeetingTypeChange={setMeetingType}
        onMeetingCategoryChange={setMeetingCategory}
        onMeetingJoinUrlChange={setMeetingJoinUrl}
        onMeetingAddressChange={setMeetingAddress}
        onMeetingPhoneChange={setMeetingPhone}
        onBookingSuccess={() => {
          setShowBookingDrawer(false);
          onSuccess();
          onClose();
        }}
      />
    )}
  </>
  );
}
