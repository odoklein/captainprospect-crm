"use client";

/**
 * ============================================================
 * AssistantLauncher — Floating Assistant Widget
 * ============================================================
 * Mounted in manager layout. Powered by assistant-ui AssistantModal
 * and OpenAI low-cost models (gpt-4o-mini). Hidden on the full-page
 * assistant, where it would only open a second copy of the same chat.
 */

import { usePathname } from "next/navigation";
import { AssistantModal } from "@/components/assistant-ui/AssistantModal";

export default function AssistantLauncher() {
    const pathname = usePathname();
    if (pathname === "/manager/assistant") return null;
    return <AssistantModal />;
}
