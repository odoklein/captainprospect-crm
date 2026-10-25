"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { Chip, IconButton } from "@/components/ui";

interface LabelSectionProps {
    labels: string[];
    onAddLabel: (label: string) => void;
    onRemoveLabel: (label: string) => void;
}

/** Thread labels: chips + inline add. Labels then appear as folders in the nav. */
export function LabelSection({ labels, onAddLabel, onRemoveLabel }: LabelSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding) inputRef.current?.focus();
    }, [isAdding]);

    const commit = () => {
        const v = value.trim();
        if (v && !labels.includes(v)) onAddLabel(v);
        setValue("");
        setIsAdding(false);
    };

    return (
        <section>
            <div className="mb-2 flex items-center justify-between">
                <h4 className="text-2xs font-semibold uppercase tracking-wide text-ink-4">Libellés</h4>
                {!isAdding && <IconButton size="xs" icon={Plus} label="Ajouter un libellé" onClick={() => setIsAdding(true)} />}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {labels.map((label) => (
                    <Chip key={label} onRemove={() => onRemoveLabel(label)} className="h-7">
                        {label}
                    </Chip>
                ))}
                {isAdding ? (
                    <input
                        ref={inputRef}
                        value={value}
                        maxLength={40}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commit();
                            } else if (e.key === "Escape") {
                                e.stopPropagation();
                                setValue("");
                                setIsAdding(false);
                            }
                        }}
                        onBlur={commit}
                        placeholder="Nouveau libellé"
                        className="h-7 w-32 rounded-chip border border-primary-300 bg-surface px-2.5 text-xs text-ink outline-none ring-4 ring-primary-500/12 placeholder:text-ink-4"
                    />
                ) : (
                    labels.length === 0 && <p className="text-xs text-ink-4">Aucun libellé</p>
                )}
            </div>
        </section>
    );
}

export default LabelSection;
