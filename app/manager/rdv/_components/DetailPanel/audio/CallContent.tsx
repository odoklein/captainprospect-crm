"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, MessagesSquare, Search, Sparkles } from "lucide-react";
import { parseSummary, parseTranscript } from "./call-model";

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => undefined);
    },
  ];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={() => copy(text)} aria-label={label}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

/** The provider's / AI summary of the call, with its « • » lists rendered as lists. */
export function CallSummaryCard({ summary }: { summary: string }) {
  const blocks = useMemo(() => parseSummary(summary), [summary]);
  return (
    <section className="rdv-audio-card" aria-label="Résumé de l'appel">
      <div className="rdv-audio-section-head">
        <span className="rdv-audio-section-title">
          <Sparkles size={14} style={{ color: "var(--rose)" }} /> Résumé de l&apos;appel
        </span>
        <CopyButton text={summary} label="Copier le résumé" />
      </div>
      <div className="rdv-summary">
        {blocks.map((b, i) =>
          b.kind === "p" ? (
            <p key={i}>{b.text}</p>
          ) : (
            <div key={i} className="rdv-summary-list">
              {b.title && <div className="rdv-summary-list-title">{b.title}</div>}
              <ul>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const at = lower.indexOf(needle, i);
    if (at < 0) break;
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={k++}>{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  out.push(text.slice(i));
  return out;
}

/** The conversation, as SDR / prospect turns when the transcript carries speakers. Searchable. */
export function TranscriptCard({ transcription }: { transcription: string }) {
  const turns = useMemo(() => parseTranscript(transcription), [transcription]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const q = query.trim();

  const visibleTurns = turns && q ? turns.filter((t) => t.text.toLowerCase().includes(q.toLowerCase())) : turns;
  const count = turns?.length ?? 0;
  const collapsible = !q && (turns ? count > 5 : transcription.length > 700);
  const collapsed = collapsible && !expanded;

  return (
    <section className="rdv-audio-card" aria-label="Transcription de l'appel">
      <div className="rdv-audio-section-head">
        <span className="rdv-audio-section-title">
          <MessagesSquare size={14} style={{ color: "var(--accent)" }} /> Transcription
          <span className="rdv-audio-muted" style={{ fontWeight: 500 }}>
            {turns ? `${count} réplique${count > 1 ? "s" : ""}` : `${transcription.length.toLocaleString("fr-FR")} caractères`}
          </span>
        </span>
        <CopyButton text={transcription} label="Copier la transcription" />
      </div>

      {(turns ? count > 3 : transcription.length > 400) && (
        <div className="rdv-transcript-tools">
          <label className="rdv-transcript-search">
            <Search size={13} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher dans la conversation (budget, délai, concurrent…)"
              aria-label="Chercher dans la transcription"
            />
          </label>
          {q && turns && (
            <span className="rdv-audio-muted" style={{ whiteSpace: "nowrap" }}>
              {visibleTurns?.length ?? 0} résultat{(visibleTurns?.length ?? 0) > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="rdv-transcript rdv-scrollbar" data-collapsed={collapsed}>
        {turns ? (
          visibleTurns && visibleTurns.length > 0 ? (
            visibleTurns.map((t, i) => (
              <div key={i} className="rdv-turn" data-speaker={t.speaker}>
                {t.label && <span className="rdv-turn-label">{t.label}</span>}
                <div className="rdv-turn-text">{highlight(t.text, q)}</div>
              </div>
            ))
          ) : (
            <p className="rdv-audio-muted" style={{ textAlign: "center", padding: "12px 0" }}>
              Aucune réplique ne contient « {q} ».
            </p>
          )
        ) : (
          <pre className="rdv-transcript-plain">{highlight(transcription, q)}</pre>
        )}
      </div>

      {collapsible && (
        <div className="rdv-transcript-more">
          <button type="button" className="rdv-btn rdv-btn-ghost rdv-btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Réduire" : turns ? `Afficher les ${count} répliques` : "Afficher tout"}
          </button>
        </div>
      )}
    </section>
  );
}
