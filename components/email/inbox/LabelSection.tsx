
import React, { useState, useRef, useEffect } from "react";
import { Tag, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LabelSectionProps {
    labels: string[];
    onAddLabel: (label: string) => void;
    onRemoveLabel: (label: string) => void;
}

export function LabelSection({ labels, onAddLabel, onRemoveLabel }: LabelSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isAdding]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (newLabel.trim()) {
                onAddLabel(newLabel.trim());
                setNewLabel("");
                setIsAdding(false);
            }
        } else if (e.key === 'Escape') {
            setIsAdding(false);
            setNewLabel("");
        }
    };

    return (
        <div className="p-3 bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Labels</span>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-50 transition-colors"
                >
                    <Plus className="w-3 h-3" />
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {labels.length > 0 ? (
                    labels.map((label) => (
                        <span
                            key={label}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100 rounded-full group"
                        >
                            {label}
                            <button
                                onClick={() => onRemoveLabel(label)}
                                className="p-0.5 hover:bg-primary-100 rounded-full text-primary-400 hover:text-primary-700 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))
                ) : !isAdding && (
                    <p className="text-sm text-slate-400 italic">Aucun label</p>
                )}

                {isAdding && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => {
                            if (newLabel.trim()) {
                                onAddLabel(newLabel.trim());
                            }
                            setIsAdding(false);
                            setNewLabel("");
                        }}
                        className="px-2 py-0.5 text-xs bg-white border border-primary-300 rounded-full outline-none ring-2 ring-primary-500/20 w-24"
                        placeholder="Nouveau label..."
                    />
                )}
            </div>
        </div>
    );
}
