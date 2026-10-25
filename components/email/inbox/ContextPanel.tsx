"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
    Building2,
    Target,
    User,
    Mail,
    Phone,
    Link2,
    Unlink,
    Search,
    PanelRightClose,
    ArrowUpRight,
    Briefcase,
    MessageSquare,
    Wand2,
    X,
} from "lucide-react";
import {
    Avatar,
    Button,
    IconButton,
    SegmentedControl,
    Spinner,
    Textarea,
    useToast,
} from "@/components/ui";
import { LabelSection } from "./LabelSection";
import {
    contactName,
    crmRoutes,
    fetchJson,
    isSupervisorRole,
    type ThreadComment,
    type ThreadDetail,
    type ThreadLinks,
} from "./inbox-utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

// ============================================
// TYPES
// ============================================

interface ContextPanelProps {
    thread: ThreadDetail;
    role?: string | null;
    onLinksChanged: (links: ThreadLinks) => void;
    onLabelsChanged: (labels: string[]) => void;
    onCommentAdded: (comment: ThreadComment) => void;
    onClose: () => void;
}

type LinkType = "contact" | "mission" | "client";

interface SearchItem {
    id: string;
    primary: string;
    secondary?: string;
}

// ============================================
// ENTITY SEARCH (contacts, missions, clients)
// ============================================

