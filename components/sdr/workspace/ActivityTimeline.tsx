"use client";
import { useMemo, useState } from "react";
import { CalendarCheck2, Mail, Phone, ArrowRightLeft, Sparkles, Clock3, ChevronDown } from "lucide-react";
import { useMailboxActivity } from "./useMailboxActivity";
import { cn } from "@/lib/utils";
export interface ActivityEvent { id: string; at: string; kind: "call" | "email" | "meeting" | "status"; title: string; actor?: string | null; note?: string | null; summary?: string | null; duration?: number | null; status?: string | null; contactName?: string | null; }
export interface ActivityRecord { id: string; createdAt: string; result: string; channel?: string; note?: string | null; duration?: number | null; callSummary?: string | null; sdr?: { name: string }; contact?: { firstName?: string | null; lastName?: string | null } | null; }
export function actionsToEvents(actions: ActivityRecord[], labels: Record<string,string> = {}): ActivityEvent[] {
    return actions.map(a=>({id:a.id,at:a.createdAt,kind:a.result.startsWith("MEETING_") ? "meeting" : a.channel === "EMAIL" || a.result === "ENVOIE_MAIL" ? "email" : a.channel === "CALL" ? "call" : "status",title: labels[a.result] || a.result.replaceAll("_"," "),status:labels[a.result] || a.result.replaceAll("_"," "),actor:a.sdr?.name,note:a.note,summary:a.callSummary,duration:a.duration,contactName:[a.contact?.firstName,a.contact?.lastName].filter(Boolean).join(" ")}));
}
const meta = {call:{icon:Phone,label:"Appel",tone:"teal"},email:{icon:Mail,label:"Email",tone:"blue"},meeting:{icon:CalendarCheck2,label:"Rendez-vous",tone:"violet"},status:{icon:ArrowRightLeft,label:"Statut",tone:"amber"}};
export function ActivityTimeline({ events: recordedEvents, companyId, loading, onOpen, title = "Fil d’activité", emptyText = "Aucune interaction enregistrée." }: { events: ActivityEvent[]; companyId?: string; loading?: boolean; onOpen?: (event: ActivityEvent)=>void; title?: string; emptyText?: string }) {
    const mailbox = useMailboxActivity(companyId);
    const events = useMemo(() => [...recordedEvents, ...mailbox.events], [recordedEvents, mailbox.events]);
    const [filter,setFilter]=useState("all");const [all,setAll]=useState(false);
    const sorted=useMemo(()=>[...events].filter(e=>filter==="all" || e.kind===filter).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),[events,filter]);
    const visible=all ? sorted : sorted.slice(0,5);
    return <section className="sdr-activity" aria-label={title} aria-busy={loading}>
        <header className="sdr-component-header"><div><span className="sdr-eyebrow">Chaque échange compte</span><h3>{title}</h3></div><span className="sdr-count">{events.length}</span></header>
        <div className="sdr-filter-pills" aria-label="Filtrer les activités">{[["all","Tout"],["call","Appels"],["email","Emails"],["meeting","RDV"],["status","Statuts"]].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setAll(false);}}>{label}</button>)}</div>
        {loading && !events.length ? <p className="sdr-empty">Chargement des échanges…</p> : !visible.length ? <p className="sdr-empty">{emptyText}</p> : <ol className="sdr-timeline">{visible.map(e=>{const m=meta[e.kind];const Icon=m.icon;return <li key={e.id} className="sdr-timeline-event"><span className={cn("sdr-event-icon",`sdr-tone-${m.tone}`)}><Icon size={14}/></span><div className="sdr-event-card"><div className="sdr-event-top"><span>{m.label}</span><time dateTime={e.at}>{new Date(e.at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>{onOpen ? <button className="sdr-event-title" type="button" onClick={()=>onOpen(e)}>{e.title}</button> : <h4 className="sdr-event-title">{e.title}</h4>}<div className="sdr-event-meta">{[e.contactName,e.actor].filter(Boolean).join(" · ")}{e.duration!=null && <span><Clock3 size={11}/>{Math.floor(e.duration/60)} min {e.duration%60 ? `${e.duration%60} s` : ""}</span>}</div>{e.note && <p className="sdr-event-note">{e.note}</p>}{e.summary && <details className="sdr-event-summary"><summary><Sparkles size={12}/> Résumé IA</summary><p>{e.summary}</p></details>}</div></li>})}</ol>}
        {mailbox.failed && <p className="sdr-empty">Emails indisponibles pour le moment. Les activités CRM restent accessibles.</p>}
        {sorted.length>5 && <button className="sdr-more" type="button" onClick={()=>setAll(v=>!v)}><ChevronDown size={14}/>{all ? "Réduire le fil" : `Voir les ${sorted.length-5} autres échanges`}</button>}
    </section>;
}
