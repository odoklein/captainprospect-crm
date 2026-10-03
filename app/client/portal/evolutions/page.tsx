"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";
import type { ClientEvolutions, RoadmapItem } from "@/lib/tickets/public";
import s from "./evolutions.module.css";

type Entry = Omit<RoadmapItem, "completedAt" | "updatedAt"> & { completedAt: string | null; updatedAt: string };
type Payload = Omit<ClientEvolutions, "inProgress" | "upcoming" | "delivered"> & {
    inProgress: Entry[];
    upcoming: Entry[];
    delivered: Entry[];
};

const ZONE = "Europe/Paris";
const NEW_WINDOW_MS = 14 * 86_400_000;
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: ZONE });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: ZONE });
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

const cssVar = (color: string) => ({ "--c": color }) as CSSProperties;

function relative(iso: string, nowMs: number): string {
    const days = Math.round((new Date(iso).getTime() - nowMs) / 86_400_000);
    const abs = Math.abs(days);
    if (abs < 7) return rtf.format(days, "day");
    if (abs < 30) return rtf.format(Math.round(days / 7), "week");
    if (abs < 365) return rtf.format(Math.round(days / 30), "month");
    return rtf.format(Math.round(days / 365), "year");
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function DeliveredItem({ item, nowMs }: { item: Entry; nowMs: number }) {
    const isNew = !!item.completedAt && nowMs - new Date(item.completedAt).getTime() < NEW_WINDOW_MS;
    return (
        <li className={s.item}>
            <div className={s.itemTitle}>{item.title}</div>
            {item.description && <div className={s.itemText}>{item.description}</div>}
            <div className={s.itemFoot}>
                {item.completedAt && <span>Livré le {dayFmt.format(new Date(item.completedAt))}</span>}
                {isNew && <span className={s.newDot}>· Nouveau</span>}
            </div>
        </li>
    );
}

function ComingColumn({ title, items, color, live }: { title: string; items: Entry[]; color: string; live: boolean }) {
    return (
        <div className={s.soonCol} style={cssVar(color)}>
            <div className={s.soonHead}>
                <span className={live ? s.pulse : s.still} />
                {title}
                <span className={s.soonCount}>{items.length}</span>
            </div>
            {items.length === 0 ? (
                <p className={s.soonEmpty}>Rien pour le moment.</p>
            ) : (
                <ul className={s.soonList}>
                    {items.map((item) => (
                        <li key={item.id}>
                            <div className={s.soonTitle}>{item.title}</div>
                            {item.description && <div className={s.soonText}>{item.description}</div>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function ClientPortalEvolutionsPage() {
    const [data, setData] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/client/evolutions", { cache: "no-store" });
                const json = await res.json();
                if (cancelled) return;
                if (json.success) {
                    setData(json.data);
                    setError(null);
                } else {
                    setError(json.error ?? "Impossible de charger les évolutions.");
                }
            } catch {
                if (!cancelled) setError("Impossible de charger les évolutions.");
            }
        })();
        return () => { cancelled = true; };
    }, [reloadKey]);

    const nowMs = data ? new Date(data.generatedAt).getTime() : 0;

    /** Deliveries grouped by month, newest first — each month reads as one release. */
    const months = useMemo(() => {
        const out: { label: string; items: Entry[] }[] = [];
        for (const item of data?.delivered ?? []) {
            if (!item.completedAt) continue;
            const label = monthFmt.format(new Date(item.completedAt));
            const last = out[out.length - 1];
            if (last?.label === label) last.items.push(item);
            else out.push({ label, items: [item] });
        }
        return out;
    }, [data]);

    const comingCount = (data?.inProgress.length ?? 0) + (data?.upcoming.length ?? 0);
    const deliveredCount = data?.delivered.length ?? 0;

    return (
        <div className={s.root}>
            <div className={s.wrap}>
                <header className={s.header}>
                    <div className={s.eyebrow}>Évolutions</div>
                    <h1 className={s.title}>Ce que nous construisons pour vous</h1>
                    <p className={s.subtitle}>
                        Améliorations en cours, à venir et déjà livrées sur votre espace.
                    </p>
                    {data && (comingCount > 0 || deliveredCount > 0) && (
                        <div className={s.summary}>
                            {data.inProgress.length > 0 && (
                                <span className={s.summaryChip}><strong>{data.inProgress.length}</strong> en cours</span>
                            )}
                            {data.upcoming.length > 0 && (
                                <span className={s.summaryChip}><strong>{data.upcoming.length}</strong> à venir</span>
                            )}
                            {deliveredCount > 0 && (
                                <span className={s.summaryChip}>
                                    <CheckCircle2 size={13} style={{ color: "var(--ds-primary)" }} />
                                    <strong>{deliveredCount}</strong> livrée{deliveredCount > 1 ? "s" : ""}
                                </span>
                            )}
                        </div>
                    )}
                </header>

                {error && !data ? (
                    <div className={s.state}>
                        <div className={s.stateTitle}>Une erreur est survenue</div>
                        <div className={s.stateText}>{error}</div>
                        <button type="button" className={s.retry} onClick={() => setReloadKey((k) => k + 1)}>Réessayer</button>
                    </div>
                ) : !data ? (
                    <div style={{ display: "grid", gap: 16 }}>
                        <div className={s.shimmer} style={{ height: 150 }} />
                        <div className={s.shimmer} style={{ height: 240 }} />
                    </div>
                ) : comingCount === 0 && deliveredCount === 0 ? (
                    <div className={s.state}>
                        <div className={s.stateTitle}>Aucune évolution publiée pour l&apos;instant</div>
                        <div className={s.stateText}>Les améliorations prévues et livrées pour votre espace apparaîtront ici.</div>
                    </div>
                ) : (
                    <div className={s.timeline}>
                        {comingCount > 0 && (
                            <article className={s.entry}>
                                <aside className={s.meta}>
                                    <div className={s.metaTitle}>Prochainement</div>
                                    <div className={s.metaSub}>Ce que nous préparons en ce moment</div>
                                    <div className={s.tags}><span className={`${s.tag} ${s.tagSoon}`}>En préparation</span></div>
                                </aside>
                                <div className={s.body}>
                                    <div className={s.soonGrid}>
                                        <ComingColumn title="En cours" items={data.inProgress} color="#3b6fe0" live />
                                        <ComingColumn title="À venir" items={data.upcoming} color="var(--ds-ink-4)" live={false} />
                                    </div>
                                </div>
                            </article>
                        )}

                        {months.map((month, index) => {
                            const [featured, ...rest] = month.items;
                            const latest = month.items[0].completedAt!;
                            const hasNew = month.items.some((i) => nowMs - new Date(i.completedAt!).getTime() < NEW_WINDOW_MS);
                            const isLatest = index === 0;
                            const listed = isLatest ? rest : month.items;
                            return (
                                <article key={month.label} className={s.entry} style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}>
                                    <aside className={s.meta}>
                                        <div className={s.metaTitle}>{month.label}</div>
                                        <div className={s.metaSub}>
                                            {relative(latest, nowMs)} · {plural(month.items.length, "livraison")}
                                        </div>
                                        {hasNew && <div className={s.tags}><span className={s.tag}>Nouveau</span></div>}
                                    </aside>
                                    <div className={s.body}>
                                        {isLatest && (
                                            <div className={s.feature}>
                                                <span className={s.featureLabel}>
                                                    <CheckCircle2 size={13} /> Dernière livraison · {dayFmt.format(new Date(featured.completedAt!))}
                                                </span>
                                                <h2 className={s.featureTitle}>{featured.title}</h2>
                                                {featured.description && <p className={s.featureText}>{featured.description}</p>}
                                            </div>
                                        )}
                                        {!isLatest && (
                                            <p className={s.lead}>
                                                {plural(month.items.length, "amélioration")} livrée{month.items.length > 1 ? "s" : ""} sur votre espace en {month.label}.
                                            </p>
                                        )}
                                        {listed.length > 0 && (
                                            <>
                                                <h3 className={s.h3}>{isLatest ? "Aussi livré ce mois-ci" : "Dans cette livraison"}</h3>
                                                <ul className={s.list}>
                                                    {listed.map((item) => <DeliveredItem key={item.id} item={item} nowMs={nowMs} />)}
                                                </ul>
                                            </>
                                        )}
                                    </div>
                                </article>
                            );
                        })}

                        {months.length === 0 && (
                            <article className={s.entry}>
                                <aside className={s.meta}><div className={s.metaTitle}>Livraisons</div></aside>
                                <div className={s.body}><p className={s.lead}>Les premières améliorations livrées apparaîtront ici.</p></div>
                            </article>
                        )}
                    </div>
                )}

                <div className={s.idea}>
                    <div>
                        <div className={s.ideaTitle}>Une idée pour votre espace ?</div>
                        <div className={s.ideaText}>Dites-nous ce qui vous ferait gagner du temps : vos retours orientent nos prochaines évolutions.</div>
                    </div>
                    <Link href="/client/contact" className={s.ideaBtn}><MessageSquarePlus size={15} /> Nous écrire</Link>
                </div>
            </div>
        </div>
    );
}
