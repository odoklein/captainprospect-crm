"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui";
import { Button } from "@/components/ui";
import {
  FileText,
  Upload,
  Loader2,
  ArrowLeft,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Brain,
} from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import type {
  ParsedPlaybook,
  ParsedPlaybookClient,
  ParsedPlaybookMission,
  ParsedPlaybookCampaign,
  ParsedPlaybookScript,
  ParsedPlaybookEmailTemplate,
} from "@/lib/playbook/types";

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

const STEPS = [
  { id: 1, label: "Upload", short: "Upload" },
  { id: 2, label: "AI Extraction", short: "Extraction" },
  { id: 3, label: "Review", short: "Review" },
  { id: 4, label: "Create", short: "Create" },
];

const PARSING_MESSAGES = [
  "Analyse du playbook en cours...",
  "Extraction du client et du secteur...",
  "Extraction de l'ICP et du ciblage...",
  "Extraction des scripts téléphoniques...",
  "Extraction de la séquence email...",
];

const CARD_BORDER: Record<string, string> = {
  client: "border-l-blue-500",
  mission: "border-l-accent-500",
  campaign: "border-l-primary-500",
  script: "border-l-amber-500",
  email: "border-l-teal-500",
};

// Inline-edit: show text, click to edit
function InlineField({
  value,
  onChange,
  placeholder,
  className,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const isEmpty = !value?.trim();
  const display = value?.trim() || placeholder || "—";

  const save = useCallback(() => {
    setEditing(false);
    onChange(local);
  }, [local, onChange]);

  if (editing) {
    const common = "w-full px-2 py-1.5 rounded-lg border border-accent-200 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500";
    return multiline ? (
      <textarea
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Escape" && save()}
        rows={3}
        className={cn(common, "resize-none", className)}
      />
    ) : (
      <input
        autoFocus
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className={cn(common, className)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setLocal(value ?? "");
        setEditing(true);
      }}
      className={cn(
        "w-full text-left text-sm font-medium text-slate-900 rounded-lg px-2 py-1.5 -mx-2 -my-1.5 hover:bg-slate-100 transition-colors min-h-[2rem]",
        isEmpty && "text-slate-400 font-normal",
        className
      )}
    >
      {display}
    </button>
  );
}

export default function PlaybookImportPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();

  const [step, setStep] = useState<"upload" | "parsing" | "preview">("upload");
  const [content, setContent] = useState("");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingPhase, setParsingPhase] = useState(0);
  const [parsedData, setParsedData] = useState<ParsedPlaybook | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [edited, setEdited] = useState<ParsedPlaybook | null>(null);

  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptTab, setScriptTab] = useState<"intro" | "objections" | "sections">("intro");
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [cardsRevealed, setCardsRevealed] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showError("Fichier trop volumineux", "Taille max 1 Mo");
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".md") && !ext.endsWith(".txt")) {
      showError("Format non supporté", "Utilisez un fichier .md ou .txt");
      return;
    }
    setSourceFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(file, "UTF-8");
  };

  const handleParse = async () => {
    if (!content.trim()) {
      showError("Contenu requis", "Collez le texte ou uploadez un fichier.");
      return;
    }
    setIsParsing(true);
    setStep("parsing");
    setParsingPhase(0);
    const phases = PARSING_MESSAGES.length;
    const phaseInterval = 800;
    const phaseTimer = setInterval(() => {
      setParsingPhase((p) => Math.min(p + 1, phases - 1));
    }, phaseInterval);

    try {
      const res = await fetch("/api/playbook/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          sourceFileName: sourceFileName ?? undefined,
        }),
      });
      const json = await res.json();
      clearInterval(phaseTimer);
      setParsingPhase(phases - 1);
      if (!json.success) {
        showError("Erreur", json.error ?? "Impossible d'analyser le playbook");
        setStep("upload");
        return;
      }
      setParsedData(json.data);
      setEdited(json.data);
      setCardsRevealed(false);
      setTimeout(() => setCardsRevealed(true), 50);
      setStep("preview");
    } catch (err) {
      console.error(err);
      clearInterval(phaseTimer);
      showError("Erreur", "Une erreur est survenue");
      setStep("upload");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!edited) return;
    if (!edited.client?.name?.trim()) {
      showError("Erreur", "Le nom du client est requis");
      return;
    }
    setIsImporting(true);
    try {
      const res = await fetch("/api/playbook/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...edited,
          sourceFileName: edited.sourceFileName ?? sourceFileName ?? undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        showError("Erreur", json.error ?? "Impossible de créer les entités");
        return;
      }
      success("Playbook importé", `${edited.client?.name} et les entités ont été créés`);
      router.push(`/manager/clients/${json.data.clientId}`);
    } catch (err) {
      console.error(err);
      showError("Erreur", "Une erreur est survenue");
    } finally {
      setIsImporting(false);
    }
  };

  const updateClient = (updates: Partial<ParsedPlaybookClient>) => {
    setEdited((prev) =>
      prev ? { ...prev, client: prev.client ? { ...prev.client, ...updates } : { name: "", ...updates } } : null
    );
  };
  const updateCampaign = (updates: Partial<ParsedPlaybookCampaign>) => {
    setEdited((prev) =>
      prev ? { ...prev, campaign: prev.campaign ? { ...prev.campaign, ...updates } : { icp: "", ...updates } } : null
    );
  };
  const updateScript = (updates: Partial<ParsedPlaybookScript>) => {
    setEdited((prev) =>
      prev ? { ...prev, script: prev.script ? { ...prev.script, ...updates } : ({ ...updates } as ParsedPlaybookScript) } : null
    );
  };
  const updateMissions = (missions: ParsedPlaybookMission[]) => {
    setEdited((prev) => (prev ? { ...prev, missions } : null));
  };
  const updateEmailTemplates = (templates: ParsedPlaybookEmailTemplate[]) => {
    setEdited((prev) => (prev ? { ...prev, emailTemplates: templates } : null));
  };

  const entityCount =
    (edited?.client ? 1 : 0) +
    (edited?.missions?.length ?? 0) +
    (edited?.campaign ? 1 : 0) +
    (edited?.script ? 1 : 0) +
    (edited?.emailTemplates?.length ?? 0);

  const summaryItems = [
    { key: "client", label: "Client", ok: !!edited?.client?.name },
    { key: "mission", label: "Mission", ok: (edited?.missions?.length ?? 0) >= 1 },
    { key: "campaign", label: "Campagne", ok: !!edited?.campaign?.icp },
    { key: "script", label: "Scripts", ok: !!edited?.script },
    { key: "email", label: "Emails", ok: (edited?.emailTemplates?.length ?? 0) >= 1 },
  ];

  const currentStepId = step === "upload" ? 1 : step === "parsing" ? 2 : 3;
  const pageBg = "min-h-screen bg-surface-2";

  return (
    <div className={pageBg}>
      <div className="px-8 py-10 max-w-7xl mx-auto">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all",
                  currentStepId === s.id && "bg-accent-600 text-white shadow-md",
                  currentStepId > s.id && "bg-emerald-100 text-emerald-700",
                  currentStepId < s.id && "bg-slate-200 text-slate-500"
                )}
              >
                {s.id}. {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5 mx-1", currentStepId > s.id ? "bg-emerald-300" : "bg-slate-200")} />
              )}
            </div>
          ))}
        </div>

        {/* ----- Upload step ----- */}
        {step === "upload" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-xl font-semibold text-slate-900">Importer un playbook</h1>
              <p className="text-sm text-slate-500 mt-1">
                Uploadez ou collez un document Sales Playbook (Notion markdown)
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 p-6 border border-slate-200/80">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Fichier .md ou .txt</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer text-sm font-medium text-slate-700 transition-colors">
                      <Upload className="w-4 h-4" />
                      Choisir un fichier
                      <input type="file" accept=".md,.txt" className="hidden" onChange={handleFileChange} />
                    </label>
                    {sourceFileName && (
                      <span className="text-sm font-medium text-slate-600 truncate max-w-[200px]">{sourceFileName}</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Ou coller le contenu</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Collez ici le contenu du playbook (export Notion, markdown...)"
                    rows={12}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent resize-y"
                  />
                </div>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                  <Link href="/manager/clients">
                    <Button variant="secondary" className="gap-2 rounded-xl">
                      <ArrowLeft className="w-4 h-4" />
                      Annuler
                    </Button>
                  </Link>
                  <Button
                    variant="primary"
                    onClick={handleParse}
                    disabled={!content.trim() || isParsing}
                    isLoading={isParsing}
                    className="gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 shadow-sm"
                  >
                    {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AiMark className="w-4 h-4" />}
                    Analyser le playbook
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----- Parsing step (AI panel) ----- */}
        {step === "parsing" && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-accent-200/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-accent-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Parsing playbook</h2>
                  <p className="text-sm text-slate-500">L'IA extrait les entités...</p>
                </div>
              </div>
              <div className="space-y-3">
                {PARSING_MESSAGES.map((msg, i) => (
                  <div
                    key={msg}
                    className={cn(
                      "flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-all",
                      i <= parsingPhase ? "bg-accent-50 text-accent-800" : "bg-slate-50 text-slate-400"
                    )}
                  >
                    {i < parsingPhase ? (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : i === parsingPhase ? (
                      <Loader2 className="w-4 h-4 animate-spin text-accent-500 shrink-0" />
                    ) : (
                      <span className="w-4 h-4 shrink-0 rounded-full border-2 border-slate-300" />
                    )}
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ----- Preview step: sticky header + 2 columns ----- */}
        {step === "preview" && edited && (
          <>
            {/* Sticky top summary bar */}
            <div className="sticky top-0 z-20 -mx-8 px-8 py-4 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm mb-6">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-accent-600" />
                    <span className="text-lg font-semibold text-slate-900">Résultat de l'import IA</span>
                  </div>
                  <span className="text-sm text-slate-600">{entityCount} entité(s) détectée(s)</span>
                  <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">
                    Confiance: Élevée
                  </span>
                  {edited.sourceFileName && (
                    <span className="text-xs text-slate-500">Source: {edited.sourceFileName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/manager/clients">
                    <Button variant="secondary" className="gap-2 rounded-xl">
                      Annuler
                    </Button>
                  </Link>
                  <Button
                    variant="primary"
                    onClick={handleImport}
                    disabled={!edited.client?.name?.trim() || isImporting}
                    isLoading={isImporting}
                    className="gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 shadow-sm px-6"
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Tout créer ({entityCount})
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-8">
              {/* Left: entity cards (70%) */}
              <div className="flex-1 min-w-0 space-y-6">
                {/* 1. Client */}
                <div
                  className={cn(
                    "bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200/80 border-l-4 p-6",
                    CARD_BORDER.client,
                    cardsRevealed && "animate-fade-in"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold">1</span>
                      <h3 className="text-xl font-semibold text-slate-900">Client</h3>
                    </div>
                    <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">Détecté</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Nom</label>
                      <InlineField value={edited.client?.name ?? ""} onChange={(v) => updateClient({ name: v })} placeholder="Nom du client" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Site web</label>
                      <InlineField value={edited.client?.website ?? ""} onChange={(v) => updateClient({ website: v || null })} placeholder="ex: upikajob.com" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Secteur</label>
                      <InlineField
                        value={edited.client?.sector ?? edited.client?.industry ?? ""}
                        onChange={(v) => updateClient({ sector: v || null, industry: v || null })}
                        placeholder="SIRH / SaaS / IA"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Description</label>
                      <InlineField
                        value={edited.client?.description ?? ""}
                        onChange={(v) => updateClient({ description: v || null })}
                        placeholder="Forces, faiblesses, résumé..."
                        multiline
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Missions */}
                <div
                  className={cn(
                    "bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200/80 border-l-4 p-6",
                    CARD_BORDER.mission,
                    cardsRevealed && "animate-fade-in"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-100 text-accent-600 text-sm font-semibold">2</span>
                      <h3 className="text-xl font-semibold text-slate-900">Mission</h3>
                    </div>
                    <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">Détecté</span>
                  </div>
                  <div className="space-y-2">
                    {(edited.missions ?? []).map((m, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                        <span className="text-sm font-medium text-slate-900">{m.name}</span>
                        <span className="rounded-full bg-accent-100 text-accent-700 px-2.5 py-0.5 text-xs font-medium">{m.channel}</span>
                      </div>
                    ))}
                    {(!edited.missions || edited.missions.length === 0) && (
                      <p className="text-sm text-slate-500">2 missions (Appel + Email) seront créées par défaut.</p>
                    )}
                  </div>
                </div>

                {/* 3. Campagne ICP */}
                <div
                  className={cn(
                    "bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200/80 border-l-4 p-6",
                    CARD_BORDER.campaign,
                    cardsRevealed && "animate-fade-in"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-600 text-sm font-semibold">3</span>
                      <h3 className="text-xl font-semibold text-slate-900">Campagne — ICP & Ciblage</h3>
                    </div>
                    <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">Détecté</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Postes cibles / ICP</label>
                      <InlineField value={edited.campaign?.icp ?? ""} onChange={(v) => updateCampaign({ icp: v })} multiline placeholder="DRH, Resp. RH..." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Secteurs</label>
                        <InlineField
                          value={(edited.campaign?.secteurs ?? []).join(", ")}
                          onChange={(v) => updateCampaign({ secteurs: v ? v.split(",").map((s) => s.trim()) : [] })}
                          placeholder="BTP, Industrie..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Taille / Zone</label>
                        <InlineField
                          value={[edited.campaign?.taille, edited.campaign?.zone].filter(Boolean).join(" — ")}
                          onChange={(v) => {
                            const [taille, zone] = v.split("—").map((s) => s.trim());
                            updateCampaign({ taille: taille || null, zone: zone || null });
                          }}
                          placeholder="500–2000 collab. — France"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Script (collapsible) */}
                <div
                  className={cn(
                    "bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200/80 border-l-4 overflow-hidden",
                    CARD_BORDER.script,
                    cardsRevealed && "animate-fade-in"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setScriptOpen((o) => !o)}
                    className="w-full p-6 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 text-sm font-semibold">4</span>
                      <h3 className="text-xl font-semibold text-slate-900">Script téléphonique</h3>
                      <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">Détecté</span>
                    </div>
                    <span className="text-sm text-slate-500">
                      {edited.script?.sections?.length ?? 0} script(s), {(edited.script?.objections?.length ?? 0) || (edited.script?.objection ? 1 : 0)} objection(s)
                    </span>
                    {scriptOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  </button>
                  {scriptOpen && (
                    <div className="px-6 pb-6 pt-0 border-t border-slate-200">
                      <div className="flex gap-2 mb-4">
                        {["intro", "objections", "sections"].map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setScriptTab(tab as typeof scriptTab)}
                            className={cn(
                              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                              scriptTab === tab ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            {tab === "intro" ? "Appel / Intro" : tab === "objections" ? "Objections" : "Sections"}
                          </button>
                        ))}
                      </div>
                      {scriptTab === "intro" && (
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Intro / Premier contact</label>
                          <textarea
                            value={edited.script?.intro ?? edited.script?.fullScript ?? ""}
                            onChange={(e) => updateScript({ intro: e.target.value || null })}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}
                      {scriptTab === "objections" && (
                        <div>
                          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Objections</label>
                          <textarea
                            value={edited.script?.objection ?? (edited.script?.objections ?? []).join("\n\n")}
                            onChange={(e) => updateScript({ objection: e.target.value || null })}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}
                      {scriptTab === "sections" && (
                        <div className="space-y-2">
                          {(edited.script?.sections ?? []).map((s, i) => (
                            <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                              {s.title && <p className="text-xs font-medium text-slate-500 uppercase mb-1">{s.title}</p>}
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.content}</p>
                            </div>
                          ))}
                          {(!edited.script?.sections || edited.script.sections.length === 0) && (
                            <p className="text-sm text-slate-500">Aucune section extraite.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 5. Emails (collapsible) */}
                <div
                  className={cn(
                    "bg-white rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border border-slate-200/80 border-l-4 overflow-hidden",
                    CARD_BORDER.email,
                    cardsRevealed && "animate-fade-in"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setEmailsOpen((o) => !o)}
                    className="w-full p-6 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-600 text-sm font-semibold">5</span>
                      <h3 className="text-xl font-semibold text-slate-900">Séquence email</h3>
                      <span className="rounded-full bg-emerald-50 text-emerald-600 px-3 py-1 text-xs font-medium">Détecté</span>
                    </div>
                    <span className="text-sm text-slate-500">{(edited.emailTemplates ?? []).length} email(s)</span>
                    {emailsOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  </button>
                  {emailsOpen && (
                    <div className="px-6 pb-6 pt-0 border-t border-slate-200 space-y-4">
                      {(edited.emailTemplates ?? []).map((t, i) => (
                        <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">{t.delayLabel ?? `Email ${i + 1}`}</span>
                            <input
                              value={t.name}
                              onChange={(e) => {
                                const next = [...(edited?.emailTemplates ?? [])];
                                next[i] = { ...next[i], name: e.target.value };
                                updateEmailTemplates(next);
                              }}
                              className="flex-1 h-9 px-3 border border-slate-200 rounded-lg text-sm font-medium"
                              placeholder="Nom"
                            />
                          </div>
                          <input
                            value={t.subject}
                            onChange={(e) => {
                              const next = [...(edited?.emailTemplates ?? [])];
                              next[i] = { ...next[i], subject: e.target.value };
                              updateEmailTemplates(next);
                            }}
                            className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm"
                            placeholder="Sujet"
                          />
                          <textarea
                            value={t.bodyHtml}
                            onChange={(e) => {
                              const next = [...(edited?.emailTemplates ?? [])];
                              next[i] = { ...next[i], bodyHtml: e.target.value };
                              updateEmailTemplates(next);
                            }}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                            placeholder="Corps"
                          />
                        </div>
                      ))}
                      {(!edited.emailTemplates || edited.emailTemplates.length === 0) && (
                        <p className="text-sm text-slate-500">Aucun email détecté.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Proposition de valeur (dashed) */}
                <div className="bg-white/80 rounded-2xl border-2 border-dashed border-slate-300 p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-slate-500" />
                    <h3 className="text-lg font-semibold text-slate-700">Proposition de valeur</h3>
                    <span className="text-xs text-slate-500">Stockée comme note sur le Client</span>
                  </div>
                  <textarea
                    value={edited.valueProposition ?? ""}
                    onChange={(e) => setEdited((prev) => (prev ? { ...prev, valueProposition: e.target.value || null } : null))}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none bg-white"
                    placeholder="Pitch + proposition de valeur..."
                  />
                </div>
              </div>

              {/* Right: sticky sidebar (30%) */}
              <div className="w-80 shrink-0">
                <div className="sticky top-24 space-y-4">
                  <div className="bg-white rounded-2xl shadow-md border border-slate-200/80 p-6">
                    <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">Résumé de l'import</h4>
                    <ul className="space-y-2">
                      {summaryItems.map((item) => (
                        <li key={item.key} className="flex items-center gap-2 text-sm">
                          {item.ok ? (
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-4 h-4 shrink-0 rounded-full border-2 border-rose-300" />
                          )}
                          <span className={item.ok ? "font-medium text-slate-700" : "text-slate-500"}>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-slate-200">
                      Entités à créer: <span className="font-semibold text-slate-700">{entityCount}</span>
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleImport}
                    disabled={!edited.client?.name?.trim() || isImporting}
                    isLoading={isImporting}
                    className="w-full gap-2 rounded-xl py-4 text-base font-semibold bg-primary-600 hover:bg-primary-500 shadow-sm"
                  >
                    {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    Tout créer ({entityCount} entités)
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
