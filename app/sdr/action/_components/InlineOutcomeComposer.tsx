"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALLBACK_QUICK_PICKS, displayName, toLocalDateTimeInput } from "../_lib/queue-selectors";
import { STATUS_HINTS, TONE_STYLES, type OutcomeTone } from "../_lib/status-ui";
import type { QueueItem, StatusDefinition } from "../_lib/types";
import { CpButton, focusRing, Kbd, ResultIcon } from "./primitives";

const NOTE_MAX = 500;
const DEFAULT_CALLBACK_PICK = "tomorrow-9";

function defaultCallbackValue(): string {
    const pick = CALLBACK_QUICK_PICKS.find((p) => p.id === DEFAULT_CALLBACK_PICK)!;
    return toLocalDateTimeInput(pick.compute(new Date()));
}

export interface OutcomeSubmission {
    code: string;
    note: string;
    /** ISO string, callbacks only. */
    callbackDate?: string;
}

interface InlineOutcomeComposerProps {
    row: QueueItem;
    colSpan: number;
    statuses: StatusDefinition[];
    initialCode: string | null;
    toneOf: (code: string) => OutcomeTone;
    requiresNote: (code: string) => boolean;
    isCallback: (code: string) => boolean;
    submitting: boolean;
    onSubmit: (submission: OutcomeSubmission) => void;
    onCancel: () => void;
    /** RDV booking lives in the drawer (calendar, interlocuteurs). */
    onBookMeeting: (row: QueueItem) => void;
    /** "Mail à envoyer" → write and send the email now. */
    onComposeEmail: (row: QueueItem) => void;
}

/**
 * Expands under a row to log an outcome that needs more than one click:
 * a required note, a callback slot, or the email / meeting follow-ups.
 */
