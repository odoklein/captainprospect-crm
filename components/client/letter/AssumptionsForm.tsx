"use client";

// « Vos hypothèses »: the two figures only the client knows, entered once, that
// turn held RDV into an estimated pipeline (PUT /api/client/letter/assumptions).

import { useEffect, useId, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

export interface AssumptionsValue {
    avgDealValue: number | null;
    meetingToOppRate: number | null;
    updatedAt: string | null;
    onboardingDealValue: string | null;
}

const toInput = (n: number | null) => (n === null ? "" : String(n));
/** « 45 » % from 0.45, without float noise. */
const rateToInput = (r: number | null) => (r === null ? "" : String(Math.round(r * 1000) / 10).replace(".", ","));
const parseNumber = (raw: string) => {
    const cleaned = raw.replace(/\s| |€|%/g, "").replace(",", ".");
    return cleaned === "" ? null : Number(cleaned);
};

const FIELD =
    "h-11 w-full rounded-xl border border-line bg-surface px-3 font-mono text-base tabular-nums text-ink outline-none transition-colors placeholder:text-ink-4 hover:border-line-strong focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus sm:text-sm";

export function AssumptionsForm({ value, onSaved }: { value: AssumptionsValue; onSaved: () => void }) {
    const dealId = useId();
    const rateId = useId();
    const [deal, setDeal] = useState(toInput(value.avgDealValue));
    const [rate, setRate] = useState(rateToInput(value.meetingToOppRate));
    const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({ kind: "idle" });

    useEffect(() => {
        setDeal(toInput(value.avgDealValue));
        setRate(rateToInput(value.meetingToOppRate));
    }, [value.avgDealValue, value.meetingToOppRate]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const dealValue = parseNumber(deal);
        const ratePct = parseNumber(rate);
        if (dealValue !== null && (!Number.isFinite(dealValue) || dealValue < 1)) {
            setState({ kind: "error", message: "Le panier moyen doit être un montant en euros, supérieur à 0." });
            return;
        }
        if (ratePct !== null && (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100)) {
            setState({ kind: "error", message: "Le taux doit être compris entre 1 et 100 %." });
            return;
        }
        setState({ kind: "saving" });
        try {
            const res = await fetch("/api/client/letter/assumptions", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    avgDealValue: dealValue === null ? null : Math.round(dealValue),
                    meetingToOppRate: ratePct === null ? null : ratePct / 100,
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) throw new Error(json?.error ?? "Enregistrement impossible");
            setState({ kind: "saved" });
            onSaved();
        } catch (err) {
            setState({ kind: "error", message: err instanceof Error ? err.message : "Enregistrement impossible" });
        }
    };

    const updated = value.updatedAt
        ? new Date(value.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
        : null;

    return (
        <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label htmlFor={dealId} className="text-sm font-medium text-ink">Panier moyen, en € HT</label>
                    <input
                        id={dealId}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="ex. 30 000"
                        value={deal}
                        onChange={(e) => { setDeal(e.target.value); setState({ kind: "idle" }); }}
                        className={FIELD}
                    />
                    <p className="text-xs text-ink-3">
                        Le montant moyen d’une affaire signée.
                        {value.onboardingDealValue && <> À l’onboarding, vous aviez indiqué « {value.onboardingDealValue} ».</>}
                    </p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor={rateId} className="text-sm font-medium text-ink">RDV tenus qui deviennent une opportunité, en %</label>
                    <input
                        id={rateId}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="ex. 40"
                        value={rate}
                        onChange={(e) => { setRate(e.target.value); setState({ kind: "idle" }); }}
                        className={FIELD}
                    />
                    <p className="text-xs text-ink-3">Sur 10 RDV tenus, combien deviennent une opportunité dans votre CRM.</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                    type="submit"
                    disabled={state.kind === "saving"}
                    className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    {state.kind === "saving" ? "Enregistrement…" : "Enregistrer"}
                </button>
                <p
                    aria-live="polite"
                    className={cn("text-xs", state.kind === "error" ? "text-danger-ink" : "text-ink-3")}
                >
                    {state.kind === "error"
                        ? state.message
                        : state.kind === "saved"
                            ? "Enregistré : le pipeline est recalculé avec ces valeurs."
                            : updated
                                ? `Dernière mise à jour le ${updated}.`
                                : "Vides tant que vous ne les avez pas renseignées."}
                </p>
            </div>
        </form>
    );
}
