"use client";

/**
 * Playbook settings generated from its JSON Schema (number, integer,
 * boolean, enum, string, with min / max). The model — field list, draft,
 * coercion and validation — is lib/agent/client/config-form.ts.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { FIELD_BASE, FIELD_ERROR } from "@/components/ui/recipes";
import { SelectField } from "@/components/accueil/AccueilUI";
import type { ConfigDraft, ConfigField } from "@/lib/agent/client/config-form";

function boundsHint(f: ConfigField): string | null {
    if (f.min !== null && f.max !== null) return `Entre ${f.min} et ${f.max}.`;
    if (f.min !== null) return `Au moins ${f.min}.`;
    if (f.max !== null) return `Au plus ${f.max}.`;
    return null;
}

export function ConfigForm({
    fields,
    draft,
    errors,
    onChange,
}: {
    fields: ConfigField[];
    draft: ConfigDraft;
    errors: Record<string, string>;
    onChange: (next: ConfigDraft) => void;
}) {
    const id = useId();
    if (fields.length === 0) return null;
    const set = (key: string, value: string | boolean) => onChange({ ...draft, [key]: value });

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
                const fieldId = `${id}-${f.key}`;
                const hint = [f.description, f.type === "integer" || f.type === "number" ? boundsHint(f) : null].filter(Boolean).join(" ") || undefined;
                if (f.type === "boolean") {
                    return (
                        <div key={f.key} className="sm:col-span-2 rounded-[12px] border border-line bg-surface px-3.5 py-3">
                            <Switch checked={draft[f.key] === true} onChange={(v) => set(f.key, v)} label={f.label} description={f.description ?? undefined} />
                        </div>
                    );
                }
                if (f.type === "enum") {
                    return (
                        <Field key={f.key} label={f.label} hint={f.description ?? undefined} error={errors[f.key]} required={f.required}>
                            <SelectField value={String(draft[f.key] ?? "")} onChange={(v) => set(f.key, v)} ariaLabel={f.label}>
                                {!f.required && <option value="">Par défaut</option>}
                                {f.options.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </SelectField>
                        </Field>
                    );
                }
                const numeric = f.type === "integer" || f.type === "number";
                return (
                    <Field key={f.key} label={f.label} htmlFor={fieldId} hint={hint} error={errors[f.key]} required={f.required}>
                        <input
                            id={fieldId}
                            type={numeric ? "number" : "text"}
                            inputMode={f.type === "integer" ? "numeric" : numeric ? "decimal" : undefined}
                            step={f.type === "integer" ? 1 : numeric ? "any" : undefined}
                            min={f.min ?? undefined}
                            max={f.max ?? undefined}
                            value={String(draft[f.key] ?? "")}
                            placeholder={f.defaultValue !== undefined ? String(f.defaultValue) : numeric ? "Valeur par défaut" : undefined}
                            aria-invalid={Boolean(errors[f.key]) || undefined}
                            onChange={(e) => set(f.key, e.target.value)}
                            className={cn(FIELD_BASE, "h-10 px-3.5 text-sm", numeric && "tabular-nums", errors[f.key] && FIELD_ERROR)}
                        />
                    </Field>
                );
            })}
        </div>
    );
}
