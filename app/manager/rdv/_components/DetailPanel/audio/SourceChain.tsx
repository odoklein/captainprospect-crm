"use client";

import { Fragment } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2, Minus, Radio } from "lucide-react";
import { ORIGIN_META, SOURCE_ORDER, type CallSourceKey, type ChainStepState } from "./call-model";

export interface ChainStep {
  state: ChainStepState;
  /** Second line under the source name. */
  detail?: string;
}

const DEFAULT_DETAIL: Record<ChainStepState, string> = {
  checking: "Recherche…",
  waiting: "En attente",
  found: "Appel trouvé",
  empty: "Aucun appel",
  skipped: "Non interrogé",
  error: "Indisponible",
  pending: "Audio en route",
};

function StepIcon({ state }: { state: ChainStepState }) {
  if (state === "checking") return <Loader2 size={13} className="rdv-spin" />;
  if (state === "found") return <Check size={10} strokeWidth={3} />;
  if (state === "error") return <AlertTriangle size={9} strokeWidth={2.5} />;
  if (state === "pending") return <Radio size={9} strokeWidth={2.5} />;
  return <Minus size={10} strokeWidth={2.5} />;
}

/**
 * The order the RDV's call is looked for in — Call Vault, then the Twilio softphone,
 * then Allo — and what each source answered. Makes "why no audio?" self-explanatory.
 */
export function SourceChain({ steps }: { steps: Partial<Record<CallSourceKey, ChainStep>> }) {
  return (
    <div className="rdv-chain" role="list" aria-label="Sources interrogées, dans l'ordre">
      {SOURCE_ORDER.map((source, i) => {
        const step = steps[source] ?? { state: "waiting" as const };
        return (
          <Fragment key={source}>
            {i > 0 && (
              <span className="rdv-chain-arrow" aria-hidden="true">
                <ChevronRight size={14} />
              </span>
            )}
            <div className="rdv-chain-step" data-state={step.state} role="listitem" title={ORIGIN_META[source].hint}>
              <div className="rdv-chain-step-top">
                <span className="rdv-chain-icon">
                  <StepIcon state={step.state} />
                </span>
                {ORIGIN_META[source].label}
              </div>
              <span className="rdv-chain-step-state">{step.detail ?? DEFAULT_DETAIL[step.state]}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
