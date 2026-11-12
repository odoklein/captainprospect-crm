// ============================================
// INSTANCE IDENTITY (env only, no Node import) — who this container is in the
// control plane's registry. INSTANCE_ID is the slug the Console gives the
// agency (like "agence-nord"); INSTANCE_ADMIN_SECRET is the shared signing
// secret. Both are unset on the original Captain Prospect deployment, which
// keeps working as "no identity" (legacy behaviour wherever this is read).
// ============================================

import { runtimeEnv } from "@/lib/runtime-config/env";

const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type InstanceIdentity = { instanceId: string; adminSecret: string };

export function getInstanceIdentity(): InstanceIdentity | null {
    const instanceId = runtimeEnv("INSTANCE_ID");
    const adminSecret = runtimeEnv("INSTANCE_ADMIN_SECRET");
    if (!instanceId || !INSTANCE_ID.test(instanceId) || !adminSecret || adminSecret.length < 16) return null;
    return { instanceId, adminSecret };
}
