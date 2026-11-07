"use client";
import { useState } from "react";
import { ArrowUpRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
export function websiteDomain(website?: string | null): string | null {
    if (!website?.trim()) return null;
    try { const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); return ["http:","https:"].includes(url.protocol) && url.hostname.includes(".") ? url.hostname.replace(/^www\./, "") : null; } catch { return null; }
}
export function ProspectIdentity({ name, company, role, website, compact = false, heading = false, className }: { name?: string | null; company?: string | null; role?: string | null; website?: string | null; compact?: boolean; heading?: boolean; className?: string }) {
    const domain = websiteDomain(website);
    const [failed, setFailed] = useState<string | null>(null);
    const label = name || company || "Prospect";
    const initials = label.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase();
    return <div className={cn("sdr-identity", compact && "sdr-identity-compact", className)}>
        <span className="sdr-identity-avatar" aria-hidden>{initials}<span className="sdr-company-mark">{domain && failed !== domain ? <img src={`https://${domain}/favicon.ico`} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(domain)} /> : <Building2 size={12}/>}</span></span>
        <div className="min-w-0 flex-1">{heading ? <h1 className="sdr-identity-name">{label}</h1> : <div className="sdr-identity-name">{label}</div>}<div className="sdr-identity-meta">{[role, name ? company : null].filter(Boolean).join(" · ") || "Fiche société"}</div>{domain && !compact && <a className="sdr-domain" href={`https://${domain}`} target="_blank" rel="noreferrer">{domain}<ArrowUpRight size={12}/></a>}</div>
    </div>;
}
