"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Copy, KeyRound, Loader2, Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmModal, useToast } from "@/components/ui";
import { CLIENTS_QUERY_KEY, clientDetailQueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type ClientManagementSection = "profile" | "contacts" | "portal";
type Entry = { value: string; label: string; isPrimary: boolean };
type PortalUser = { id: string; name: string; email: string; isActive?: boolean; role?: string };
type Contact = {
    id: string; firstName: string; lastName: string; title?: string | null;
    department?: string | null; territory?: string | null; notes?: string | null;
    emails?: Entry[]; phones?: Entry[]; isActive: boolean;
    bookingLinks?: { label: string; url: string; durationMinutes: number }[];
    portalUser?: PortalUser | null;
};
type ClientDetail = { id: string; name: string; industry?: string; email?: string; phone?: string; bookingUrl?: string; users?: PortalUser[]; interlocuteurs?: Contact[] };

async function request(url: string, method = "GET", body?: unknown) {
    const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || "Impossible d’enregistrer. Réessayez.");
    return json;
}

const input = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10";
const secondary = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
const primary = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-teal-900 px-4 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="grid gap-1.5 text-xs font-medium text-slate-600">{label}{children}</label>;
}
function SaveButton({ busy, label = "Enregistrer" }: { busy: boolean; label?: string }) {
    return <button type="submit" disabled={busy} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{label}</button>;
}
function ProfileForm({ client, save, busy }: { client: ClientDetail; save: (patch: unknown) => Promise<boolean>; busy: boolean }) {
    const [form, setForm] = useState({ name: client.name, industry: client.industry ?? "", email: client.email ?? "", phone: client.phone ?? "", bookingUrl: client.bookingUrl ?? "" });
    return <form onSubmit={async e => { e.preventDefault(); await save(form); }} className="space-y-5">
        <div><h3 className="text-sm font-semibold text-slate-900">Informations du client</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ces coordonnées sont partagées avec l’équipe dans le dossier client.</p></div>
        <Field label="Nom du client *"><input className={input} required minLength={2} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Secteur d’activité"><input className={input} value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Email de contact"><input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field label="Téléphone"><input type="tel" className={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field></div>
        <Field label="Lien de prise de rendez-vous"><input type="url" placeholder="https://…" className={input} value={form.bookingUrl} onChange={e => setForm({ ...form, bookingUrl: e.target.value })} /></Field>
        <div className="flex justify-end border-t border-slate-100 pt-4"><SaveButton busy={busy} /></div>
    </form>;
}

function ContactForm({ contact, onCancel, save, busy }: { contact: Contact | null; onCancel: () => void; save: (patch: unknown) => Promise<boolean>; busy: boolean }) {
    const [form, setForm] = useState({ firstName: contact?.firstName ?? "", lastName: contact?.lastName ?? "", title: contact?.title ?? "", department: contact?.department ?? "", territory: contact?.territory ?? "", notes: contact?.notes ?? "", email: contact?.emails?.find(e => e.isPrimary)?.value ?? contact?.emails?.[0]?.value ?? "", phone: contact?.phones?.find(e => e.isPrimary)?.value ?? contact?.phones?.[0]?.value ?? "", bookingUrl: contact?.bookingLinks?.[0]?.url ?? "" });
    // Preserve secondary contact entries and booking links when editing the primary one.
    const entries = (previous: Entry[] | undefined, value: string): Entry[] => {
        const list = previous ?? [];
        const primaryIndex = Math.max(0, list.findIndex(e => e.isPrimary));
        const rest = list.filter((_, index) => index !== primaryIndex);
        return value.trim() ? [{ ...(list[primaryIndex] ?? { label: "Professionnel" }), value: value.trim(), isPrimary: true }, ...rest] : rest.map((entry, index) => ({ ...entry, isPrimary: index === 0 }));
    };
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const { email, phone, bookingUrl, ...details } = form;
        const links = contact?.bookingLinks ?? [];
        const bookingLinks = bookingUrl.trim() ? [{ ...(links[0] ?? { label: "Rendez-vous", durationMinutes: 30 }), url: bookingUrl.trim() }, ...links.slice(1)] : links.slice(1);
        if (await save({ ...details, emails: entries(contact?.emails, email), phones: entries(contact?.phones, phone), bookingLinks })) onCancel();
    };
    return <form onSubmit={submit} className="space-y-4 rounded-xl border border-teal-900/15 bg-slate-50/50 p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{contact ? "Modifier l’interlocuteur" : "Nouvel interlocuteur"}</h3><button type="button" className={secondary} disabled={busy} onClick={onCancel} aria-label="Fermer le formulaire"><X className="h-4 w-4" /></button></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Prénom *"><input autoFocus required className={input} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field><Field label="Nom *"><input required className={input} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field></div>
        <Field label="Fonction"><input className={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Email principal"><input type="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field><Field label="Téléphone principal"><input type="tel" className={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Service"><input className={input} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></Field><Field label="Territoire"><input className={input} value={form.territory} onChange={e => setForm({ ...form, territory: e.target.value })} /></Field></div>
        <Field label="Lien de rendez-vous"><input type="url" className={input} value={form.bookingUrl} onChange={e => setForm({ ...form, bookingUrl: e.target.value })} /></Field>
        <Field label="Notes internes"><textarea rows={3} className={cn(input, "h-auto py-2")} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={secondary} onClick={onCancel}>Annuler</button><SaveButton busy={busy} label={contact ? "Enregistrer" : "Ajouter l’interlocuteur"} /></div>
    </form>;
}

export function ClientManagementDrawer({ clientId, clientName, section: initialSection, onClose, onSaved }: { clientId: string; clientName: string; section: ClientManagementSection; onClose: () => void; onSaved?: () => void }) {
    const queryClient = useQueryClient();
    const { success } = useToast();
    const [section, setSection] = useState(initialSection);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [editingContact, setEditingContact] = useState<Contact | null | undefined>();
    const [creatingUser, setCreatingUser] = useState(false);
    const [userForm, setUserForm] = useState({ name: "", email: "" });
    const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [confirmAccess, setConfirmAccess] = useState<PortalUser | null>(null);
    const { data: client, isLoading, isError, refetch } = useQuery<ClientDetail>({ queryKey: clientDetailQueryKey(clientId), queryFn: async () => (await request(`/api/clients/${clientId}`)).data });
    const mutate = async (url: string, method: string, body?: unknown) => {
        setBusy(true); setError("");
        try {
            const json = await request(url, method, body);
            await queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(clientId) });
            await queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
            onSaved?.();
            success("Enregistré", "Le dossier client est à jour.");
            return json;
        } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); return null; }
        finally { setBusy(false); }
    };
    const contacts = client?.interlocuteurs ?? [];
    const users = client?.users?.filter(user => user.role === "CLIENT") ?? [];
    const showCredentials = (email: string, password: string) => { setCredentials({ email, password }); setCopied(false); };
    const tabs = [{ id: "profile", label: "Informations", icon: Building2 }, { id: "contacts", label: "Interlocuteurs", icon: Users }, { id: "portal", label: "Accès portail", icon: ShieldCheck }] as const;
    return <>
        <Drawer isOpen onClose={() => { if (!busy) onClose(); }} title="Gérer le client" description={clientName} size="lg" closeOnOverlay={false} closeOnEscape={!busy} showCloseButton={!busy} bodyClassName="p-0">
            <nav aria-label="Gestion du client" className="sticky top-0 z-10 flex gap-1 border-b border-slate-200 bg-white px-5 py-3">{tabs.map(tab => <button key={tab.id} type="button" disabled={busy} onClick={() => { setSection(tab.id); setError(""); }} aria-current={section === tab.id ? "page" : undefined} className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition", section === tab.id ? "bg-teal-50 text-teal-900" : "text-slate-500 hover:bg-slate-50")}><tab.icon className="h-4 w-4" />{tab.label}</button>)}</nav>
            <div className="space-y-5 p-5 sm:p-6">
                {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                {isLoading ? <div role="status" className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Chargement du dossier…</div> : isError || !client ? <div role="alert" className="space-y-3 text-sm"><p>Impossible de charger le client.</p><button className={secondary} onClick={() => void refetch()}>Réessayer</button></div> : <>
                    {section === "profile" && <ProfileForm client={client} busy={busy} save={async patch => Boolean(await mutate(`/api/clients/${clientId}`, "PUT", patch))} />}
                    {section === "contacts" && <>
                        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Interlocuteurs du client <span className="ml-1 text-slate-400">{contacts.length}</span></h3><p className="mt-1 text-xs leading-5 text-slate-500">Coordonnées, agenda et accès commercial au même endroit.</p></div><button className={secondary} disabled={busy} onClick={() => setEditingContact(null)}><Plus className="h-4 w-4" />Ajouter</button></div>
                        {editingContact !== undefined && <ContactForm key={editingContact?.id ?? "new"} contact={editingContact} busy={busy} onCancel={() => setEditingContact(undefined)} save={async patch => Boolean(await mutate(`/api/clients/${clientId}/interlocuteurs${editingContact ? `/${editingContact.id}` : ""}`, editingContact ? "PUT" : "POST", patch))} />}
                        {contacts.length === 0 && editingContact === undefined && <div className="rounded-xl border border-dashed border-slate-200 p-7 text-center"><Users className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-medium">Qui reçoit les rendez-vous ?</p><p className="mt-1 text-xs leading-5 text-slate-500">Ajoutez un interlocuteur et son agenda pour préparer la mission.</p></div>}
                        <div className="divide-y divide-slate-100">{contacts.map(contact => <div key={contact.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{contact.firstName} {contact.lastName}</p><p className="mt-1 text-xs text-slate-500">{contact.title || "Fonction non renseignée"}{contact.territory ? ` · ${contact.territory}` : ""}</p><p className="mt-2 text-xs text-slate-600">{contact.emails?.find(entry => entry.isPrimary)?.value ?? contact.emails?.[0]?.value ?? "Aucun email"}</p></div><button className={secondary} disabled={busy} onClick={() => setEditingContact(contact)}>Modifier</button></div><div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="flex items-center gap-2 text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" />{contact.portalUser ? contact.portalUser.isActive ? "Portail commercial actif" : "Portail commercial suspendu" : "Aucun accès commercial"}</span>{contact.portalUser ? <button className="text-xs font-medium text-teal-800 disabled:opacity-50" disabled={busy} onClick={() => setConfirmAccess(contact.portalUser!)}>{contact.portalUser.isActive ? "Suspendre" : "Réactiver"}</button> : <button className="text-xs font-medium text-teal-800 disabled:opacity-50" disabled={busy || !contact.emails?.length || !contact.isActive} onClick={async () => { const result = await mutate(`/api/clients/${clientId}/interlocuteurs/${contact.id}/activate-portal`, "POST"); if (result?.data?.generatedPassword) showCredentials(result.data.user.email, result.data.generatedPassword); }}>Créer l’accès</button>}</div></div>)}</div>
                    </>}
                    {section === "portal" && <>
                        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Comptes du portail client</h3><p className="mt-1 text-xs leading-5 text-slate-500">Un compte nominatif pour chaque personne qui suit les résultats.</p></div><button disabled={busy} className={secondary} onClick={() => setCreatingUser(true)}><Plus className="h-4 w-4" />Créer un accès</button></div>
                        {creatingUser && <form className="space-y-4 rounded-xl border border-teal-900/15 bg-slate-50/50 p-4" onSubmit={async e => { e.preventDefault(); const bytes = crypto.getRandomValues(new Uint8Array(18)); const password = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); const result = await mutate("/api/users", "POST", { ...userForm, password, role: "CLIENT", clientId }); if (result) { showCredentials(userForm.email, result.generatedPassword || password); setCreatingUser(false); setUserForm({ name: "", email: "" }); } }}>
                            <Field label="Nom complet *"><input autoFocus minLength={2} required className={input} value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} /></Field><Field label="Email professionnel *"><input type="email" required className={input} value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} /></Field><p className="text-xs leading-5 text-slate-500">Un mot de passe sera créé. Les identifiants vous seront affichés pour transmission au client.</p><div className="flex justify-end gap-2"><button type="button" className={secondary} disabled={busy} onClick={() => setCreatingUser(false)}>Annuler</button><SaveButton busy={busy} label="Créer l’accès" /></div>
                        </form>}
                        {users.length === 0 && !creatingUser && <div className="rounded-xl border border-dashed border-slate-200 p-7 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-medium">Le portail attend son premier utilisateur</p><p className="mt-1 text-xs text-slate-500">Créez un accès pour partager le suivi de la mission.</p></div>}
                        <div className="divide-y divide-slate-100">{users.map(user => <div key={user.id} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold text-slate-800">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email}</p><span className={cn("mt-2 inline-flex rounded-md px-2 py-0.5 text-[11px]", user.isActive !== false ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-500")}>{user.isActive !== false ? "Accès actif" : "Accès suspendu"}</span></div><button className={secondary} disabled={busy} onClick={() => setConfirmAccess(user)}>{user.isActive !== false ? "Suspendre" : "Réactiver"}</button></div>)}</div>
                    </>}
                </>}
                {credentials && <div role="status" className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-teal-950">Accès créé — identifiants à transmettre</h3><button aria-label="Masquer les identifiants" onClick={() => setCredentials(null)}><X className="h-4 w-4" /></button></div><p className="text-xs text-teal-800">Le mot de passe n’est affiché que dans ce panneau. Copiez-le avant de fermer.</p><div className="space-y-1 rounded-lg bg-white p-3 text-sm"><p>{credentials.email}</p><code className="break-all">{credentials.password}</code></div><button className={secondary} onClick={async () => { try { await navigator.clipboard.writeText(`Email : ${credentials.email}\nMot de passe : ${credentials.password}`); setCopied(true); } catch { setError("Copie indisponible. Sélectionnez les identifiants pour les copier."); } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Identifiants copiés" : "Copier les identifiants"}</button></div>}
            </div>
        </Drawer>
        <ConfirmModal isOpen={!!confirmAccess} onClose={() => { if (!busy) setConfirmAccess(null); }} title={confirmAccess?.isActive !== false ? "Suspendre cet accès ?" : "Réactiver cet accès ?"} message={confirmAccess?.isActive !== false ? `${confirmAccess?.name ?? "Cet utilisateur"} ne pourra plus se connecter au portail. Ses données seront conservées.` : "Cet utilisateur pourra de nouveau se connecter au portail."} confirmText={confirmAccess?.isActive !== false ? "Suspendre l’accès" : "Réactiver l’accès"} isLoading={busy} onConfirm={async () => { if (!confirmAccess) return; const result = await mutate(`/api/users/${confirmAccess.id}/status`, "PUT", { isActive: confirmAccess.isActive === false }); if (result) setConfirmAccess(null); }} />
    </>;
}
