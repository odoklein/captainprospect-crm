"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui";
import type { MailboxInfo } from "../types";
import { newStep, type DraftStep } from "./draft";
import { StepEditor } from "./StepEditor";
import { StepTimeline } from "./StepTimeline";

interface StepsWorkspaceProps {
    steps: DraftStep[];
    onChange: (steps: DraftStep[]) => void;
    mailbox: MailboxInfo | null;
    timezone: string;
    stopOnReply: boolean;
    myEmail?: string | null;
    previewContacts?: { id: string; label: string }[];
}

/** Timeline on the left, the selected email's editor + live preview on the right. */
export function StepsWorkspace({ steps, onChange, mailbox, timezone, stopOnReply, myEmail, previewContacts }: StepsWorkspaceProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(steps[0]?.key ?? null);
    const [toRemove, setToRemove] = useState<DraftStep | null>(null);

    useEffect(() => {
        if (!steps.some((s) => s.key === selectedKey)) setSelectedKey(steps[0]?.key ?? null);
    }, [steps, selectedKey]);

    const selectedIndex = steps.findIndex((s) => s.key === selectedKey);
    const selected = selectedIndex >= 0 ? steps[selectedIndex] : null;

    const update = (key: string, patch: Partial<DraftStep>) => onChange(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));

    const add = () => {
        const step = newStep(steps.length);
        onChange([...steps, step]);
        setSelectedKey(step.key);
    };

    const move = (key: string, direction: -1 | 1) => {
        const i = steps.findIndex((s) => s.key === key);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= steps.length) return;
        const next = [...steps];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
    };

    const remove = (step: DraftStep) => {
        const hasContent = step.subject.trim() || step.body.trim();
        if (hasContent) setToRemove(step);
        else onChange(steps.filter((s) => s.key !== step.key));
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="lg:sticky lg:top-4 lg:self-start">
                <StepTimeline
                    steps={steps}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    onAdd={add}
                    onMove={move}
                    onRemove={(key) => {
                        const s = steps.find((x) => x.key === key);
                        if (s) remove(s);
                    }}
                />
            </div>
            {selected ? (
                <StepEditor
                    key={selected.key}
                    step={selected}
                    index={selectedIndex}
                    total={steps.length}
                    onChange={(patch) => update(selected.key, patch)}
                    mailbox={mailbox}
                    timezone={timezone}
                    stopOnReply={stopOnReply}
                    myEmail={myEmail}
                    previewContacts={previewContacts}
                />
            ) : (
                <p className="text-sm text-ink-3">Ajoutez un premier email pour commencer.</p>
            )}

            <ConfirmModal
                isOpen={!!toRemove}
                onClose={() => setToRemove(null)}
                onConfirm={() => {
                    if (toRemove) onChange(steps.filter((s) => s.key !== toRemove.key));
                    setToRemove(null);
                }}
                variant="danger"
                title="Supprimer cet email ?"
                confirmText="Supprimer"
                message="Son objet et son texte seront perdus à l'enregistrement. Les emails suivants remonteront d'un cran."
            />
        </div>
    );
}
