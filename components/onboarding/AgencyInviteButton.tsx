"use client";

import { useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";

export function AgencyInviteButton() {
    const [open, setOpen] = useState(false);
    const [path, setPath] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    async function request(method: "GET" | "POST" | "DELETE") {
        setBusy(true); setError(""); setCopied(false);
        try {
            const response = await fetch("/api/manager/client-invite", { method, cache: "no-store" });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible de charger le lien.");
            setPath(json.data.path);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Une erreur est survenue.");
        } finally { setBusy(false); }
    }

    const url = path && typeof window !== "undefined" ? new URL(path, window.location.origin).href : "";
    return <>
        <Button type="button" variant="secondary" leftIcon={<Link2 size={16} aria-hidden />} onClick={() => { setOpen(true); void request("GET"); }}>Inviter un client</Button>
        <Modal isOpen={open} onClose={() => setOpen(false)} title="Inviter vos clients" description="Un même lien pour tous vos futurs clients.">
            <div className="space-y-5">
                <p className="text-sm leading-6 text-ink-2">Partagez ce lien : chaque client crée son compte, son espace et ses briefs de mission. Vous préparez les missions et décidez de leur activation.</p>
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                {path ? <>
                    <Input label="Lien d’inscription de l’agence" value={url} readOnly onFocus={(event) => event.target.select()} />
                    <div className="flex flex-wrap gap-3">
                        <Button disabled={busy} leftIcon={<Copy className="h-4 w-4" />} onClick={async () => {
                            try { await navigator.clipboard.writeText(url); setCopied(true); }
                            catch { setError("Sélectionnez le lien ci-dessus pour le copier."); }
                        }}>{copied ? "Lien copié" : "Copier le lien"}</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => void request("DELETE")}>Désactiver ce lien</Button>
                    </div>
                    <p className="text-xs leading-5 text-ink-3" role="status">{copied ? "Le lien est prêt à être partagé." : "Le lien reste utilisable jusqu’à sa désactivation. Les comptes déjà créés conservent leur accès."}</p>
                </> : <Button isLoading={busy} onClick={() => void request("POST")}>Créer le lien d’invitation</Button>}
            </div>
        </Modal>
    </>;
}
