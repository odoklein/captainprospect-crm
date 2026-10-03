"use client";

import { useState } from "react";
import type { Meeting } from "../../_types";
import { Modal, ModalFooter } from "@/components/ui/Modal";

interface EditContactModalProps {
  meeting: Meeting;
  onClose: () => void;
  onSaved: (patch: { firstName: string | null; lastName: string | null; title: string | null; email: string | null; phone: string | null; linkedin: string | null }) => void;
}

export function EditContactModal({ meeting, onClose, onSaved }: EditContactModalProps) {
  const contact = meeting.contact!;
  const [form, setForm] = useState({
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
    linkedin: contact.linkedin || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          title: form.title || null,
          email: form.email || null,
          phone: form.phone || null,
          linkedin: form.linkedin || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const u = json.data;
        onSaved({
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          title: u.title ?? null,
          email: u.email ?? null,
          phone: u.phone ?? null,
          linkedin: u.linkedin ?? null,
        });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const fields: [keyof typeof form, string, string][] = [
    ["firstName", "Prénom", "Prénom"],
    ["lastName", "Nom", "Nom"],
    ["title", "Poste", "Poste"],
    ["email", "Email", "email@exemple.fr"],
    ["phone", "Téléphone", "+33 6 12 34 56 78"],
    ["linkedin", "LinkedIn", "https://linkedin.com/in/..."],
  ];

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Modifier le contact" size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {fields.map(([key, label, placeholder]) => (
          <div key={key}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ink3)", marginBottom: 4 }}>{label}</label>
            <input
              className="rdv-input"
              style={{ width: "100%" }}
              value={form[key]}
              placeholder={placeholder}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <ModalFooter>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          disabled={saving}
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
