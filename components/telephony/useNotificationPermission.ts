"use client";

// Whether the browser may show desktop notifications (incoming calls, callbacks),
// kept in sync with the site permission. Shared by the avatar's line ring, the
// account menu and Paramètres → Ma ligne.

import { useCallback, useState, useSyncExternalStore } from "react";

export type NotificationPermissionState = NotificationPermission | "unsupported";

function subscribe(onChange: () => void) {
    let status: PermissionStatus | null = null;
    navigator.permissions
        ?.query({ name: "notifications" as PermissionName })
        .then((s) => {
            status = s;
            s.onchange = onChange;
        })
        .catch(() => {});
    return () => {
        if (status) status.onchange = null;
    };
}

function read(): NotificationPermissionState {
    return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export function useNotificationPermission(): [NotificationPermissionState, () => Promise<void>] {
    const [, bump] = useState(0);
    const permission = useSyncExternalStore(subscribe, read, () => "default" as NotificationPermissionState);
    const request = useCallback(async () => {
        if (read() === "unsupported") return;
        await Notification.requestPermission();
        bump((n) => n + 1); // some browsers don't fire the permission change event
    }, []);
    return [permission, request];
}
