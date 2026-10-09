"use client";

/**
 * ============================================================
 * AssistantLauncher — Floating Assistant Widget
 * ============================================================
 * Mounted in manager layout. Powered by assistant-ui AssistantModal
 * and OpenAI low-cost models (gpt-4o-mini).
 */

import { AssistantModal } from "@/components/assistant-ui/AssistantModal";

export default function AssistantLauncher() {
    return <AssistantModal />;
}
