"use client";

/**
 * Playbook settings generated from its JSON Schema: boolean → Switch, enum →
 * Select, bounded number → Slider (with its value), other numbers and
 * strings → Input. The model (field list, draft, coercion, validation,
 * slider bounds) is lib/agent/client/config-form.ts.
 */

import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Slider } from "@/components/ui/shadcn/slider";
import { Switch } from "@/components/ui/shadcn/switch";
import { sliderSpec, type ConfigDraft, type ConfigField } from "@/lib/agent/client/config-form";
import { FormField } from "./shared";

const DEFAULT_OPTION = "__default";

function boundsHint(f: ConfigField): string | null {
    if (f.min !== null && f.max !== null) return `Entre ${f.min} et ${f.max}.`;
    if (f.min !== null) return `Au moins ${f.min}.`;
    if (f.max !== null) return `Au plus ${f.max}.`;
    return null;
}

function formatNumber(n: number): string {
    return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
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
                if (f.type === "boolean") {
                    return (
                        <div key={f.key} className="flex items-start justify-between gap-4 rounded-[12px] border border-line bg-surface px-3.5 py-3 sm:col-span-2">
                            <div className="min-w-0">
                                <Label htmlFor={fieldId} className="text-sm font-medium text-ink">
                                    {f.label}
                                </Label>
                                {f.description && <p className="mt-1 text-2xs leading-relaxed text-ink-3">{f.description}</p>}
                            </div>
                            <Switch id={fieldId} checked={draft[f.key] === true} onCheckedChange={(v) => set(f.key, v)} className="mt-0.5" />
                        </div>
                    );
                }
                if (f.type === "enum") {
                    const value = String(draft[f.key] ?? "");
                    return (
                        <FormField key={f.key} label={f.label} htmlFor={fieldId} hint={f.description ?? undefined} error={errors[f.key]} required={f.required}>
                            <Select value={value === "" && !f.required ? DEFAULT_OPTION : value} onValueChange={(v) => set(f.key, v === DEFAULT_OPTION ? "" : v)}>
                                <SelectTrigger id={fieldId} className="w-full" aria-invalid={Boolean(errors[f.key]) || undefined}>
                                    <SelectValue placeholder="Choisir…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {!f.required && <SelectItem value={DEFAULT_OPTION}>Par défaut</SelectItem>}
                                    {f.options.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                    );
                }
                const numeric = f.type === "integer" || f.type === "number";
                const slider = sliderSpec(f);
                if (slider) {
                    const raw = String(draft[f.key] ?? "");
                    const parsed = Number(raw.replace(",", "."));
                    const isSet = raw.trim() !== "" && Number.isFinite(parsed);
                    const fallback = typeof f.defaultValue === "number" ? f.defaultValue : slider.min;
                    const current = Math.min(slider.max, Math.max(slider.min, isSet ? parsed : fallback));
                    return (
                        <FormField
                            key={f.key}
                            label={
                                <span className="flex w-full items-center justify-between gap-2">
                                    <span>{f.label}</span>
                                    <span className={cn("text-xs font-semibold tabular-nums", isSet ? "text-ink" : "text-ink-4")}>
                                        {isSet ? formatNumber(current) : `${formatNumber(fallback)} (défaut)`}
                                    </span>
                                </span>
                            }
                            htmlFor={fieldId}
                            hint={[f.description, boundsHint(f)].filter(Boolean).join(" ") || undefined}
                            error={errors[f.key]}
                            required={f.required}
                        >
                            <div className="flex items-center gap-3 py-1.5">
                                <span className="text-2xs tabular-nums text-ink-4">{formatNumber(slider.min)}</span>
                                <Slider
                                    id={fieldId}
                                    min={slider.min}
                                    max={slider.max}
                                    step={slider.step}
                                    value={[current]}
                                    onValueChange={([v]) => set(f.key, String(v))}
                                    aria-label={f.label}
                                />
                                <span className="text-2xs tabular-nums text-ink-4">{formatNumber(slider.max)}</span>
                                {!f.required && isSet && (
                                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => set(f.key, "")} aria-label={`Valeur par défaut pour ${f.label}`} title="Valeur par défaut">
                                        <RotateCcw aria-hidden />
                                    </Button>
                                )}
                            </div>
                        </FormField>
                    );
                }
                const hint = [f.description, numeric ? boundsHint(f) : null].filter(Boolean).join(" ") || undefined;
                return (
                    <FormField key={f.key} label={f.label} htmlFor={fieldId} hint={hint} error={errors[f.key]} required={f.required}>
                        <Input
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
                            className={cn(numeric && "tabular-nums")}
                        />
                    </FormField>
                );
            })}
        </div>
    );
}
