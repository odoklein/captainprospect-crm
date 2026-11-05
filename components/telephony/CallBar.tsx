"use client";

// The call strip of the softphone: one line, docked bottom-centre, above page
// content. Every control maps to a real Twilio operation (mute, DTMF, hang up);
// once the call ends it shows Twilio's own outcome and offers a redial.

import { useEffect, useState } from "react";
import {
  Grid3x3,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatClock,
  formatDuration,
  formatPhone,
} from "@/components/incoming-calls/useIncomingCalls";
import { TELEPHONY_STATUS_LABELS } from "@/lib/telephony/status";
import {
  isCallActive,
  useSoftphone,
  type SoftphoneCall,
} from "./SoftphoneProvider";

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "0",
  "#",
] as const;

function useNow(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return now;
}

function statusLine(call: SoftphoneCall, now: number): string {
  switch (call.phase) {
    case "preparing":
    case "connecting":
      return "Connexion…";
    case "ringing":
      return `Sonnerie · ${formatClock((now - call.startedAt) / 1000)}`;
    case "live":
      return `En ligne · ${formatClock((now - (call.answeredAt ?? now)) / 1000)}`;
    case "failed":
      return call.error ?? "Échec de l'appel";
    case "ended": {
      if (call.outcome && call.outcome !== "COMPLETED")
        return TELEPHONY_STATUS_LABELS[call.outcome];
      const talk =
        call.durationSec ??
        (call.answeredAt && call.endedAt
          ? Math.round((call.endedAt - call.answeredAt) / 1000)
          : null);
      if (talk != null && call.answeredAt)
        return `Terminé · ${formatDuration(talk)}`;
      return call.outcome
        ? TELEPHONY_STATUS_LABELS[call.outcome]
        : "Appel terminé";
    }
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return (
    node.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)
  );
}

export function CallBar() {
  const { call, recording, hangup, toggleMute, sendDigit, dismiss, dial } =
    useSoftphone();
  const active = isCallActive(call);
  const now = useNow(active);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const live = call?.phase === "live";
  // The provider keys this component by call, so keypad state starts fresh each call.
  const showKeypad = keypadOpen && live;

  // Physical keys feed DTMF while the keypad is open (IVR menus, extensions).
  useEffect(() => {
    if (!showKeypad) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key === "Escape") {
        setKeypadOpen(false);
        return;
      }
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        sendDigit(e.key);
        setTyped((t) => (t + e.key).slice(-16));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showKeypad, sendDigit]);

  if (!call) return null;

  const { target } = call;
  const title = target.label?.trim() || formatPhone(target.phone);
  const subtitle = [
    target.label?.trim() ? formatPhone(target.phone) : null,
    target.sublabel?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const press = (digit: string) => {
    sendDigit(digit);
    setTyped((t) => (t + digit).slice(-16));
  };

  return (
    <div
      role="region"
      aria-label="Appel téléphonique"
      className="fixed bottom-4 left-1/2 z-[95] w-[min(600px,calc(100vw-32px))] -translate-x-1/2"
    >
      {showKeypad && (
        <div className="mb-2 ml-auto w-[216px] rounded-panel border border-inverse-line bg-inverse p-3 text-inverse-ink shadow-overlay animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div
            className="mb-2 h-7 truncate rounded-control bg-inverse-raised px-2 text-center font-mono text-[15px] leading-7 tracking-[0.2em] tabular-nums"
            aria-live="polite"
          >
            {typed || (
              <span className="text-inverse-ink-3 tracking-normal text-[12px] font-sans">
                Clavier
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="h-10 rounded-control bg-inverse-raised font-mono text-[15px] font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-3 rounded-panel border border-inverse-line bg-inverse py-2 pl-3 pr-2 text-inverse-ink shadow-overlay",
          "animate-in fade-in slide-in-from-bottom-2 duration-150",
        )}
      >
        <StatusGlyph call={call} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[13px] font-semibold leading-tight">
            <span className="truncate">{title}</span>
            {recording && live && (
              <span className="shrink-0 rounded-sm border border-inverse-line px-1 text-[10px] font-medium uppercase tracking-wide text-inverse-ink-2">
                Enregistré
              </span>
            )}
          </p>
          <p
            className={cn(
              "truncate text-[11px] leading-tight tabular-nums",
              call.phase === "failed" ? "text-red-200" : "text-inverse-ink-2",
            )}
            aria-live="polite"
          >
            {statusLine(call, now)}
            {subtitle && call.phase !== "failed" ? (
              <span className="text-inverse-ink-3"> · {subtitle}</span>
            ) : null}
          </p>
        </div>

        {active ? (
          <div className="flex shrink-0 items-center gap-1">
            <BarButton
              label={
                showKeypad
                  ? "Masquer le clavier"
                  : "Clavier (touches 0-9, *, #)"
              }
              pressed={showKeypad}
              disabled={!live}
              onClick={() => setKeypadOpen((v) => !v)}
            >
              <Grid3x3 className="h-4 w-4" />
            </BarButton>
            <BarButton
              label={call.muted ? "Réactiver le micro" : "Couper le micro"}
              pressed={call.muted}
              disabled={!live}
              onClick={toggleMute}
            >
              {call.muted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </BarButton>
            <button
              type="button"
              onClick={hangup}
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-control bg-danger px-3 text-[12px] font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <PhoneOff className="h-4 w-4" />
              Raccrocher
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {call.retryable && (
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  dial(target);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-inverse-line px-3 text-[12px] font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {call.phase === "failed" ? "Réessayer" : "Rappeler"}
              </button>
            )}
            <BarButton label="Fermer" onClick={dismiss}>
              <X className="h-4 w-4" />
            </BarButton>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusGlyph({ call }: { call: SoftphoneCall }) {
  const live = call.phase === "live";
  const waiting =
    call.phase === "preparing" ||
    call.phase === "connecting" ||
    call.phase === "ringing";
  const failed =
    call.phase === "failed" ||
    (call.phase === "ended" && call.outcome && call.outcome !== "COMPLETED");
  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-inverse-raised"
      aria-hidden
    >
      {waiting && (
        <span className="absolute inset-0 rounded-full bg-white/15 animate-ping" />
      )}
      {live ? (
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      ) : failed ? (
        <PhoneOff className="h-3.5 w-3.5 text-red-200" />
      ) : (
        <Phone
          className={cn(
            "relative h-3.5 w-3.5",
            waiting ? "text-inverse-ink" : "text-inverse-ink-3",
          )}
        />
      )}
    </span>
  );
}

function BarButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-control text-inverse-ink-2 hover:bg-white/10 hover:text-inverse-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-40",
        pressed && "bg-white/15 text-inverse-ink",
      )}
    >
      {children}
    </button>
  );
}
