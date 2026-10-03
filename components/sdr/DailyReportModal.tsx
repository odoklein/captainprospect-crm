"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
    countAnswered,
    emptyAnswers,
    toggleAnswer,
    type DailyReportAnswers,
} from "@/lib/sdr-daily-report/answers";
import {
    DAILY_REPORT_QUESTIONS,
    FIELD_COMMENT_MAX_LENGTH,
    type DailyReportQuestion,
    type DailyReportQuestionKey,
} from "@/lib/sdr-daily-report/options";
import type { DailyReportStatus } from "@/lib/sdr-daily-report/types";

interface DailyReportModalProps {
    isOpen: boolean;
    /** Mandatory and overdue: no close button, no click-away, no Escape. */
    blocking: boolean;
    onClose: () => void;
    status: DailyReportStatus | null;
    onSubmitted: (report: NonNullable<DailyReportStatus["report"]>) => void;
}

function initialAnswers(status: DailyReportStatus | null): DailyReportAnswers {
    const report = status?.report;
    if (report) {
        return {
            reachability: report.reachability,
            prospectReturns: report.prospectReturns,
            pitchFeeling: report.pitchFeeling,
            mainBlocker: report.mainBlocker,
            fieldComment: report.fieldComment ?? "",
            missionIds: report.missionIds,
        };
    }
    // The report is about the whole day: start from every mission planned today.
    return emptyAnswers(status?.missions.map((mission) => mission.id) ?? []);
}

export function DailyReportModal({ isOpen, blocking, onClose, status, onSubmitted }: DailyReportModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Retour journée SDR"
            description={
                blocking
                    ? "Obligatoire pour continuer — 4 questions, moins d’une minute."
                    : "4 questions rapides sur votre journée."
            }
            size="lg"
            showCloseButton={!blocking}
            closeOnOverlay={!blocking}
            closeOnEscape={!blocking}
        >
            {/* Mounted only while open, so the form re-reads the status each time */}
            <DailyReportForm blocking={blocking} status={status} onSubmitted={onSubmitted} />
        </Modal>
    );
}

