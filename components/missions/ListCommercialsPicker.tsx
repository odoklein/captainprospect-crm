"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Interlocuteur = {
    id: string;
    firstName: string;
    lastName: string;
    title?: string | null;
};

interface ListCommercialsPickerProps {
    interlocuteurs: Interlocuteur[];
    /** Current set, primary first. */
    value: string[];
    /** Label shown when nothing is selected (mission default or none). */
    emptyLabel: string;
    /** Receives the ordered set (first = primary). Resolve to close the picker. */
    onSave: (ids: string[]) => Promise<void>;
}

/**
 * "Base de données par commercial": pick one, several or all commercials for a list.
 * The primary commercial (star) is the first calendar SDRs see; the others follow.
 */
export function ListCommercialsPicker({ interlocuteurs, value, emptyLabel, onSave }: ListCommercialsPickerProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[]>(value);
    const [saving, setSaving] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const valueKey = value.join(",");

    useEffect(() => {
        if (!open) setDraft(value);
    }, [open, valueKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const byId = new Map(interlocuteurs.map((i) => [i.id, i]));
    const selected = value.filter((id) => byId.has(id));
    const name = (i: Interlocuteur) => `${i.firstName} ${i.lastName}`.trim();
    const buttonLabel =
        selected.length === 0
            ? emptyLabel
            : selected.length === interlocuteurs.length && interlocuteurs.length > 1
                ? `Tous (${selected.length})`
                : `${name(byId.get(selected[0])!)}${selected.length > 1 ? ` +${selected.length - 1}` : ""}`;

    const toggle = (id: string) =>
        setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
    const makePrimary = (id: string) =>
        setDraft((d) => [id, ...d.filter((x) => x !== id)]);
    const allSelected = interlocuteurs.length > 0 && interlocuteurs.every((i) => draft.includes(i.id));
    const dirty = draft.join(",") !== selected.join(",");

    const save = async () => {
        setSaving(true);
        try {
            await onSave(draft);
            setOpen(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div ref={rootRef} className="relative ml-2">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 max-w-[220px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                title={selected.map((id) => name(byId.get(id)!)).join(", ") || emptyLabel}
            >
                <span className="truncate">{buttonLabel}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Commerciaux de la liste"
                    className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white shadow-lg"
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-700">Commerciaux de la liste</p>
                        <div className="flex items-center gap-2 text-[11px]">
                            <button
                                type="button"
                                className="font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-40"
                                disabled={allSelected}
                                onClick={() => setDraft((d) => [...d, ...interlocuteurs.map((i) => i.id).filter((id) => !d.includes(id))])}
                            >
                                Tous
                            </button>
                            <button
                                type="button"
                                className="font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
                                disabled={draft.length === 0}
                                onClick={() => setDraft([])}
                            >
                                Aucun
                            </button>
                        </div>
                    </div>

                    <ul className="max-h-64 overflow-y-auto py-1">
                        {interlocuteurs.length === 0 && (
                            <li className="px-3 py-2 text-xs text-slate-500">Aucun interlocuteur pour ce client.</li>
                        )}
                        {interlocuteurs.map((it) => {
                            const checked = draft.includes(it.id);
                            const isPrimary = draft[0] === it.id;
                            return (
                                <li key={it.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={checked}
                                        onClick={() => toggle(it.id)}
                                        className="flex flex-1 min-w-0 items-center gap-2 text-left"
                                    >
                                        <span
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"
                                            )}
                                        >
                                            {checked && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs text-slate-900">{name(it)}</span>
                                            {it.title && <span className="block truncate text-[11px] text-slate-500">{it.title}</span>}
                                        </span>
                                    </button>
                                    {checked && draft.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => makePrimary(it.id)}
                                            title={isPrimary ? "Commercial principal (calendrier affiché en premier)" : "Définir comme principal"}
                                            aria-label={isPrimary ? `${name(it)} est le commercial principal` : `Définir ${name(it)} comme principal`}
                                            className={cn("p-0.5 rounded", isPrimary ? "text-amber-500" : "text-slate-300 hover:text-amber-500")}
                                        >
                                            <Star className="h-3.5 w-3.5" fill={isPrimary ? "currentColor" : "none"} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100">
                        <p className="text-[11px] text-slate-500 leading-tight">
                            {draft.length === 0 ? emptyLabel : draft.length > 1 ? "★ = calendrier affiché en premier" : "1 commercial"}
                        </p>
                        <button
                            type="button"
                            onClick={save}
                            disabled={!dirty || saving}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                        >
                            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                            Enregistrer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
