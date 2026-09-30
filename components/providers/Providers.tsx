"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import { createQueryClient } from "@/lib/query-client";
import OpenReplayProvider from "./OpenReplayProvider";

interface ProvidersProps {
    children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
    const [client] = useState(createQueryClient);
    return (
        <QueryClientProvider client={client}>
            {/* refetchInterval: bounds how stale a JWT's isActive/session-revoked flag
                can be — see the jwt() callback in lib/auth.ts — to ~60s even when the
                user never backgrounds the tab (SessionProvider otherwise only refetches
                on window focus). */}
            <SessionProvider refetchInterval={60}>
                <OpenReplayProvider />
                <ToastProvider position="top-right">
                    {children}
                </ToastProvider>
            </SessionProvider>
        </QueryClientProvider>
    );
}
