"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Building2, ChevronRight, Database, Loader2, Plus, Search } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { CompanyDrawer } from "@/components/drawers/CompanyDrawer";
import { useToast } from "@/components/ui";
import { useBrand } from "@/lib/brand/client";

const UnifiedActionDrawer = dynamic(() => import("@/components/drawers/UnifiedActionDrawer").then(module => ({ default: module.UnifiedActionDrawer })), { ssr: false });
type Company = { id: string; name: string; industry?: string; country?: string; phone?: string; status: string; contacts?: { id: string; firstName?: string; lastName?: string; email?: string }[]; _count?: { contacts: number } };
const input = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10";
const button = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function MissionAudienceDrawer({ missionId, missionName, list, onClose, onCreated, onChanged }: { missionId: string; missionName: string; list: { id: string; name: string } | null; onClose: () => void; onCreated: (list: { id: string; name: string }) => void; onChanged: () => void }) {
    const brand = useBrand();
    const { success } = useToast();
    const [name, setName] = useState("");
    const [source, setSource] = useState("");
    const [type, setType] = useState("CLIENT");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [creatingCompany, setCreatingCompany] = useState(false);
    const [companyId, setCompanyId] = useState<string | null>(null);
    const { data: companies = [], isLoading, isError, refetch } = useQuery<Company[]>({ queryKey: ["mission-audience-companies", list?.id], enabled: !!list, queryFn: async () => {
        const response = await fetch(`/api/lists/${list!.id}/companies`);
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Chargement impossible");
        return json.data;
    } });
    const filtered = companies.filter(company => `${company.name} ${company.industry ?? ""} ${company.contacts?.map(contact => `${contact.firstName} ${contact.lastName} ${contact.email}`).join(" ") ?? ""}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
    const refresh = () => { void refetch(); onChanged(); };
    return <>
        <Drawer isOpen onClose={() => { if (!busy) onClose(); }} title={list?.name ?? "Nouvelle base de prospects"} description={missionName} size="xl" closeOnOverlay={false} closeOnEscape={!busy} showCloseButton={!busy} bodyClassName="p-0">
            {list ? <div className="p-5 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Sociétés et contacts</h3><p className="mt-1 text-xs text-slate-500">{companies.length} sociétés · {companies.reduce((sum, company) => sum + (company._count?.contacts ?? company.contacts?.length ?? 0), 0)} contacts</p></div><button className={button} onClick={() => setCreatingCompany(true)}><Plus className="h-4 w-4" />Ajouter une société</button></div>
                <label className="relative mb-4 block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${input} pl-9`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une société ou un contact" aria-label="Rechercher dans la base" /></label>
                {isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" />Chargement de la base…</div> : isError ? <div role="alert" className="space-y-3 py-8 text-sm"><p>Impossible de charger les sociétés.</p><button className={button} onClick={() => void refetch()}>Réessayer</button></div> : filtered.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">{filtered.slice(0, 150).map(company => <button key={company.id} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-teal-50/40" onClick={() => setCompanyId(company.id)}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50"><Building2 className="h-4 w-4 text-slate-400" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-slate-800">{company.name}</strong><span className="mt-1 block truncate text-xs text-slate-500">{[company.industry, company.country, company.phone].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</span></span><span className="text-xs text-slate-500">{company._count?.contacts ?? company.contacts?.length ?? 0} contacts</span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center"><Database className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-medium">{query ? "Aucun résultat" : "Votre base est créée"}</p><p className="mt-1 text-xs text-slate-500">{query ? "Essayez un autre nom ou une adresse email." : "Ajoutez une société puis ses contacts pour démarrer la prospection."}</p></div>}
                {filtered.length > 150 && <p className="mt-3 text-xs text-slate-500">150 sociétés affichées sur {filtered.length}. Affinez la recherche pour retrouver un prospect.</p>}
            </div> : <form className="space-y-5 p-6" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { const response = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missionId, name: name.trim(), type, source: source.trim() }) }); const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.error || "Création impossible"); success("Base créée", "Ajoutez les premières sociétés à votre base."); onChanged(); onCreated({ id: json.data.id, name: json.data.name }); } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue"); } finally { setBusy(false); } }}>
                <div className="rounded-xl bg-teal-50/60 p-4"><h3 className="text-sm font-semibold text-teal-950">Une base dédiée à cette mission</h3><p className="mt-1 text-xs leading-5 text-teal-800">Regroupez les prospects par cible. Vous pourrez ensuite leur associer un ciblage et un script dans les vérifications de lancement.</p></div>
                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <label className="grid gap-2 text-xs font-medium text-slate-600">Nom de la base *<input autoFocus className={input} required value={name} onChange={event => setName(event.target.value)} placeholder="Ex. Directions commerciales · France" /></label>
                <label className="grid gap-2 text-xs font-medium text-slate-600">Origine des prospects<select className={input} value={type} onChange={event => setType(event.target.value)}><option value="CLIENT">Fournis par le client</option><option value="SUZALI">{brand.companyShortName} · base interne</option><option value="MIXED">Sources mixtes</option></select></label>
                <label className="grid gap-2 text-xs font-medium text-slate-600">Source ou contexte<input className={input} value={source} onChange={event => setSource(event.target.value)} placeholder="CRM client, salon, recherche…" /></label>
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className={button} disabled={busy} onClick={onClose}>Annuler</button><button type="submit" disabled={busy || !name.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-900 px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Créer la base</button></div>
            </form>}
        </Drawer>
        {list && creatingCompany && <CompanyDrawer isOpen isCreating isManager company={null} listId={list.id} onClose={() => setCreatingCompany(false)} onCreate={() => { setCreatingCompany(false); refresh(); }} />}
        {companyId && <UnifiedActionDrawer isOpen companyId={companyId} contactId={null} missionId={missionId} missionName={missionName} onClose={() => { setCompanyId(null); refresh(); }} onActionRecorded={refresh} />}
    </>;
}
