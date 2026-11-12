/**
 * Do the figures of a visual come from the sources the turn consulted?
 *
 * Same spirit as the answer verifier, but for chart data: a value is accepted
 * when a fact of the turn's evidence has it (at the precision written), or when
 * it is a plain derivation of two facts of one source — a ratio in %, a sum or
 * a difference. What cannot be found is reported, never silently dropped: the
 * visual is still shown, flagged, and the model is told to fix or remove it.
 */

import type { Fact } from "@/lib/ai/agent/evidence/facts";
import { visualNumbers, type VisualSpec } from "./spec";

/** Facts are capped per source; past the cap a missing value proves nothing. */
const FACT_CAP = 300;
const PAIR_BUDGET = 40;

export interface VisualCheck {
    checked: number;
    unverified: number[];
    /** True when a source was too large to hold every figure: the check is partial. */
    partial: boolean;
}

function decimalsOf(value: number): number {
    const text = String(value);
    const dot = text.indexOf(".");
    return dot < 0 ? 0 : Math.min(4, text.length - dot - 1);
}

function near(claim: number, value: number): boolean {
    return Math.abs(claim - value) <= 0.5 * 10 ** -decimalsOf(claim) + 1e-9;
}

export function checkVisualNumbers(spec: VisualSpec, sources: Array<{ facts: Fact[] }>): VisualCheck {
    const numbers = [...new Set(visualNumbers(spec))];
    const partial = sources.some((s) => s.facts.length >= FACT_CAP);
    if (sources.length === 0) return { checked: numbers.length, unverified: numbers, partial: false };

    const direct = sources.flatMap((s) => s.facts.map((f) => f.value));
    const absolute = direct.map(Math.abs);
    let budget = PAIR_BUDGET;
    const unverified: number[] = [];

    for (const n of numbers) {
        if (direct.some((v) => near(n, v)) || absolute.some((v) => near(Math.abs(n), v))) continue;
        if (budget > 0) {
            budget -= 1;
            if (derived(n, sources)) continue;
        }
        unverified.push(n);
    }
    // A small integer that merely counts rows (rank, index) is not a claim.
    const meaningful = unverified.filter((n) => !(Number.isInteger(n) && n >= 0 && n <= 1));
    return { checked: numbers.length, unverified: partial ? [] : meaningful, partial };
}

function derived(n: number, sources: Array<{ facts: Fact[] }>): boolean {
    for (const { facts } of sources) {
        const values = facts.slice(0, 120).map((f) => f.value);
        for (const a of values) {
            for (const b of values) {
                if (b !== 0 && near(n, (a / b) * 100)) return true;
                if (near(n, a + b) || near(n, a - b)) return true;
            }
        }
    }
    return false;
}
