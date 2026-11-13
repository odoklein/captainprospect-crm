"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { ClientVaultWorkspace } from "@/components/manager/ClientVaultWorkspace";
import ManagerFilesWorkspace from "@/components/files/ManagerFilesWorkspace";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderOpen, KeyRound } from "lucide-react";

interface Credential {
    id: string;
    type: string;
    label: string | null;
    login: string;
    url: string | null;
}

const TYPE_LABELS: Record<string, string> = {
    PORTAL: "Portail",
    EMAIL: "E-mail",
    CALENDAR: "Agenda",
    CRM_EXTERNAL: "CRM",
    LINKEDIN: "LinkedIn",
    PHONE_TOOL: "Téléphonie",
    OTHER: "Autre",
};

/** « Accès & liens » of a client: vault entries (never a password) + shortcuts. */
export function AccessLinksCard({ clientId }: { clientId: string }) {
    const [panel, setPanel] = useState<"vault" | "files" | null>(null);
    const { data: credentials = [], isLoading, refetch } = useQuery<Credential[]>({
        queryKey: ["vault-credentials", clientId],
        queryFn: async () => {
            const res = await fetch(`/api/manager/vault?clientId=${encodeURIComponent(clientId)}`);
            const json = await res.json();
            return json.success ? json.data.credentials : [];
        },
        staleTime: 60_000,
    });

    return (
        <>
        <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <KeyRound className="h-4 w-4 text-ink-3" aria-hidden /> Accès &amp; liens
                </h3>
                <div className="flex gap-3 text-xs font-medium">
                    <button type="button" onClick={() => setPanel("vault")} className="text-link hover:underline">
                        Gérer les accès
                    </button>
                    <button type="button" onClick={() => setPanel("files")} className="inline-flex items-center gap-1 text-link hover:underline">
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Fichiers du client
                    </button>
                </div>
            </div>
            {isLoading ? (
                <p className="mt-3 text-xs text-ink-3">Chargement…</p>
            ) : credentials.length === 0 ? (
                <p className="mt-3 text-xs text-ink-3">
                    Aucun accès enregistré : CRM du client, adresse e-mail partenaire, agenda… à ajouter dans le coffre d&apos;accès.
                </p>
            ) : (
                <ul className="mt-3 divide-y divide-line">
                    {credentials.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                                <p className="truncate font-medium text-ink">{c.label || TYPE_LABELS[c.type] || c.type}</p>
                                <p className="truncate text-xs text-ink-3">
                                    {TYPE_LABELS[c.type] ?? c.type} · {c.login}
                                </p>
                            </div>
                            {c.url && (
                                <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-link hover:underline"
                                >
                                    Ouvrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
        <Drawer isOpen={panel !== null} onClose={() => { setPanel(null); void refetch(); }} title={panel === "vault" ? "Coffre d’accès du client" : "Fichiers du client"} size="full" closeOnOverlay={false} bodyClassName="p-5">
            {panel === "vault" && <ClientVaultWorkspace key={clientId} fixedClientId={clientId} />}
            {panel === "files" && <ManagerFilesWorkspace key={clientId} fixedClientId={clientId} />}
        </Drawer>
        </>
    );
}
