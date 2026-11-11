"use client";

import { Brain, FileText, ShieldCheck } from "lucide-react";
import { useFolderDetail, useFolderFiles, useMemories } from "@/lib/assistant/client/folder-hooks";
import { ContextPanel } from "../folder/ContextPanel";
import { useBrand } from "@/lib/brand/client";

/** Readable context beside the full thread; full editing stays in the existing panel. */
export function ConversationContext({ folderId, folderName, missionName, onOpenConversation }: {
    folderId: string | null; folderName: string; missionName?: string | null; onOpenConversation(id: string): void;
}) {
    const brand = useBrand();
    const memories = useMemories(folderId, false);
    const files = useFolderFiles(folderId);
    const { data: folder } = useFolderDetail(folderId);
    const items = [...(memories.data?.folder ?? []).filter(m => m.folderId === folderId), ...(memories.data?.user ?? []), ...(memories.data?.agency ?? [])]
        .filter(m => !m.deletedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 5);
    return <aside aria-label={`Contexte de ${brand.assistantName}`} className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2/60 p-5 min-[1500px]:flex">
        <h2 className="text-base font-semibold tracking-tight text-ink">Contexte de {brand.assistantName}</h2><p className="mt-1 text-xs leading-relaxed text-ink-3">Le périmètre et les éléments disponibles pour cet échange.</p>
        <section className="mt-6 rounded-xl border border-line bg-surface p-4"><h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Périmètre actif</h3><p className="mt-3 text-sm font-semibold text-ink">{folderName}</p>{missionName && <p className="mt-1 text-xs text-ink-3">{missionName}</p>}<p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden />{folderId ? "Contexte lié à ce dossier. Les droits sont vérifiés côté serveur." : "Vue agence. Le client concerné reste à préciser pour une action."}</p></section>
        {folder?.instructions && <section className="mt-6"><h3 className="text-xs font-semibold text-ink">Instructions du dossier</h3><p className="mt-2 line-clamp-5 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-3">{folder.instructions}</p></section>}
        <section className="mt-6"><h3 className="text-xs font-semibold text-ink">Mémoire utile</h3>
            {memories.isLoading ? <p role="status" className="mt-3 text-xs text-ink-3">Lecture de la mémoire…</p> : memories.error || memories.data?.degraded ? <p role="status" className="mt-3 text-xs text-warning-ink">La mémoire est partiellement indisponible.</p> : items.length === 0 ? <p className="mt-3 text-xs leading-relaxed text-ink-3">Aucun élément enregistré dans les données chargées.</p> : <ul className="mt-3 space-y-4">{items.map(item => <li key={item.id} className="flex items-start gap-2.5"><Brain className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden /><div className="min-w-0"><p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-2">{item.content}</p><p className="mt-1 text-[10px] text-ink-4">{item.scope === "AGENCY" ? "Agence" : item.scope === "USER" ? "Préférence personnelle" : "Dossier"}</p></div></li>)}</ul>}
        </section>
        {folderId && <section className="mt-6 border-t border-line-subtle pt-5"><h3 className="text-xs font-semibold text-ink">Fichiers disponibles</h3><p className="mt-1 text-[11px] leading-relaxed text-ink-3">Les sources effectivement utilisées figurent dans les citations de la réponse.</p>
            {files.error || files.data?.degraded ? <p className="mt-3 text-xs text-warning-ink">Les fichiers sont indisponibles ou incomplets.</p> : files.isLoading ? <p role="status" className="mt-3 text-xs text-ink-3">Lecture des fichiers…</p> : files.data?.files.length ? <ul className="mt-3 space-y-3">{files.data.files.slice(0, 5).map(file => <li key={file.fileId} className="flex min-w-0 items-start gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /><div className="min-w-0"><p className="break-words text-xs text-ink-2">{file.name}</p><p className="mt-1 text-[10px] text-ink-3">{file.status === "READY" ? "Lisible" : file.status === "PROCESSING" || file.status === "PENDING" ? "Lecture en cours" : "À vérifier"}</p></div></li>)}</ul> : <p className="mt-3 text-xs text-ink-3">Aucun fichier dans les données chargées.</p>}
        </section>}
        <div className="mt-6 border-t border-line-subtle pt-4"><ContextPanel folderId={folderId} folderName={folderName} initialTab="memoire" onOpenConversation={onOpenConversation} /></div>
    </aside>;
}
