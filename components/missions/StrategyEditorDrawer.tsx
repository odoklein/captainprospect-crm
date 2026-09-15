"use client";

import { useEffect, useState, useCallback } from "react";
import { Drawer, useToast } from "@/components/ui";
import { Loader2, Save, CheckCircle2, AlertCircle, Target, Users, FileText, Sparkles } from "lucide-react";
import { PitchBlockEditor, ScriptBlockEditor } from "@/components/strategy";

interface ListSummary {
    id: string;
    name: string;
    isActive?: boolean;
    campaignId?: string | null;
}

interface StrategyEditorDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    campaignId: string | null;
    missionId: string;
    lists: ListSummary[];
    initialAssignToListId?: string | null;
    onSaved?: () => void;
}

interface CampaignDetail {
    id: string;
    name: string;
    icp: string;
    pitch: string;
    script?: string | null;
    isActive: boolean;
}

const C = {
    text: "#0F172A",
    textMuted: "#64748B",
    textSubtle: "#94A3B8",
    border: "#E2E8F0",
    borderFocus: "#4F46E5",
    bg: "#FFFFFF",
    bgSubtle: "#F8FAFC",
    indigo: "#4F46E5",
    indigoDark: "#3730A3",
    indigoBg: "#EEF2FF",
    emerald: "#059669",
    emeraldBg: "#ECFDF5",
    amber: "#D97706",
    amberBg: "#FFFBEB",
} as const;

const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    marginBottom: 8,
    letterSpacing: 0.1,
};

const hintStyle: React.CSSProperties = {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 6,
    lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    color: C.text,
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
    boxSizing: "border-box",
};

function fieldFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = C.borderFocus;
    e.currentTarget.style.boxShadow = `0 0 0 4px ${C.indigoBg}`;
}
function fieldBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = C.border;
    e.currentTarget.style.boxShadow = "none";
}