function DailyReportForm({
    blocking,
    status,
    onSubmitted,
}: Pick<DailyReportModalProps, "blocking" | "status" | "onSubmitted">) {
    const pathname = usePathname();
    const [answers, setAnswers] = useState<DailyReportAnswers>(() => initialAnswers(status));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const alreadySent = !!status?.report;
    const { answered: answeredCount, total: questionCount } = countAnswered(answers);
    const complete = answeredCount === questionCount;

    const toggle = (question: DailyReportQuestion, value: string) =>
        setAnswers((prev) => toggleAnswer(prev, question.key, value));

    const toggleMission = (id: string) =>
        setAnswers((prev) => ({
            ...prev,
            missionIds: prev.missionIds.includes(id)
                ? prev.missionIds.filter((m) => m !== id)
                : [...prev.missionIds, id],
        }));

    const submit = async () => {
        if (!complete || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/sdr/daily-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reachability: answers.reachability,
                    prospectReturns: answers.prospectReturns,
                    pitchFeeling: answers.pitchFeeling,
                    mainBlocker: answers.mainBlocker,
                    fieldComment: answers.fieldComment.trim() || null,
                    missionIds: answers.missionIds,
                    pagePath: pathname,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                setError(json.error ?? "Impossible d’envoyer le retour, réessayez.");
                return;
            }
            onSubmitted({
                id: json.data?.id ?? "",
                submittedAt: json.data?.submittedAt ?? new Date().toISOString(),
                reachability: answers.reachability,
                prospectReturns: answers.prospectReturns,
                pitchFeeling: answers.pitchFeeling,
                mainBlocker: answers.mainBlocker,
                fieldComment: answers.fieldComment.trim() || null,
                missionIds: answers.missionIds,
            });
        } catch {
            setError("Erreur réseau, réessayez.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {status && status.missions.length > 0 && (
                <section>
                    <p className="text-[12px] font-semibold text-ink mb-2">
                        Mission(s) concernée(s){" "}
                        <span className="font-normal text-ink-3">· aujourd’hui</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {status.missions.map((mission) => {
                            const selected = answers.missionIds.includes(mission.id);
                            return (
                                <button
                                    key={mission.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => toggleMission(mission.id)}
                                    className={cn(
                                        "rounded-lg border px-3 py-1.5 text-left transition-colors",
                                        selected
                                            ? "border-primary-500 bg-accent-50"
                                            : "border-line bg-white hover:border-line-strong",
                                    )}
                                >
                                    <span className="block text-[12px] font-semibold text-ink">
                                        {mission.name}
                                    </span>
                                    {mission.client?.name && (
                                        <span className="block text-[11px] text-ink-3">{mission.client.name}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {DAILY_REPORT_QUESTIONS.map((question, index) => {
                const single = question.mode === "single";
                return (
                    <fieldset key={question.key}>
                        <legend className="text-[13px] font-semibold text-ink">
                            {index + 1}. {question.title}{" "}
                            <span className="text-danger" aria-hidden>
                                *
                            </span>
                        </legend>
                        <p className="text-[11px] text-ink-3 mt-0.5 mb-2">{question.hint}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {question.options.map((option) => {
                                const checked = single
                                    ? answers.mainBlocker === option.value
                                    : answers[question.key as Exclude<DailyReportQuestionKey, "mainBlocker">].includes(
                                          option.value,
                                      );
                                return (
                                    <label
                                        key={option.value}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                                            "focus-within:ring-2 focus-within:ring-primary-500/30",
                                            checked
                                                ? "border-primary-500 bg-accent-50"
                                                : "border-line bg-white hover:border-line-strong",
                                        )}
                                    >
                                        <input
                                            type={single ? "radio" : "checkbox"}
                                            name={question.key}
                                            checked={checked}
                                            onChange={() => toggle(question, option.value)}
                                            className="sr-only"
                                        />
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center border text-white",
                                                single ? "rounded-full" : "rounded",
                                                checked ? "border-primary-500 bg-primary" : "border-line-strong bg-white",
                                            )}
                                        >
                                            {checked &&
                                                (single ? (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                ) : (
                                                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                                                        <path
                                                            d="M2.5 6.5l2.2 2.2L9.5 3.8"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    </svg>
                                                ))}
                                        </span>
                                        <span className="text-[13px] leading-snug text-ink">{option.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                );
            })}

            <section>
                <label htmlFor="sdr-report-comment" className="block text-[13px] font-semibold text-ink">
                    Commentaire / retour terrain complémentaire{" "}
                    <span className="font-normal text-ink-3">· facultatif</span>
                </label>
                <p className="text-[11px] text-ink-3 mt-0.5 mb-2">Une phrase suffit.</p>
                <textarea
                    id="sdr-report-comment"
                    value={answers.fieldComment}
                    maxLength={FIELD_COMMENT_MAX_LENGTH}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, fieldComment: e.target.value }))}
                    placeholder="Ex : « Beaucoup de prospects disent être déjà sous contrat jusqu’à fin d’année » ou « Les standards demandent systématiquement le nom exact du responsable »"
                    className="w-full min-h-[76px] rounded-xl border border-line px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 resize-y"
                />
            </section>

            {error && (
                <p role="alert" className="text-[12px] text-red-600">
                    {error}
                </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-line-subtle">
                <p className="text-[11px] text-ink-3">
                    {complete
                        ? blocking
                            ? "Tout est rempli — l’écran se débloque dès l’envoi."
                            : "Tout est rempli."
                        : `${answeredCount}/${questionCount} questions répondues`}
                </p>
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!complete || submitting}
                    className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? "Envoi…" : alreadySent ? "Mettre à jour mon retour" : "Envoyer mon retour"}
                </button>
            </div>
        </div>
    );
}
