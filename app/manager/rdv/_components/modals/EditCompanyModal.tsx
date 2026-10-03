"use client";

import { useState } from "react";
import type { Meeting } from "../../_types";
import { Modal, ModalFooter } from "@/components/ui/Modal";

interface EditCompanyModalProps {
  meeting: Meeting;
  onClose: () => void;
  onSaved: (patch: { name: string; industry: string | null; country: string | null; size: string | null; website: string | null; phone: string | null }) => void;
}

export function EditCompanyModal({ meeting, onClose, onSaved }: EditCompanyModalProps) {
  const company = meeting.company!;
  const [form, setForm] = useState({
    name: company.name || "",
    industry: company.industry || "",
    country: company.country || "",
    website: company.website || "",
    size: company.size || "",
    phone: company.phone || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          industry: form.industry || null,
          country: form.country || null,
          website: form.website || null,
          size: form.size || null,
          phone: form.phone || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const u = json.data;
        onSaved({
          name: u.name,
          industry: u.industry ?? null,
          country: u.country ?? null,
          size: u.size ?? null,
          website: u.website ?? null,
          phone: u.phone ?? null,
        });
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const fields: [keyof typeof form, string, string][] = [
    ["name", "Nom", "Nom de l'entreprise"],
    ["industry", "Secteur", "Secteur d'activité"],
    ["country", "Pays", "Pays"],
    ["website", "Site web", "https://..."],
    ["size", "Taille / Effectif", "ex: 50-200"],
    ["phone", "Téléphone", "+33 1 23 45 67 89"],
  ];

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Modifier l'entreprise" size="sm">
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
          disabled={saving || !form.name.trim()}
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