export function StrategyEditorDrawer({
    isOpen,
    onClose,
    campaignId,
    missionId,
    lists,
    initialAssignToListId,
    onSaved,
}: StrategyEditorDrawerProps) {
    const { success, error: showError } = useToast();
    const isCreate = !campaignId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState("");
    const [icp, setIcp] = useState("");
    const [pitch, setPitch] = useState("");
    const [script, setScript] = useState("");
    const [linkedListIds, setLinkedListIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        if (isCreate) {
            setName("");
            setIcp("");
            setPitch("");
            setScript("");
            setLinkedListIds(new Set(initialAssignToListId ? [initialAssignToListId] : []));
            return;
        }

        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${campaignId}`);
                const json = await res.json();
                if (cancelled) return;
                if (json.success) {
                    const c: CampaignDetail = json.data;
                    setName(c.name || "");
                    setIcp(c.icp || "");
                    setPitch(c.pitch || "");
                    setScript(c.script || "");
                    const linked = lists.filter((l) => l.campaignId === campaignId).map((l) => l.id);
                    setLinkedListIds(new Set(linked));
                } else {
                    showError("Erreur", json.error || "Stratégie introuvable");
                }
            } catch {
                if (!cancelled) showError("Erreur", "Impossible de charger la stratégie");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, campaignId]);

    const toggleListLink = useCallback((listId: string) => {
        setLinkedListIds((prev) => {
            const next = new Set(prev);
            if (next.has(listId)) next.delete(listId);
            else next.add(listId);
            return next;
        });
    }, []);

    const handleSave = async () => {
        if (!name.trim()) {
            showError("Nom requis", "Donnez un nom à cette stratégie (ex: SaaS SMB France)");
            return;
        }
        setSaving(true);
        try {
            let targetCampaignId = campaignId;

            if (isCreate) {
                const res = await fetch("/api/campaigns", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: name.trim(),
                        missionId,
                        icp,
                        pitch,
                        script,
                        assignToListIds: Array.from(linkedListIds),
                    }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Création échouée");
                    setSaving(false);
                    return;
                }
                targetCampaignId = json.data.id;
            } else {
                const res = await fetch(`/api/campaigns/${campaignId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), icp, pitch, script }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Sauvegarde échouée");
                    setSaving(false);
                    return;
                }

                const previouslyLinked = new Set(
                    lists.filter((l) => l.campaignId === campaignId).map((l) => l.id)
                );
                const toConnect = Array.from(linkedListIds).filter((id) => !previouslyLinked.has(id));
                const toDisconnect = Array.from(previouslyLinked).filter((id) => !linkedListIds.has(id));

                await Promise.all([
                    ...toConnect.map((id) =>
                        fetch(`/api/lists/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ campaignId: targetCampaignId }),
                        })
                    ),
                    ...toDisconnect.map((id) =>
                        fetch(`/api/lists/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ campaignId: null }),
                        })
                    ),
                ]);
            }

            success(isCreate ? "Stratégie créée" : "Stratégie sauvegardée", name.trim());
            onSaved?.();
            onClose();
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setSaving(false);
        }
    };

    const readyCount = [icp, pitch, script].filter((v) => !!v.trim()).length;
    const allReady = readyCount === 3;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title={isCreate ? "Créer une stratégie" : "Modifier la stratégie"}
            description={isCreate
                ? "Donnez à vos SDR exactement ce qu’il faut dire à cette liste."
                : "Modifiez la stratégie et choisissez quelles listes l’utilisent."}
            footer={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textMuted }}>
                        {allReady ? (
                            <>
                                <CheckCircle2 style={{ width: 16, height: 16, color: C.emerald }} />
                                <span style={{ color: C.emerald, fontWeight: 600 }}>Prête pour les SDR</span>
                            </>
                        ) : (
                            <>
                                <AlertCircle style={{ width: 16, height: 16, color: C.amber }} />
                                <span style={{ color: C.amber, fontWeight: 600 }}>{readyCount}/3 sections remplies</span>
                            </>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: "10px 18px",
                                fontSize: 14,
                                fontWeight: 500,
                                color: C.text,
                                background: C.bg,
                                border: `1px solid ${C.border}`,
                                borderRadius: 10,
                                cursor: "pointer",
                            }}
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || loading}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "10px 20px",
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#FFFFFF",
                                background: saving || loading
                                    ? "#A5B4FC"
                                    : `linear-gradient(135deg, ${C.indigo}, ${C.indigoDark})`,
                                border: "none",
                                borderRadius: 10,
                                cursor: saving || loading ? "not-allowed" : "pointer",
                                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <Save style={{ width: 16, height: 16 }} />}
                            {isCreate ? "Créer la stratégie" : "Sauvegarder"}
                        </button>
                    </div>
                </div>
            }
        >
            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
                    <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: C.textSubtle }} />
                </div>
            ) : (
                <div style={{ color: C.text, display: "grid", gap: 24 }}>
                    {/* Step 1: Name */}
                    <Step number={1} icon={<Target style={{ width: 18, height: 18, color: C.indigo }} />} title="Nom de la stratégie">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="ex: SaaS SMB France"
                            style={inputStyle}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                        <p style={hintStyle}>Un nom court qui décrit le segment (industrie, taille, géo).</p>
                    </Step>

                    {/* Step 2: Linked lists */}
                    <Step number={2} icon={<Users style={{ width: 18, height: 18, color: C.indigo }} />} title="Listes utilisant cette stratégie">
                        {lists.length === 0 ? (
                            <p style={{ fontSize: 13, color: C.textMuted }}>Aucune liste dans cette mission.</p>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gap: 6,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 10,
                                    padding: 6,
                                    maxHeight: 200,
                                    overflowY: "auto",
                                    background: C.bgSubtle,
                                }}
                            >
                                {lists.map((l) => {
                                    const checked = linkedListIds.has(l.id);
                                    const linkedElsewhere = !!l.campaignId && l.campaignId !== campaignId && !checked;
                                    return (
                                        <label
                                            key={l.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                padding: "10px 12px",
                                                fontSize: 14,
                                                color: C.text,
                                                background: checked ? C.indigoBg : C.bg,
                                                border: `1px solid ${checked ? C.indigo + "40" : C.border}`,
                                                borderRadius: 8,
                                                cursor: "pointer",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleListLink(l.id)}
                                                style={{ width: 18, height: 18, accentColor: C.indigo, cursor: "pointer" }}
                                            />
                                            <span style={{ flex: 1, fontWeight: checked ? 600 : 400 }}>{l.name}</span>
                                            {linkedElsewhere && (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        textTransform: "uppercase",
                                                        letterSpacing: 0.3,
                                                        color: C.amber,
                                                        background: C.amberBg,
                                                        padding: "2px 8px",
                                                        borderRadius: 6,
                                                    }}
                                                >
                                                    déjà liée
                                                </span>
                                            )}
                                            {l.isActive === false && (
                                                <span style={{ fontSize: 11, color: C.textSubtle, textTransform: "uppercase" }}>
                                                    inactive
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <p style={hintStyle}>
                            Cochez les listes qui doivent utiliser cette stratégie. Les SDR verront automatiquement le bon script.
                        </p>
                    </Step>

                    {/* Step 3: ICP */}
                    <Step number={3} icon={<Target style={{ width: 18, height: 18, color: C.indigo }} />} title="Profil cible (ICP)">
                        <textarea
                            value={icp}
                            onChange={(e) => setIcp(e.target.value)}
                            rows={4}
                            placeholder="Qui appelons-nous ? Ex: « DSI dans des PME industrielles françaises de 50-200 employés, en transition digitale »."
                            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical", minHeight: 100 }}
                            onFocus={fieldFocus}
                            onBlur={fieldBlur}
                        />
                    </Step>

                    {/* Step 4: Pitch */}
                    <Step number={4} icon={<Sparkles style={{ width: 18, height: 18, color: C.indigo }} />} title="Pitch — message à porter">
                        <PitchBlockEditor
                            value={pitch}
                            onChange={setPitch}
                            icp={icp}
                            placeholder="Quelle est la valeur que vous apportez ? Quelle est l'accroche ? Quelles preuves chiffrées ?"
                        />
                    </Step>

                    {/* Step 5: Script */}
                    <Step number={5} icon={<FileText style={{ width: 18, height: 18, color: C.indigo }} />} title="Script d’appel">
                        <ScriptBlockEditor
                            value={script}
                            onChange={setScript}
                            icp={icp}
                            pitch={pitch}
                        />
                        <p style={hintStyle}>
                            Pour les scripts additionnels ou améliorés par IA, utilisez l’onglet « Stratégie &amp; Scripts (avancé) ».
                        </p>
                    </Step>
                </div>
            )}
        </Drawer>
    );
}

function Step({
    number,
    icon,
    title,
    children,
}: {
    number: number;
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section
            style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 20,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: C.indigoBg,
                        color: C.indigoDark,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                    }}
                >
                    {number}
                </div>
                {icon}
                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
            </div>
            {children}
        </section>
    );
}
