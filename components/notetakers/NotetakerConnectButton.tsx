"use client";

import { Suspense, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Drawer } from "@/components/ui/Drawer";

const IntegrationKeysPanel = dynamic(() => import("@/app/manager/settings/IntegrationKeysPanel").then(m => m.IntegrationKeysPanel));
const IntegrationsPanel = dynamic(() => import("@/app/manager/settings/PlatformPanels").then(m => m.IntegrationsPanel));

/** Keep the source wizard mounted while agency credentials are configured. */
export function NotetakerConnectButton({ tool, onChanged, className, children }: {
    tool?: string;
    onChanged: () => void;
    className?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
        <Drawer isOpen={open} onClose={() => { setOpen(false); onChanged(); }} title="Connecter un outil d’enregistrement" description="Configuration partagée avec votre équipe" size="xl" closeOnOverlay={false} bodyClassName="p-5 sm:p-6">
            {open && <Suspense fallback={<p role="status" className="text-sm text-slate-500">Chargement des connexions…</p>}>
                <div className="space-y-6">
                    {tool !== "leexi" && <IntegrationKeysPanel onlyGroup="meetings" initialTool={tool} />}
                    {(!tool || tool === "leexi") && <IntegrationsPanel />}
                </div>
            </Suspense>}
        </Drawer>
    </>;
}
