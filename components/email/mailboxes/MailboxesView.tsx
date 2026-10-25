"use client";

// ============================================
// MAILBOXES — /manager/emails/mailboxes
// One card per connected account with a plain health line (synced / error /
// limit reached), today's sends against the limit, and where it is used.
// ?mailbox=<id> opens the settings drawer; ?success= / ?error= come back from
// the Gmail / Outlook OAuth flow and are shown once, then removed from the URL.
// ============================================

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Mail, Plus, RefreshCw, Settings2, Target } from "lucide-react";
import {
    Badge,
    Button,
    Callout,
    EmptyState,
    IconButton,
    Skeleton,
    StatusText,
    useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { AddMailboxModal } from "./AddMailboxModal";
import { MailboxSettingsDrawer } from "./MailboxSettingsDrawer";
import {
    OAUTH_ERRORS,
    PROVIDER_META,
    mailboxHealth,
    type MailboxDetail,
    type MailboxRow,
    type MailboxUsage,
} from "./mailbox-utils";

function MailboxCard({
    mailbox,
    detail,
    usage,
    syncing,
    onSync,
    onOpen,
}: {
    mailbox: MailboxRow;
    detail?: MailboxDetail;
    usage?: Pick<MailboxUsage, "missions" | "clients">;
    syncing: boolean;
    onSync: () => void;
    onOpen: () => void;
}) {
    const router = useRouter();
    const meta = PROVIDER_META[mailbox.provider] ?? PROVIDER_META.CUSTOM;
    const sentToday = detail ? detail.sentTodayEffective : mailbox.sentToday;
    const health = mailboxHealth(mailbox, sentToday);
    const pct = Math.min(100, Math.round((sentToday / Math.max(1, mailbox.dailySendLimit)) * 100));
    const usedBy = (usage?.missions.length ?? 0) + (usage?.clients.length ?? 0);
    const isReachInbox = mailbox.provider === "REACHINBOX";

    return (
        <article
            className={cn(
                "flex flex-col rounded-panel border bg-surface p-4 shadow-2xs",
                health.tone === "danger" ? "border-danger-line" : "border-line",
            )}
        >
            <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-3 text-ink-2">
                    <meta.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{mailbox.displayName || mailbox.email}</p>
                        <Badge size="sm">{meta.label}</Badge>
                    </div>
                    <p className="truncate text-xs text-ink-3">
                        {mailbox.email}
                        {mailbox.owner && mailbox.isOwn === false && <span> · boîte de {mailbox.owner.name}</span>}
                    </p>
                </div>
                <IconButton icon={Settings2} label="Paramètres" size="sm" variant="outline" onClick={onOpen} />
            </div>

            <div className="mt-3">
                <StatusText tone={health.tone} pulse={health.pulse}>{health.label}</StatusText>
                {health.error && (
                    <p className="mt-1 line-clamp-2 break-words text-xs text-danger-ink" title={health.error}>
                        {health.error}
                    </p>
                )}
            </div>

            {!isReachInbox && (
                <div className="mt-3">
                    <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-3">Envois aujourd&apos;hui</span>
                        <span className="font-semibold tabular-nums text-ink">
                            {sentToday} <span className="font-normal text-ink-3">/ {mailbox.dailySendLimit}</span>
                        </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-warning" : "bg-primary-600")} style={{ width: `${pct}%` }} />
                    </div>
                </div>
            )}

            <p className="mt-3 text-xs text-ink-3">
                {isReachInbox ? (
                    "Sert à lire les campagnes ReachInbox (onglet Campagnes)."
                ) : (
                    <>
                        {mailbox._count.threads.toLocaleString("fr-FR")} conversations · {mailbox._count.emails.toLocaleString("fr-FR")} emails
                    </>
                )}
            </p>

            {!isReachInbox && usage && (
                <p className="mt-1 flex items-center gap-1.5 text-xs">
                    <Target className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    {usedBy > 0 ? (
                        <span className="truncate text-ink-2" title={[...usage.missions.map((m) => m.name), ...usage.clients.map((c) => c.name)].join(", ")}>
                            Par défaut pour {usage.missions.length > 0 && `${usage.missions.length} mission${usage.missions.length > 1 ? "s" : ""}`}
                            {usage.missions.length > 0 && usage.clients.length > 0 && " et "}
                            {usage.clients.length > 0 && `${usage.clients.length} client${usage.clients.length > 1 ? "s" : ""}`}
                        </span>
                    ) : (
                        <button type="button" onClick={onOpen} className="text-link hover:underline">
                            Définir comme boîte par défaut d&apos;une mission
                        </button>
                    )}
                </p>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-line-subtle pt-3">
                {isReachInbox ? (
                    <Button size="sm" variant="secondary" onClick={() => router.push("/manager/emails/campaigns")}>
                        Voir les campagnes
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        variant={health.tone === "danger" ? "primary" : "secondary"}
                        leftIcon={<RefreshCw className="size-3.5" />}
                        onClick={onSync}
                        isLoading={syncing}
                        disabled={mailbox.syncStatus === "SYNCING"}
                    >
                        {health.tone === "danger" ? "Réessayer" : "Synchroniser"}
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onOpen}>
                    Paramètres et accès
                </Button>
            </div>
        </article>
    );
}

export default function MailboxesView() {
    const toast = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [mailboxes, setMailboxes] = useState<MailboxRow[]>([]);
    const [details, setDetails] = useState<Record<string, MailboxDetail>>({});
    const [usages, setUsages] = useState<Record<string, Pick<MailboxUsage, "missions" | "clients">>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState<Set<string>>(new Set());
    const [addOpen, setAddOpen] = useState(false);

    const openId = searchParams.get("mailbox");

    const setParams = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams.toString());
            for (const [k, v] of Object.entries(patch)) {
                if (v === null) next.delete(k);
                else next.set(k, v);
            }
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    // OAuth return: toast once, then clean the URL.
    useEffect(() => {
        const success = searchParams.get("success");
        const error = searchParams.get("error");
        if (!success && !error) return;
        if (success) toast.success(success === "reconnected" ? "Boîte mail reconnectée" : "Boîte mail connectée", "La première synchronisation démarre.");
        if (error) toast.error("Connexion impossible", OAUTH_ERRORS[error] ?? decodeURIComponent(error));
        setParams({ success: null, error: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            // Managers see every mailbox of the team; others fall back to theirs + shared.
            let res = await fetch("/api/email/mailboxes?scope=team");
            if (res.status === 403) res = await fetch("/api/email/mailboxes?includeShared=true");
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Chargement impossible");
            const rows: MailboxRow[] = json.data ?? [];
            setMailboxes(rows);
            setIsLoading(false);

            // Per-mailbox detail (today's sends computed server-side) and usage, in parallel.
            const [detailRows, usageRows] = await Promise.all([
                Promise.all(rows.map((m) => fetch(`/api/email/mailboxes/${m.id}`).then((r) => r.json()).catch(() => null))),
                Promise.all(rows.map((m) => fetch(`/api/email/mailboxes/${m.id}/usage`).then((r) => r.json()).catch(() => null))),
            ]);
            const nextDetails: Record<string, MailboxDetail> = {};
            const nextUsages: Record<string, Pick<MailboxUsage, "missions" | "clients">> = {};
            rows.forEach((m, i) => {
                if (detailRows[i]?.success) nextDetails[m.id] = detailRows[i].data;
                if (usageRows[i]?.success) nextUsages[m.id] = usageRows[i].data;
            });
            setDetails(nextDetails);
            setUsages(nextUsages);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Chargement impossible");
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const opened = openId ? mailboxes.find((m) => m.id === openId) ?? null : null;

    useEffect(() => {
        if (!isLoading && !loadError && openId && !opened) {
            toast.error("Boîte mail introuvable", "Elle a peut-être été déconnectée.");
            setParams({ mailbox: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, loadError, openId, opened]);

    const sync = async (mailbox: MailboxRow) => {
        setSyncing((prev) => new Set(prev).add(mailbox.id));
        try {
            const res = await fetch(`/api/email/mailboxes/${mailbox.id}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxThreads: 100 }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Synchronisation impossible");
            toast.success("Synchronisation terminée", `${mailbox.email} : ${json.data?.threadsProcessed ?? 0} conversation(s) mises à jour.`);
        } catch (err) {
            toast.error(`Synchronisation impossible — ${mailbox.email}`, err instanceof Error ? err.message : undefined);
        } finally {
            setSyncing((prev) => {
                const next = new Set(prev);
                next.delete(mailbox.id);
                return next;
            });
            load();
        }
    };

    const errorCount = mailboxes.filter((m) => m.isActive && m.syncStatus === "ERROR").length;

    return (
        <EmailHubPage
            title="Boîtes mail"
            description="Les comptes depuis lesquels l'équipe envoie et reçoit. Une boîte en erreur ne récupère plus les réponses des prospects."
            actions={
                <Button leftIcon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
                    Ajouter une boîte mail
                </Button>
            }
        >
            {errorCount > 0 && (
                <Callout tone="danger" className="mb-4" title={`${errorCount} boîte${errorCount > 1 ? "s" : ""} en erreur`}>
                    Relancez la synchronisation ; si l&apos;erreur persiste, vérifiez le mot de passe ou reconnectez le compte depuis ses paramètres.
                </Callout>
            )}

            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-[230px] rounded-panel" />
                    ))}
                </div>
            ) : loadError ? (
                <Callout
                    tone="danger"
                    title="Les boîtes mail n'ont pas pu être chargées"
                    action={<Button size="sm" variant="secondary" onClick={() => { setIsLoading(true); load(); }}>Réessayer</Button>}
                >
                    {loadError}
                </Callout>
            ) : mailboxes.length === 0 ? (
                <EmptyState
                    icon={Mail}
                    title="Aucune boîte mail connectée"
                    description="Connectez une boîte Gmail, Outlook ou IMAP pour envoyer depuis le CRM et récupérer les réponses des prospects dans la réception."
                    action={<Button leftIcon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>Connecter une boîte mail</Button>}
                />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {mailboxes.map((m) => (
                        <MailboxCard
                            key={m.id}
                            mailbox={m}
                            detail={details[m.id]}
                            usage={usages[m.id]}
                            syncing={syncing.has(m.id)}
                            onSync={() => sync(m)}
                            onOpen={() => setParams({ mailbox: m.id })}
                        />
                    ))}
                </div>
            )}

            <AddMailboxModal isOpen={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />

            {opened && (
                <MailboxSettingsDrawer
                    key={opened.id}
                    mailbox={opened}
                    onClose={() => setParams({ mailbox: null })}
                    onChanged={load}
                    onDeleted={() => {
                        setParams({ mailbox: null });
                        setMailboxes((prev) => prev.filter((m) => m.id !== opened.id));
                        load();
                    }}
                />
            )}
        </EmailHubPage>
    );
}
