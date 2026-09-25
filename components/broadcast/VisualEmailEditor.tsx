"use client";

import React, { useState } from "react";
import {
  EmailBlock,
  EmailBlockType,
  KeyValueItem,
  BroadcastVariable,
} from "@/lib/broadcast/types";
import { VariablePicker } from "./VariablePicker";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Heading,
  AlignLeft,
  AlignCenter,
  Info,
  ExternalLink,
  Table as TableIcon,
  Minus,
  Code2,
  Sparkles,
  LayoutTemplate,
} from "lucide-react";

interface VisualEmailEditorProps {
  subject: string;
  onSubjectChange: (val: string) => void;
  blocks: EmailBlock[];
  onBlocksChange: (blocks: EmailBlock[]) => void;
  rawHtml?: string;
  onRawHtmlChange?: (html: string) => void;
  variables: BroadcastVariable[];
  accentColor?: string;
  onAccentColorChange?: (color: string) => void;
}

export function VisualEmailEditor({
  subject,
  onSubjectChange,
  blocks,
  onBlocksChange,
  rawHtml = "",
  onRawHtmlChange,
  variables,
  accentColor = "#4f46e5",
  onAccentColorChange,
}: VisualEmailEditorProps) {
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // ── Block actions ─────────────────────────────────────────────────────────

  function addBlock(type: EmailBlockType) {
    const id = `b_${Date.now()}`;
    let newBlock: EmailBlock;

    switch (type) {
      case "heading":
        newBlock = {
          id,
          type,
          content: "Nouveau titre de section",
          props: { align: "left" },
        };
        break;
      case "paragraph":
        newBlock = {
          id,
          type,
          content: "Rédigez ici votre paragraphe. Vous pouvez utiliser du **gras** ou insérer des variables.",
          props: { align: "left" },
        };
        break;
      case "callout":
        newBlock = {
          id,
          type,
          content: "ℹ️ Remarque importante ou information mise en avant pour le destinataire.",
          props: { styleVariant: "info", align: "left" },
        };
        break;
      case "button":
        newBlock = {
          id,
          type,
          props: {
            buttonText: "Consulter mon espace",
            buttonUrl: "https://app.captainprospect.fr",
            buttonColor: accentColor,
            align: "center",
          },
        };
        break;
      case "key_value":
        newBlock = {
          id,
          type,
          props: {
            items: [
              { icon: "📅", label: "Date", value: "{{scheduledDate}}" },
              { icon: "⏰", label: "Heure", value: "{{scheduledTime}}" },
            ],
          },
        };
        break;
      case "divider":
        newBlock = { id, type };
        break;
      case "footer":
        newBlock = {
          id,
          type,
          content: "Cet email vous a été envoyé automatiquement par Captain Prospect.",
          props: { align: "center" },
        };
        break;
      default:
        newBlock = { id, type: "paragraph", content: "" };
    }

    onBlocksChange([...blocks, newBlock]);
    setActiveBlockId(id);
  }

  function updateBlock(id: string, updates: Partial<EmailBlock>) {
    onBlocksChange(
      blocks.map((b) => (b.id === id ? { ...b, ...updates, props: { ...b.props, ...updates.props } } : b))
    );
  }

  function removeBlock(id: string) {
    onBlocksChange(blocks.filter((b) => b.id !== id));
  }

  function moveBlock(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;

    const next = [...blocks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onBlocksChange(next);
  }

  function handleInsertVariable(token: string) {
    if (!activeBlockId) {
      // Append to subject if no block is focused
      onSubjectChange(subject ? `${subject} ${token}` : token);
      return;
    }
    const current = blocks.find((b) => b.id === activeBlockId);
    if (!current) return;

    if (current.type === "paragraph" || current.type === "heading" || current.type === "callout" || current.type === "footer") {
      updateBlock(activeBlockId, {
        content: current.content ? `${current.content} ${token}` : token,
      });
    } else if (current.type === "button") {
      updateBlock(activeBlockId, {
        props: {
          ...current.props,
          buttonUrl: current.props?.buttonUrl ? `${current.props.buttonUrl}${token}` : token,
        },
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setEditorMode("visual")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              editorMode === "visual"
                ? "bg-white text-slate-800 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
            Éditeur Visuel (Sans Code)
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("html")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              editorMode === "html"
                ? "bg-white text-slate-800 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code HTML (Avancé)
          </button>
        </div>

        {editorMode === "visual" && onAccentColorChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Couleur d&apos;accent :</span>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
            />
          </div>
        )}
      </div>

      {/* Subject Field */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
          Objet de l&apos;email *
        </label>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Ex: Confirmation de votre rendez-vous avec {{companyName}}"
          className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50/50 text-slate-900 font-medium"
        />
      </div>

      {/* Variable Picker Helper */}
      <VariablePicker
        variables={variables}
        onSelectVariable={handleInsertVariable}
      />

      {/* ──────────────── VISUAL BLOCK BUILDER ──────────────── */}
      {editorMode === "visual" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Contenu du message ({blocks.length} bloc{blocks.length > 1 ? "s" : ""})
            </span>
            <span className="text-xs text-slate-400">
              Cliquez sur un bloc pour insérer des variables
            </span>
          </div>

          <div className="space-y-3">
            {blocks.map((block, index) => {
              const isSelected = activeBlockId === block.id;

              return (
                <div
                  key={block.id}
                  onClick={() => setActiveBlockId(block.id)}
                  className={`rounded-2xl border transition-all p-4 bg-white shadow-xs ${
                    isSelected
                      ? "border-indigo-400 ring-2 ring-indigo-100"
                      : "border-slate-200/90 hover:border-slate-300"
                  }`}
                >
                  {/* Block Header Toolbar */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 uppercase tracking-wide text-[11px] px-2 py-0.5 rounded-md bg-slate-100">
                        {block.type === "header" && "🏷️ En-tête / Logo"}
                        {block.type === "heading" && "📌 Titre"}
                        {block.type === "paragraph" && "📝 Paragraphe de texte"}
                        {block.type === "callout" && "💡 Encadré mis en avant"}
                        {block.type === "key_value" && "📊 Données clés (RDV / Infos)"}
                        {block.type === "button" && "🔘 Bouton d'action"}
                        {block.type === "divider" && "➖ Séparateur"}
                        {block.type === "footer" && "🔻 Pied de page"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(index, "up");
                        }}
                        className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-30"
                        title="Monter"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === blocks.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(index, "down");
                        }}
                        className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-30"
                        title="Descendre"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBlock(block.id);
                        }}
                        className="p-1 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Supprimer ce bloc"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Block Content Editor Form */}
                  <div>
                    {block.type === "header" && (
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-500 font-medium">
                          Sous-titre d&apos;en-tête
                        </label>
                        <input
                          type="text"
                          value={block.props?.logoSubtitle || ""}
                          onChange={(e) =>
                            updateBlock(block.id, {
                              props: { ...block.props, logoSubtitle: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                        />
                      </div>
                    )}

                    {block.type === "heading" && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={block.content || ""}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          placeholder="Votre titre accrocheur..."
                          className="w-full px-3.5 py-2 text-base font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[11px] text-slate-400">Alignement :</span>
                          {(["left", "center", "right"] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => updateBlock(block.id, { props: { ...block.props, align } })}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                block.props?.align === align
                                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                  : "border-slate-200 text-slate-600"
                              }`}
                            >
                              {align === "left" ? "Gauche" : align === "center" ? "Centré" : "Droite"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {block.type === "paragraph" && (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={block.content || ""}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          placeholder="Écrivez votre texte ici..."
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-800 leading-relaxed resize-y"
                        />
                      </div>
                    )}

                    {block.type === "callout" && (
                      <div className="space-y-3">
                        <textarea
                          rows={2}
                          value={block.content || ""}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          placeholder="Message mis en valeur..."
                          className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-800"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">Style du cadre :</span>
                          {(["info", "success", "warning", "accent"] as const).map((variant) => (
                            <button
                              key={variant}
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, {
                                  props: { ...block.props, styleVariant: variant },
                                })
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border capitalize ${
                                block.props?.styleVariant === variant
                                  ? "bg-slate-900 border-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {variant === "info" && "Bleu (Info)"}
                              {variant === "success" && "Vert (Succès)"}
                              {variant === "warning" && "Ambre (Alerte)"}
                              {variant === "accent" && "Indigo (Accent)"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {block.type === "button" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 font-medium mb-1">
                            Texte du bouton
                          </label>
                          <input
                            type="text"
                            value={block.props?.buttonText || ""}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                props: { ...block.props, buttonText: e.target.value },
                              })
                            }
                            placeholder="Ex: Rejoindre la réunion"
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 font-medium mb-1">
                            Lien de redirection (URL ou variable)
                          </label>
                          <input
                            type="text"
                            value={block.props?.buttonUrl || ""}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                props: { ...block.props, buttonUrl: e.target.value },
                              })
                            }
                            placeholder="Ex: {{meetingJoinUrl}} ou https://..."
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {block.type === "key_value" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {(block.props?.items || []).map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.icon || ""}
                                onChange={(e) => {
                                  const nextItems = [...(block.props?.items || [])];
                                  nextItems[itemIdx].icon = e.target.value;
                                  updateBlock(block.id, { props: { ...block.props, items: nextItems } });
                                }}
                                placeholder="📅"
                                className="w-10 px-2 py-1.5 text-xs text-center rounded-lg border border-slate-200 bg-slate-50"
                              />
                              <input
                                type="text"
                                value={item.label}
                                onChange={(e) => {
                                  const nextItems = [...(block.props?.items || [])];
                                  nextItems[itemIdx].label = e.target.value;
                                  updateBlock(block.id, { props: { ...block.props, items: nextItems } });
                                }}
                                placeholder="Libellé"
                                className="w-32 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-medium"
                              />
                              <input
                                type="text"
                                value={item.value}
                                onChange={(e) => {
                                  const nextItems = [...(block.props?.items || [])];
                                  nextItems[itemIdx].value = e.target.value;
                                  updateBlock(block.id, { props: { ...block.props, items: nextItems } });
                                }}
                                placeholder="Valeur ou {{variable}}"
                                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextItems = (block.props?.items || []).filter((_, i) => i !== itemIdx);
                                  updateBlock(block.id, { props: { ...block.props, items: nextItems } });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextItems = [
                              ...(block.props?.items || []),
                              { icon: "📌", label: "Information", value: "" },
                            ];
                            updateBlock(block.id, { props: { ...block.props, items: nextItems } });
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          <Plus className="w-3 h-3" />
                          Ajouter une ligne
                        </button>
                      </div>
                    )}

                    {block.type === "footer" && (
                      <input
                        type="text"
                        value={block.content || ""}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        placeholder="Mention de bas de page..."
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
                      />
                    )}

                    {block.type === "divider" && (
                      <div className="py-2 flex items-center justify-center text-slate-300 text-xs font-mono">
                        ── Ligne de séparation horizontale ──
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Block Bar */}
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-3 text-center">
              + Ajouter un élément à votre message
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => addBlock("heading")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <Heading className="w-3.5 h-3.5 text-indigo-500" />
                Titre
              </button>
              <button
                type="button"
                onClick={() => addBlock("paragraph")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <AlignLeft className="w-3.5 h-3.5 text-indigo-500" />
                Paragraphe
              </button>
              <button
                type="button"
                onClick={() => addBlock("callout")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <Info className="w-3.5 h-3.5 text-indigo-500" />
                Encadré d&apos;info
              </button>
              <button
                type="button"
                onClick={() => addBlock("button")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                Bouton CTA
              </button>
              <button
                type="button"
                onClick={() => addBlock("key_value")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <TableIcon className="w-3.5 h-3.5 text-indigo-500" />
                Tableau de données
              </button>
              <button
                type="button"
                onClick={() => addBlock("divider")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-xs transition-all"
              >
                <Minus className="w-3.5 h-3.5 text-indigo-500" />
                Séparateur
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ──────────────── RAW HTML CODE MODE (ADVANCED) ──────────────── */
        <div className="rounded-2xl border border-slate-200 bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-slate-800 text-xs text-slate-400 border-b border-slate-700 flex items-center justify-between">
            <span>Éditeur HTML brut (Mode réservé aux utilisateurs avancés)</span>
            <span className="font-mono text-[11px]">UTF-8 · HTML5</span>
          </div>
          <textarea
            value={rawHtml}
            onChange={(e) => onRawHtmlChange && onRawHtmlChange(e.target.value)}
            rows={20}
            className="w-full p-4 font-mono text-xs text-slate-200 bg-slate-900 focus:outline-none resize-y leading-relaxed"
            placeholder="<!DOCTYPE html><html>..."
          />
        </div>
      )}
    </div>
  );
}
