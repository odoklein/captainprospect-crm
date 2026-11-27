"use client";

import { cn } from "@/lib/utils";
import { RATE_MULTIPLE, type Closers } from "@/lib/manager-pilotage/patterns";
import { num, rate } from "./format";

// « Qui mérite plus d'heures »: volume (calls per day worked) against Taux de
// RDV (RDV ÷ joints), with the two reference lines — 85 % of the quota and
// the team median. Top left is the money: strong closers who dial little.
// Pink (accent) only on the flagged ones.

const W = 560;
const H = 340;
const PAD = { left: 48, right: 18, top: 16, bottom: 40 };

export function CloserBoard({ data, windowDays }: { data: Closers; windowDays: number }) {
    const dots = data.points.filter((p) => p.rate !== null);
    const maxX = Math.max(data.quota * 1.2, ...dots.map((p) => p.perDay * 1.08));
    const maxY = Math.max(0.05, ...dots.map((p) => (p.rate ?? 0) * 1.15), (data.median ?? 0) * RATE_MULTIPLE * 1.2);
    const x = (v: number) => PAD.left + (v / maxX) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);
    const xTicks = ticks(maxX, 4);
    const yTicks = ticks(maxY, 4, 0.01);
    const flagLine = data.median !== null ? data.median * RATE_MULTIPLE : null;
    const maxGain = Math.max(0.0001, ...data.points.map((p) => p.onTable));
    const flagged = data.points.filter((p) => p.underUsed);

    return (
        <div className="flex flex-wrap items-stretch gap-4">
            <section aria-label="Volume contre taux de RDV" className="flex min-w-0 flex-[3_1_520px] flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-4">
                <div>
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">Qui mérite plus d’heures</h2>
                    <p className="mt-1 text-[12.5px] text-ink-3">
                        Appels par jour travaillé contre Taux de RDV (RDV ÷ joints), {windowDays} derniers jours ouvrés. En haut à gauche : de bons closers qui appellent
                        peu.
                    </p>
                </div>
                {dots.length ? (
                    <svg
                        viewBox={`0 0 ${W} ${H}`}
                        role="img"
                        aria-label={`${dots.length} SDR placés selon leur volume d’appels et leur taux de RDV.${flagged.length ? ` Sous-exploités : ${flagged.map((p) => p.name).join(", ")}.` : ""}`}
                        className="cp-viz block h-auto w-full"
                    >
                        {flagLine !== null && (
                            <rect x={PAD.left} y={PAD.top} width={Math.max(0, x(data.volumeLine) - PAD.left)} height={Math.max(0, y(flagLine) - PAD.top)} rx={8} fill="var(--ds-accent-soft)" />
                        )}
                        {yTicks.map((t) => (
                            <g key={`y${t}`}>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--ds-line-subtle)" />
                                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--ds-ink-3)] font-mono text-[11px]">
                                    {rate(t)}
                                </text>
                            </g>
                        ))}
                        {xTicks.map((t) => (
                            <text key={`x${t}`} x={x(t)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-[var(--ds-ink-3)] font-mono text-[11px]">
                                {num(t)}
                            </text>
                        ))}
                        <text x={(PAD.left + W - PAD.right) / 2} y={H - 6} textAnchor="middle" className="fill-[var(--ds-ink-3)] text-[12px]">
                            appels par jour
                        </text>
                        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ds-line-strong)" />
                        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--ds-line-strong)" />

                        <line x1={x(data.volumeLine)} x2={x(data.volumeLine)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ds-ink-3)" strokeDasharray="4 4" />
                        <text x={x(data.volumeLine) + 6} y={H - PAD.bottom - 8} className="fill-[var(--ds-ink-3)] text-[11.5px]">
                            85 % du quota ({num(data.volumeLine)})
                        </text>
                        {data.median !== null && (
                            <>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(data.median)} y2={y(data.median)} stroke="var(--ds-ink-3)" strokeDasharray="4 4" />
                                <text x={W - PAD.right - 4} y={y(data.median) - 6} textAnchor="end" className="fill-[var(--ds-ink-3)] text-[11.5px]">
                                    médiane {rate(data.median)}
                                </text>
                            </>
                        )}
                        {flagLine !== null && (
                            <text x={PAD.left + 10} y={PAD.top + 16} className="fill-[var(--ds-accent-soft-ink)] text-[12px] font-semibold">
                                Sous-exploités
                            </text>
                        )}
                        <text x={W - PAD.right - 8} y={PAD.top + 16} textAnchor="end" className="fill-[var(--ds-ink-3)] text-[12px]">
                            Moteurs
                        </text>

                        {dots.map((p) => {
                            const cx = x(p.perDay);
                            const cy = y(p.rate ?? 0);
                            const right = cx > W - 120;
                            return (
                                <g key={p.id}>
                                    <title>{`${p.name} · ${num(p.perDay)} appels/j · ${p.meetings} RDV sur ${p.reached} joints · ${rate(p.rate)}`}</title>
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={p.underUsed ? 8 : 6}
                                        fill={p.underUsed ? "var(--ds-accent)" : "var(--viz-1)"}
                                        stroke="var(--ds-surface)"
                                        strokeWidth={2.5}
                                        opacity={p.reached < 20 ? 0.45 : 1}
                                    />
                                    <text x={right ? cx - 12 : cx + 12} y={cy + 4} textAnchor={right ? "end" : "start"} className={cn("fill-[var(--ds-ink)] text-[12.5px]", p.underUsed && "font-semibold")}>
                                        {p.name}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                ) : (
                    <p className="py-10 text-center text-[13px] text-ink-3">Pas encore d’appel joint sur la fenêtre.</p>
                )}
                <p className="text-[11.5px] text-ink-3">
                    Sous-exploité : taux ≥ {num(RATE_MULTIPLE, 1)} × la médiane, moins de 85 % du quota, au moins 40 joints. Points pâles : moins de 20 joints.
                </p>
            </section>

            <section aria-label="RDV en jeu par semaine" className="flex min-w-0 flex-[2_1_340px] flex-col gap-2 rounded-panel border border-line bg-surface px-5 py-4">
                <div>
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">RDV en jeu</h2>
                    <p className="mt-1 text-[12.5px] text-ink-3">RDV par semaine gagnés si chacun appelait au quota ({data.quota}/j), à sa propre joignabilité et son propre taux.</p>
                </div>
                <ol className="flex flex-col gap-1">
                    {data.points.slice(0, 10).map((p) => (
                        <li key={p.id} className={cn("grid grid-cols-[minmax(0,1fr)_96px_52px] items-center gap-3 rounded-[10px] px-2.5 py-2", p.underUsed && "bg-accent-soft")}>
                            <div className="min-w-0">
                                <p className="truncate text-[13.5px] font-semibold text-ink">
                                    {p.name} {p.underUsed && <span className="ml-1 text-[11px] font-semibold text-accent-soft-ink">sous-exploité</span>}
                                </p>
                                <p className="truncate text-[12px] text-ink-3">
                                    {num(p.perDay)} appels/j · {rate(p.rate)} de RDV
                                </p>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                                <div className={cn("h-full rounded-full", p.underUsed ? "bg-accent" : "bg-info")} style={{ width: `${(p.onTable / maxGain) * 100}%` }} />
                            </div>
                            <p className="text-right font-mono text-[14px] tabular-nums text-ink">{p.onTable >= 0.05 ? `+${num(p.onTable, 1)}` : "—"}</p>
                        </li>
                    ))}
                </ol>
                {!data.points.length && <p className="py-6 text-center text-[13px] text-ink-3">Aucun SDR n’a appelé sur la fenêtre.</p>}
            </section>
        </div>
    );
}

function ticks(max: number, count: number, min = 1): number[] {
    const raw = max / count;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    const step = Math.max(min, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow);
    const out: number[] = [];
    for (let t = 0; t <= max + 1e-9; t += step) out.push(Number(t.toFixed(6)));
    return out;
}