const SEARCHERS: Record<LinkType, (q: string) => Promise<SearchItem[]>> = {
    contact: async (q) => {
        const data = await fetchJson<
            { id: string; firstName: string | null; lastName: string | null; email: string | null; company: { name: string } | null }[]
        >(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`);
        return data.map((c) => ({
            id: c.id,
            primary: contactName(c) || c.email || "Contact sans nom",
            secondary: [c.company?.name, c.email].filter(Boolean).join(" · "),
        }));
    },
    mission: async (q) => {
        const data = await fetchJson<{ id: string; name: string; client: { name: string } | null; status: string }[]>(
            `/api/missions?search=${encodeURIComponent(q)}&limit=8`,
        );
        return data.map((m) => ({ id: m.id, primary: m.name, secondary: m.client?.name }));
    },
    client: async (q) => {
        const data = await fetchJson<{ id: string; name: string; industry: string | null }[]>(
            `/api/clients?search=${encodeURIComponent(q)}&limit=8`,
        );
        return data.map((c) => ({ id: c.id, primary: c.name, secondary: c.industry ?? undefined }));
    },
};

const SEARCH_PLACEHOLDER: Record<LinkType, string> = {
    contact: "Nom, email ou entreprise…",
    mission: "Nom de la mission ou du client…",
    client: "Nom du client…",
};

function EntitySearch({ type, onPick, onCancel }: { type: LinkType; onPick: (id: string) => void; onCancel: () => void }) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<SearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => inputRef.current?.focus(), []);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) {
            setItems([]);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const t = setTimeout(() => {
            SEARCHERS[type](term)
                .then((r) => !cancelled && (setItems(r), setError(null)))
                .catch((e: Error) => !cancelled && setError(e.message))
                .finally(() => !cancelled && setLoading(false));
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [q, type]);

    return (
        <div className="rounded-control border border-line bg-surface p-2 shadow-xs">
            <div className="flex items-center gap-2 px-1">
                <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            e.stopPropagation();
                            onCancel();
                        } else if (e.key === "Enter" && items[0]) {
                            e.preventDefault();
                            onPick(items[0].id);
                        }
                    }}
                    placeholder={SEARCH_PLACEHOLDER[type]}
                    className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
                />
                {loading ? <Spinner className="text-ink-4" /> : <IconButton size="xs" icon={X} label="Annuler" onClick={onCancel} />}
            </div>
            {error && <p className="px-1 pt-1.5 text-xs text-danger-ink">{error}</p>}
            {items.length > 0 && (
                <ul className="mt-1.5 max-h-56 overflow-y-auto border-t border-line pt-1">
                    {items.map((it) => (
                        <li key={it.id}>
                            <button
                                type="button"
                                onClick={() => onPick(it.id)}
                                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                            >
                                <span className="truncate text-[13px] font-medium text-ink">{it.primary}</span>
                                {it.secondary && <span className="truncate text-2xs text-ink-4">{it.secondary}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!loading && !error && q.trim().length >= 2 && items.length === 0 && (
                <p className="px-1 pt-1.5 text-xs text-ink-4">Aucun résultat.</p>
            )}
        </div>
    );
}

// ============================================
// LINK BLOCK
// ============================================

function LinkBlock({
    icon: Icon,
    label,
    children,
    onUnlink,
    busy,
}: {
    icon: typeof User;
    label: string;
    children: React.ReactNode;
    onUnlink?: () => void;
    busy?: boolean;
}) {
    return (
        <section className="group/link">
            <div className="mb-1.5 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-4">
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                </h4>
                {onUnlink && (
                    <IconButton
                        size="xs"
                        icon={Unlink}
                        label={`Délier ${label.toLowerCase()}`}
                        onClick={onUnlink}
                        isLoading={busy}
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/link:opacity-100"
                    />
                )}
            </div>
            {children}
        </section>
    );
}

function OpenLink({ href, children }: { href: string | null; children: React.ReactNode }) {
    if (!href) return <span className="font-semibold text-ink">{children}</span>;
    return (
        <Link href={href} className="group/open inline-flex items-center gap-1 font-semibold text-ink hover:text-primary-700">
            <span className="truncate">{children}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-ink-4 group-hover/open:text-primary-600" aria-hidden />
        </Link>
    );
}

// ============================================
// CONTEXT PANEL
// ============================================

export function ContextPanel({ thread, role, onLinksChanged, onLabelsChanged, onCommentAdded, onClose }: ContextPanelProps) {
    const toast = useToast();
    const [tab, setTab] = useState<"crm" | "notes">("crm");
    const [searching, setSearching] = useState<LinkType | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [suggestion, setSuggestion] = useState<SearchItem | null>(null);
    const [note, setNote] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const routes = useMemo(() => crmRoutes(role), [role]);
    const supervisor = isSupervisorRole(role);

    useEffect(() => {
        setSearching(null);
        setSuggestion(null);
        setTab("crm");
        setNote("");
    }, [thread.id]);

    // Suggest the contact whose email is a participant (exact match only)
    const externalEmails = useMemo(() => {
        const own = thread.mailbox.email.toLowerCase();
        const set = new Set<string>();
        thread.emails.forEach((e) => {
            [e.fromAddress, ...e.toAddresses, ...e.ccAddresses].forEach((a) => {
                const v = a?.toLowerCase().trim();
                if (v && v !== own && v.includes("@")) set.add(v);
            });
        });
        return Array.from(set).slice(0, 3);
    }, [thread.id, thread.emails, thread.mailbox.email]);

    useEffect(() => {
        if (thread.contact || externalEmails.length === 0) return;
        let cancelled = false;
        (async () => {
            for (const email of externalEmails) {
                try {
                    const data = await fetchJson<
                        { id: string; firstName: string | null; lastName: string | null; email: string | null; company: { name: string } | null }[]
                    >(`/api/contacts?search=${encodeURIComponent(email)}&limit=3`);
                    const match = data.find((c) => c.email?.toLowerCase() === email);
                    if (match && !cancelled) {
                        setSuggestion({
                            id: match.id,
                            primary: contactName(match) || match.email || email,
                            secondary: [match.company?.name, match.email].filter(Boolean).join(" · "),
                        });
                        return;
                    }
                } catch {
                    return; // role without contact search: no suggestion
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [thread.id, thread.contact, externalEmails]);

    // ---- Link actions --------------------------------------------------

    const link = async (type: LinkType, entityId: string) => {
        setBusy(type);
        try {
            const links = await fetchJson<ThreadLinks>(`/api/email/threads/${thread.id}/link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, entityId }),
            });
            onLinksChanged(links);
            setSearching(null);
            setSuggestion(null);
        } catch (e) {
            toast.error("Liaison impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setBusy(null);
        }
    };

    const unlink = async (type: LinkType) => {
        setBusy(`un-${type}`);
        try {
            const links = await fetchJson<ThreadLinks>(`/api/email/threads/${thread.id}/link?type=${type}`, { method: "DELETE" });
            onLinksChanged(links);
        } catch (e) {
            toast.error("Impossible de délier", e instanceof Error ? e.message : undefined);
        } finally {
            setBusy(null);
        }
    };

    const autoLink = async () => {
        setBusy("auto");
        try {
            const res = await fetchJson<ThreadLinks & { autoLink: { linked: Record<string, string> } }>(
                `/api/email/threads/${thread.id}/link`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ autoLink: true }),
                },
            );
            const { autoLink: result, ...links } = res;
            onLinksChanged(links);
            const n = Object.keys(result?.linked ?? {}).length;
            if (n > 0) toast.success("Conversation liée", `${n} élément${n > 1 ? "s" : ""} du CRM trouvé${n > 1 ? "s" : ""}.`);
            else toast.info("Aucune correspondance", "Aucun contact ni client ne correspond aux participants.");
        } catch (e) {
            toast.error("Liaison automatique impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setBusy(null);
        }
    };

    // ---- Labels & notes ------------------------------------------------

    const saveLabels = async (labels: string[]) => {
        const previous = thread.labels;
        onLabelsChanged(labels);
        try {
            await fetchJson(`/api/email/threads/${thread.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labels }),
            });
        } catch {
            onLabelsChanged(previous);
            toast.error("Libellés non enregistrés");
        }
    };

    const postNote = async (e?: { preventDefault: () => void }) => {
        e?.preventDefault();
        if (!note.trim() || isPosting) return;
        setIsPosting(true);
        try {
            const comment = await fetchJson<ThreadComment>(`/api/email/threads/${thread.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: note }),
            });
            onCommentAdded(comment);
            setNote("");
        } catch (err) {
            toast.error("Note non enregistrée", err instanceof Error ? err.message : undefined);
        } finally {
            setIsPosting(false);
        }
    };

    const { contact, mission, client } = thread;
    const missing = !contact || !mission || !client;

    return (
        <aside className="flex h-full min-h-0 flex-col bg-surface" aria-label="Contexte CRM">
            {/* Header */}
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
                <SegmentedControl
                    size="sm"
                    ariaLabel="Panneau de contexte"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "crm", label: "CRM" },
                        { value: "notes", label: "Notes", count: thread.comments.length || undefined },
                    ]}
                />
                <div className="flex-1" />
                <IconButton size="sm" icon={PanelRightClose} label="Masquer le panneau (I)" onClick={onClose} />
            </div>

            {tab === "crm" ? (
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 email-scrollbar">
                    {missing && (
                        <Button
                            size="sm"
                            variant="soft"
                            fullWidth
                            leftIcon={<Wand2 className="size-3.5" />}
                            isLoading={busy === "auto"}
                            onClick={autoLink}
                        >
                            Lier automatiquement
                        </Button>
                    )}

                    {/* Contact */}
                    <LinkBlock
                        icon={User}
                        label="Contact"
                        onUnlink={contact ? () => unlink("contact") : undefined}
                        busy={busy === "un-contact"}
                    >
                        {contact ? (
                            <div className="flex items-start gap-2.5">
                                <Avatar name={contactName(contact) || contact.email || "?"} size="sm" shape="circle" />
                                <div className="min-w-0 flex-1 space-y-0.5 text-[13px]">
                                    <OpenLink href={routes.contact({ id: contact.id, company: contact.company })}>
                                        {contactName(contact) || contact.email || "Contact"}
                                    </OpenLink>
                                    {contact.title && <p className="truncate text-xs text-ink-3">{contact.title}</p>}
                                    {contact.company && (
                                        <p className="flex items-center gap-1.5 truncate text-xs text-ink-2">
                                            <Building2 className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                            {routes.company(contact.company) ? (
                                                <Link href={routes.company(contact.company)!} className="truncate hover:text-primary-700 hover:underline">
                                                    {contact.company.name}
                                                </Link>
                                            ) : (
                                                <span className="truncate">{contact.company.name}</span>
                                            )}
                                        </p>
                                    )}
                                    {contact.email && (
                                        <p className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                                            <Mail className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                            <span className="truncate">{contact.email}</span>
                                        </p>
                                    )}
                                    {contact.phone && (
                                        <p className="flex items-center gap-1.5 text-xs text-ink-3">
                                            <Phone className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                            <a href={`tel:${contact.phone}`} className="tabular-nums hover:text-primary-700">{contact.phone}</a>
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : searching === "contact" ? (
                            <EntitySearch type="contact" onPick={(id) => link("contact", id)} onCancel={() => setSearching(null)} />
                        ) : (
                            <div className="space-y-2">
                                {suggestion && (
                                    <div className="flex items-center gap-2 rounded-control border border-primary-200 bg-primary-50 px-2.5 py-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-2xs font-medium text-primary-700">Contact reconnu</p>
                                            <p className="truncate text-[13px] font-semibold text-ink">{suggestion.primary}</p>
                                            {suggestion.secondary && <p className="truncate text-2xs text-ink-3">{suggestion.secondary}</p>}
                                        </div>
                                        <Button size="xs" isLoading={busy === "contact"} onClick={() => link("contact", suggestion.id)}>
                                            Lier
                                        </Button>
                                    </div>
                                )}
                                <Button size="xs" variant="ghost" leftIcon={<Link2 className="size-3.5" />} onClick={() => setSearching("contact")}>
                                    Lier un contact
                                </Button>
                            </div>
                        )}
                    </LinkBlock>

                    {/* Mission */}
                    <LinkBlock
                        icon={Target}
                        label="Mission"
                        onUnlink={mission ? () => unlink("mission") : undefined}
                        busy={busy === "un-mission"}
                    >
                        {mission ? (
                            <div className="text-[13px]">
                                <OpenLink href={routes.mission(mission.id)}>{mission.name}</OpenLink>
                                <p className="truncate text-xs text-ink-3">{mission.client.name}</p>
                            </div>
                        ) : searching === "mission" ? (
                            <EntitySearch type="mission" onPick={(id) => link("mission", id)} onCancel={() => setSearching(null)} />
                        ) : (
                            <Button size="xs" variant="ghost" leftIcon={<Link2 className="size-3.5" />} onClick={() => setSearching("mission")}>
                                Lier une mission
                            </Button>
                        )}
                    </LinkBlock>

                    {/* Client */}
                    <LinkBlock
                        icon={Briefcase}
                        label="Client"
                        onUnlink={client && supervisor ? () => unlink("client") : undefined}
                        busy={busy === "un-client"}
                    >
                        {client ? (
                            <div className="text-[13px]">
                                <OpenLink href={routes.client(client.id)}>{client.name}</OpenLink>
                                {client.industry && <p className="truncate text-xs text-ink-3">{client.industry}</p>}
                            </div>
                        ) : searching === "client" ? (
                            <EntitySearch type="client" onPick={(id) => link("client", id)} onCancel={() => setSearching(null)} />
                        ) : supervisor ? (
                            <Button size="xs" variant="ghost" leftIcon={<Link2 className="size-3.5" />} onClick={() => setSearching("client")}>
                                Lier un client
                            </Button>
                        ) : (
                            <p className="text-xs text-ink-4">Déduit de la mission.</p>
                        )}
                    </LinkBlock>

                    {thread.campaign && (
                        <LinkBlock icon={Target} label="Campagne">
                            <p className="truncate text-[13px] font-medium text-ink">{thread.campaign.name}</p>
                        </LinkBlock>
                    )}

                    <div className="border-t border-line pt-4">
                        <LabelSection
                            labels={thread.labels}
                            onAddLabel={(l) => saveLabels([...thread.labels, l])}
                            onRemoveLabel={(l) => saveLabels(thread.labels.filter((x) => x !== l))}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 email-scrollbar">
                        {thread.comments.length === 0 ? (
                            <div className="px-2 py-8 text-center">
                                <MessageSquare className="mx-auto mb-2 size-5 text-ink-4" aria-hidden />
                                <p className="text-[13px] font-medium text-ink-2">Aucune note interne</p>
                                <p className="mt-1 text-xs text-ink-4">Les notes ne sont visibles que par l&apos;équipe, jamais par le destinataire.</p>
                            </div>
                        ) : (
                            thread.comments.map((c) => (
                                <div key={c.id} className="rounded-control border border-line bg-surface-2 px-3 py-2">
                                    <div className="mb-0.5 flex items-baseline gap-2">
                                        <span className="text-xs font-semibold text-ink">{c.user.name}</span>
                                        <span className="text-2xs text-ink-4">
                                            {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: fr })}
                                        </span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-[13px] text-ink-2">{c.content}</p>
                                </div>
                            ))
                        )}
                    </div>
                    <form onSubmit={postNote} className="shrink-0 space-y-2 border-t border-line p-3">
                        <Textarea
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) postNote(e);
                            }}
                            placeholder="Ajouter une note interne…"
                            aria-label="Note interne"
                        />
                        <div className="flex justify-end">
                            <Button type="submit" size="xs" disabled={!note.trim()} isLoading={isPosting}>
                                Ajouter la note
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </aside>
    );
}

export default ContextPanel;
