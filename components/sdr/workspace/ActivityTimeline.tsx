"use client";
import { useMemo, useState } from "react";
import { CalendarCheck2, Mail, Phone, ArrowRightLeft, Sparkles, Clock3, ChevronDown } from "lucide-react";
import { useMailboxActivity } from "./useMailboxActivity";
import { cn } from "@/lib/utils";
export interface ActivityEvent { id: string; at: string; kind: "call" | "email" | "meeting" | "status"; title: string; actor?: string | null; note?: string | null; summary?: string | null; duration?: number | null; status?: string | null; contactName?: string | null; scheduledAt?: string | null; scheduledLabel?: string | null; }
export interface ActivityRecord { id: string; createdAt: string; result: string; channel?: string; note?: string | null; duration?: number | null; callSummary?: string | null; callbackDate?: string | null; sdr?: { name: string }; contact?: { firstName?: string | null; lastName?: string | null } | null; }
const CALLBACK_RESULTS = new Set(["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"]);
/** What the date on an action means: a callback slot or a meeting slot. */
function scheduledLabel(a: ActivityRecord, callbackCodes?: Set<string>): string | null {
    if (!a.callbackDate) return null;
    if (a.result === "MEETING_BOOKED") return "RDV le";
    if (a.result === "MEETING_CANCELLED") return "RDV prévu le";
    if ((callbackCodes ?? CALLBACK_RESULTS).has(a.result)) return "Rappel prévu le";
    return null;
}
export function actionsToEvents(actions: ActivityRecord[], labels: Record<string,string> = {}, callbackCodes?: Set<string>): ActivityEvent[] {
    return actions.map(a=>({scheduledLabel:scheduledLabel(a, callbackCodes),scheduledAt:scheduledLabel(a, callbackCodes) ? a.callbackDate : null,id:a.id,at:a.createdAt,kind:a.result.startsWith("MEETING_") ? "meeting" : a.channel === "EMAIL" || a.result === "ENVOIE_MAIL" ? "email" : a.channel === "CALL" ? "call" : "status",title: labels[a.result] || a.result.replaceAll("_"," "),status:labels[a.result] || a.result.replaceAll("_"," "),actor:a.sdr?.name,note:a.note,summary:a.callSummary,duration:a.duration,contactName:[a.contact?.firstName,a.contact?.lastName].filter(Boolean).join(" ")}));
}
const meta = {call:{icon:Phone,label:"Appel",tone:"teal"},email:{icon:Mail,label:"Email",tone:"blue"},meeting:{icon:CalendarCheck2,label:"Rendez-vous",tone:"violet"},status:{icon:ArrowRightLeft,label:"Statut",tone:"amber"}};
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
export function ActivityTimeline({ events: recordedEvents, companyId, loading, onOpen, title = "Fil d’activité", emptyText = "Aucune interaction enregistrée.", truncated = false }: { events: ActivityEvent[]; companyId?: string; loading?: boolean; onOpen?: (event: ActivityEvent)=>void; title?: string; emptyText?: string; /** Only the latest actions were loaded: the count is a floor. */ truncated?: boolean }) {
    // Refetch the mailbox when a new action is logged (an email just sent shows up).
    const mailbox = useMailboxActivity(companyId, recordedEvents[0]?.id);
    const events = useMemo(() => {
        // "Mail envoyé" logged by hand and the real email of the same moment are one exchange.
        const sentMails = mailbox.events.filter(e => e.actor === "Email envoyé").map(e => Date.parse(e.at));
        const recorded = recordedEvents.filter(e => !(e.kind === "email" && sentMails.some(t => Math.abs(t - Date.parse(e.at)) < DEDUPE_WINDOW_MS)));
        return [...recorded, ...mailbox.events];
    }, [recordedEvents, mailbox.events]);
    const [filter,setFilter]=useState("all");const [all,setAll]=useState(false);
    const sorted=useMemo(()=>[...events].filter(e=>filter==="all" || e.kind===filter).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),[events,filter]);
    const visible=all ? sorted : sorted.slice(0,5);
    return <section className="sdr-activity" aria-label={title} aria-busy={loading}>
        <header className="sdr-component-header"><div><span className="sdr-eyebrow">Chaque échange compte</span><h3>{title}</h3></div><span className="sdr-count" title={truncated ? "Derniers échanges chargés" : undefined}>{events.length}{truncated ? "+" : ""}</span></header>
        <div className="sdr-filter-pills" aria-label="Filtrer les activités">{[["all","Tout"],["call","Appels"],["email","Emails"],["meeting","RDV"],["status","Statuts"]].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setAll(false);}}>{label}</button>)}</div>
        {loading && !events.length ? <p className="sdr-empty">Chargement des échanges…</p> : !visible.length ? <p className="sdr-empty">{emptyText}</p> : <ol className="sdr-timeline">{visible.map(e=>{const m=meta[e.kind];const Icon=m.icon;return <li key={e.id} className="sdr-timeline-event"><span className={cn("sdr-event-icon",`sdr-tone-${m.tone}`)}><Icon size={14}/></span><div className="sdr-event-card"><div className="sdr-event-top"><span>{m.label}</span><time dateTime={e.at}>{new Date(e.at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>{onOpen ? <button className="sdr-event-title" type="button" onClick={()=>onOpen(e)}>{e.title}</button> : <h4 className="sdr-event-title">{e.title}</h4>}<div className="sdr-event-meta">{[e.contactName,e.actor].filter(Boolean).join(" · ")}{e.duration!=null && <span><Clock3 size={11}/>{Math.floor(e.duration/60)} min {e.duration%60 ? `${e.duration%60} s` : ""}</span>}</div>{e.scheduledAt && <p className="sdr-event-meta"><CalendarCheck2 size={11}/>{e.scheduledLabel} {new Date(e.scheduledAt).toLocaleString("fr-FR",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>}{e.note && <p className="sdr-event-note">{e.note}</p>}{e.summary && <details className="sdr-event-summary"><summary><Sparkles size={12}/> Résumé IA</summary><p>{e.summary}</p></details>}</div></li>})}</ol>}
        {mailbox.failed && <p className="sdr-empty">Emails indisponibles pour le moment. Les activités CRM restent accessibles.</p>}
        {sorted.length>5 && <button className="sdr-more" type="button" onClick={()=>setAll(v=>!v)}><ChevronDown size={14}/>{all ? "Réduire le fil" : `Voir les ${sorted.length-5} autres échanges`}</button>}
    </section>;
}