export function InlineOutcomeComposer({
    row,
    colSpan,
    statuses,
    initialCode,
    toneOf,
    requiresNote,
    isCallback,
    submitting,
    onSubmit,
    onCancel,
    onBookMeeting,
    onComposeEmail,
}: InlineOutcomeComposerProps) {
    // The parent keys this component by row + initial outcome, so state starts fresh.
    const [code, setCode] = useState<string | null>(initialCode);
    const [note, setNote] = useState("");
    // Callback outcomes default to tomorrow 9:00 — visible, and one tap to change.
    const [callbackValue, setCallbackValue] = useState(() => (initialCode && isCallback(initialCode) ? defaultCallbackValue() : ""));
    const [pickId, setPickId] = useState<string | null>(() => (initialCode && isCallback(initialCode) ? DEFAULT_CALLBACK_PICK : null));
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const firstChipRef = useRef<HTMLButtonElement>(null);
    const noteId = useId();

    const callback = !!code && isCallback(code);
    const noteRequired = !!code && requiresNote(code);

    const chooseCode = (next: string) => {
        setCode(next);
        if (isCallback(next) && !callbackValue) {
            setCallbackValue(defaultCallbackValue());
            setPickId(DEFAULT_CALLBACK_PICK);
        }
        if (requiresNote(next)) requestAnimationFrame(() => noteRef.current?.focus());
    };

    useEffect(() => {
        (initialCode ? noteRef.current : firstChipRef.current)?.focus();
        // mount only: focus the note when an outcome was preselected, else the first chip
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isMeeting = code === "MEETING_BOOKED";
    const isMailToSend = code === "ENVOIE_MAIL";
    const canSave = !!code && !isMeeting && !submitting && (!noteRequired || note.trim().length > 0);
    const minDate = useMemo(() => toLocalDateTimeInput(new Date()), []);

    const submit = () => {
        if (!canSave || !code) return;
        onSubmit({
            code,
            note: note.trim(),
            callbackDate: callback && callbackValue ? new Date(callbackValue).toISOString() : undefined,
        });
    };

    return (
        <tr className="bg-cp-green-soft/30">
            <td colSpan={colSpan} className="border-b border-cp-border/70 px-3 pb-3 pt-1">
                <div
                    className="cpds-enter rounded-xl border border-cp-border bg-cp-raised p-3 shadow-sm"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            onCancel();
                        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-cp-ink-2">
                            Résultat pour <span className="font-semibold text-cp-ink">{displayName(row)}</span>
                        </p>
                        <span className="hidden items-center gap-1 text-xs text-cp-ink-3 sm:inline-flex">
                            <Kbd>Ctrl</Kbd>+<Kbd>⏎</Kbd> enregistrer · <Kbd>Échap</Kbd> annuler
                        </span>
                    </div>

                    {/* Outcome choice */}
                    <div role="radiogroup" aria-label="Résultat" className="mb-3 flex flex-wrap gap-1.5">
                        {statuses.map((s, i) => {
                            const selected = s.code === code;
                            const tone = toneOf(s.code);
                            return (
                                <button
                                    key={s.code}
                                    ref={i === 0 ? firstChipRef : undefined}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    title={STATUS_HINTS[s.code]}
                                    onClick={() => chooseCode(s.code)}
                                    className={cn(
                                        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                                        selected ? TONE_STYLES[tone].badge : cn("border-cp-border bg-cp-raised text-cp-ink-2", TONE_STYLES[tone].button),
                                        focusRing,
                                    )}
                                >
                                    <ResultIcon code={s.code} className="size-3.5" />
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    {isMeeting ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cp-green/20 bg-cp-green-soft px-3 py-2.5">
                            <p className="text-sm text-cp-green">La prise de RDV se fait dans la fiche (calendrier du commercial, type et catégorie).</p>
                            <div className="flex gap-2">
                                <CpButton size="sm" variant="ghost" onClick={onCancel}>Annuler</CpButton>
                                <CpButton size="sm" variant="primary" icon={Calendar} onClick={() => onBookMeeting(row)}>
                                    Planifier le RDV
                                </CpButton>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                            <div>
                                <label htmlFor={noteId} className="mb-1 flex items-center justify-between text-xs font-medium text-cp-ink-2">
                                    <span>
                                        Note {noteRequired ? <span className="text-cp-danger">*</span> : <span className="font-normal text-cp-ink-3">(optionnelle)</span>}
                                    </span>
                                    <span className="font-normal tabular-nums text-cp-ink-3">{note.length}/{NOTE_MAX}</span>
                                </label>
                                <textarea
                                    id={noteId}
                                    ref={noteRef}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={2}
                                    maxLength={NOTE_MAX}
                                    placeholder={callback ? "Ex : rappeler après son comité de mardi…" : "Ce qui s'est dit, en une phrase…"}
                                    aria-required={noteRequired}
                                    className="w-full resize-y rounded-lg border border-cp-border bg-cp-canvas px-3 py-2 text-sm text-cp-ink placeholder:text-cp-ink-3 focus:border-cp-green focus:bg-cp-raised focus:outline-none focus:ring-2 focus:ring-cp-green/25"
                                />
                            </div>

                            {callback && (
                                <fieldset className="md:w-80">
                                    <legend className="mb-1 text-xs font-medium text-cp-ink-2">Date de rappel</legend>
                                    <div className="mb-1.5 flex flex-wrap gap-1">
                                        {CALLBACK_QUICK_PICKS.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                aria-pressed={pickId === p.id}
                                                onClick={() => {
                                                    setCallbackValue(toLocalDateTimeInput(p.compute(new Date())));
                                                    setPickId(p.id);
                                                }}
                                                className={cn(
                                                    "h-7 rounded-md border px-2 text-xs font-medium transition-colors",
                                                    pickId === p.id
                                                        ? "border-cp-warn bg-cp-warn text-white"
                                                        : "border-cp-warn/25 bg-cp-warn-soft text-cp-warn hover:border-cp-warn/50",
                                                    focusRing,
                                                )}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="datetime-local"
                                        value={callbackValue}
                                        min={minDate}
                                        onChange={(e) => {
                                            setCallbackValue(e.target.value);
                                            setPickId(null);
                                        }}
                                        aria-label="Date et heure du rappel"
                                        className="h-8 w-full rounded-lg border border-cp-border bg-cp-raised px-2 text-sm text-cp-ink focus:border-cp-green focus:outline-none focus:ring-2 focus:ring-cp-green/25"
                                    />
                                </fieldset>
                            )}
                        </div>
                    )}

                    {!isMeeting && (
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                            {noteRequired && !note.trim() && (
                                <span className="mr-auto text-xs text-cp-ink-3">Une note est requise pour ce résultat.</span>
                            )}
                            <CpButton size="sm" variant="ghost" onClick={onCancel}>Annuler</CpButton>
                            {isMailToSend && (
                                <CpButton size="sm" icon={Send} onClick={() => onComposeEmail(row)} disabled={submitting}>
                                    Écrire l&apos;email maintenant
                                </CpButton>
                            )}
                            <CpButton size="sm" variant="primary" onClick={submit} disabled={!canSave} isLoading={submitting}>
                                {isMailToSend ? "Enregistrer (Mail à envoyer)" : "Enregistrer"}
                            </CpButton>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}
